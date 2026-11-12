import { render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { ApiError } from '@/api/fetcher';
import { changeDocument, createReminder, deleteThing, linkThings, useGetDocument } from '@/api/generated/homeport';
import Document from '@/app/(app)/document/[id]';
import { openFile } from '@/features/library/save';
import { inApp } from '@/test/phone';
import { failed, linds, loaded, me, pending, thing, withAlex } from '@/test/samples';
import { doc, documentAnswer, id, insurance, passport } from '@/test/samples/library';

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true), canDismiss: jest.fn(() => false) };
let mockParams = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000061' };
const mockCache = { documentReminded: jest.fn(() => Promise.resolve()), documentChanged: jest.fn(() => Promise.resolve()), thingDeleted: jest.fn(() => Promise.resolve()) };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => mockParams }));
jest.mock('@/auth/session', () => ({ useSession: () => ({ status: 'signedIn' }) }));
jest.mock('@/api/cache', () => ({ useCache: () => mockCache }));
jest.mock('@/lib/ids', () => ({ newClientId: () => 'client-1' }));
jest.mock('@/features/circles/current', () => ({ useCircles: () => [mockLinds], useCircleIfAny: () => mockLinds }));
jest.mock('@/features/library/save', () => ({ openFile: jest.fn(), saveFiles: jest.fn() }));
jest.mock('@/features/sharing/AudienceSheet', () => ({
  AudienceSheet: ({ visible }: { visible: boolean }) => {
    const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
    return visible ? <Text>the audience sheet</Text> : null;
  },
}));
jest.mock('@/api/generated/homeport', () => ({
  useGetDocument: jest.fn(),
  useGetMe: jest.fn(() => mockMe),
  createReminder: jest.fn(),
  linkThings: jest.fn(),
  changeDocument: jest.fn(),
  deleteThing: jest.fn(),
}));

const mockLinds = linds;
const mockMe = loaded(me());
const asked = jest.mocked(useGetDocument) as unknown as jest.Mock;
const kept = { id: passport.id, circleId: 'c-linds' };

describe('6.8 A document', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = { id: passport.id };
    asked.mockReturnValue(loaded(documentAnswer()));
  });

  it('shows the scan as a sheet of paper, and what was read from it', async () => {
    await render(inApp(<Document />));
    expect(asked).toHaveBeenCalledWith(passport.id, { day: expect.any(String) }, expect.anything());
    expect(screen.getByRole('header', { name: "Mia's passport" })).toBeOnTheScreen();
    expect(screen.getByLabelText("Mia's passport", { exact: true })).toBeOnTheScreen();
    expect(screen.getByText('Read from the scan')).toBeOnTheScreen();
    expect(screen.getByText('Born')).toBeOnTheScreen();
    expect(screen.getByText('4 Dec 2016')).toBeOnTheScreen();
    expect(screen.getByText('2 Aug 2027')).toBeOnTheScreen();
  });

  it('keeps the number out of sight until its eye is pressed', async () => {
    await render(inApp(<Document />));
    const user = userEvent.setup();
    expect(screen.getByText('•••••• 2C3')).toBeOnTheScreen();
    expect(screen.queryByText('L898902C3')).toBeNull();
    await user.press(screen.getByRole('button', { name: 'Show the number' }));
    expect(screen.getByText('L898902C3')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Hide the number' }));
    expect(screen.queryByText('L898902C3')).toBeNull();
  });

  it('says the day that matters, and a good day to be reminded on', async () => {
    await render(inApp(<Document />));
    expect(screen.getByText('Expires 2 Aug 2027')).toBeOnTheScreen();
    expect(screen.getByText('A good day to see to it: 2 January 2027.')).toBeOnTheScreen();
  });

  it('"Remind me" makes the reminder in Plan for that day, links it, and says so', async () => {
    jest.mocked(createReminder).mockResolvedValue({ id: id(70) } as never);
    jest.mocked(linkThings).mockResolvedValue(undefined);
    await render(inApp(<Document />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'Remind me' }));
    await waitFor(() => expect(mockCache.documentReminded).toHaveBeenCalledWith(kept));
    expect(createReminder).toHaveBeenCalledWith({ clientId: 'client-1', circleId: 'c-linds', title: "Mia's passport: expires 2 Aug 2027", dueOn: '2027-01-02', timeZone: expect.any(String), about: ['m-mia'] });
    expect(linkThings).toHaveBeenCalledWith(passport.id, id(70));
    expect(screen.getByText('Reminder set for 2 January 2027. It is in Plan.')).toBeOnTheScreen();
  });

  it('says a reminder is set once one is linked, and offers no second one', async () => {
    asked.mockReturnValue(loaded(documentAnswer({ document: { ...passport, inVault: false, reminderSet: true }, linked: [thing({ id: id(70), kind: 'reminder', place: 'plan', title: "Mia's passport: expires 2 Aug 2027", glance: '2 Jan 2027' })] })));
    await render(inApp(<Document />));
    expect(screen.getByText('A reminder is set for 2 Jan 2027.')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Remind me' })).toBeNull();
  });

  it('notices a passport that runs out too soon after the trip it is linked to, and lists what it is linked to', async () => {
    const trip = thing({ id: id(71), kind: 'event', place: 'plan', title: 'Norway 2027', glance: '3 to 17 April' });
    const entry = thing({ id: id(72), kind: 'vault_item', place: 'vault', title: "Mia's passport", chip: withAlex });
    asked.mockReturnValue(loaded(documentAnswer({ document: { ...passport, inVault: true, reminderSet: true }, linked: [entry, trip], clash: { trip, tripEnds: '2027-04-17', monthsLeftAfter: 4 } })));
    await render(inApp(<Document />));
    const user = userEvent.setup();
    expect(screen.getByText('Runs out 4 months after Norway 2027')).toBeOnTheScreen();
    expect(screen.getByText('Many countries want 6 months left. A reminder is set.')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Kept in the Vault. Only Alex and you can open it' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'vault-item', id: id(72) } });
    await user.press(screen.getByRole('button', { name: 'Needed for Norway 2027. 3 to 17 April' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'event', id: id(71) } });
  });

  it('draws a day that is not urgent quietly', async () => {
    asked.mockReturnValue(loaded(documentAnswer({ document: insurance, pictureUrl: null, fileName: 'home-insurance.pdf', contentType: 'application/pdf', facts: [{ label: 'Renews', text: '1 Feb 2027', date: '2027-02-01', secret: false }], remindOn: '2027-01-01' })));
    mockParams = { id: insurance.id };
    await render(inApp(<Document />));
    expect(screen.getByText('Renews 1 Feb 2027')).toBeOnTheScreen();
    // A PDF has no picture: its sheet says what kind of file it is.
    expect(screen.getByText('PDF · 3 pages · home-insurance.pdf')).toBeOnTheScreen();
  });

  it('asks for the words when none were read, and sends them', async () => {
    asked.mockReturnValue(loaded(documentAnswer({ document: doc({ id: passport.id, title: 'Letter' }), hasText: false, facts: [], dates: [], remindOn: null })));
    jest.mocked(changeDocument).mockResolvedValue(documentAnswer());
    await render(inApp(<Document />));
    const user = userEvent.setup();
    expect(screen.getByText(/^The words inside this one haven't been read\./)).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Add the words' }));
    await user.type(screen.getByLabelText('Words'), 'Valid until 01.12.2027');
    await user.press(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(mockCache.documentChanged).toHaveBeenCalledWith(kept));
    expect(changeDocument).toHaveBeenCalledWith(passport.id, { text: 'Valid until 01.12.2027' }, { day: expect.any(String) });
  });

  it('opens the file, who can see it, and renames it from the three dots', async () => {
    jest.mocked(changeDocument).mockResolvedValue(documentAnswer());
    await render(inApp(<Document />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'More' }));
    await user.press(screen.getByRole('button', { name: 'Open the file' }));
    expect(openFile).toHaveBeenCalledWith('https://files.test/home-insurance.pdf');
    await user.press(screen.getByRole('button', { name: 'More' }));
    await user.press(screen.getByRole('button', { name: 'Who can see it' }));
    expect(screen.getByText('the audience sheet')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'More' }));
    await user.press(screen.getByRole('button', { name: 'Rename' }));
    await user.clear(screen.getByLabelText('Name'));
    await user.type(screen.getByLabelText('Name'), "Mia's first passport");
    await user.press(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(changeDocument).toHaveBeenCalledWith(passport.id, { title: "Mia's first passport" }, { day: expect.any(String) }));
  });

  it('deletes it after asking, and leaves', async () => {
    jest.mocked(deleteThing).mockResolvedValue(undefined);
    await render(inApp(<Document />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'More' }));
    await user.press(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.getByRole('header', { name: 'Delete this document?' })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Delete document' }));
    await waitFor(() => expect(mockCache.thingDeleted).toHaveBeenCalledWith(kept));
    expect(deleteThing).toHaveBeenCalledWith(passport.id);
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it("offers nothing to change on someone else's document that can only be looked at", async () => {
    asked.mockReturnValue(loaded(documentAnswer({ document: { ...passport, inVault: false, mine: false, canEdit: false } })));
    await render(inApp(<Document />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'More' }));
    expect(screen.getByRole('button', { name: 'Open the file' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Rename' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
  });

  it('keeps its Back while it loads', async () => {
    asked.mockReturnValue(pending());
    await render(inApp(<Document />));
    expect(screen.getByLabelText('Loading')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Back' })).toBeOnTheScreen();
  });

  it('says so when the document is not there, or not shared with this person', async () => {
    asked.mockReturnValue(failed(new ApiError(404, 'not_found', "That isn't there any more, or it isn't shared with you.")));
    await render(inApp(<Document />));
    expect(screen.getByRole('header', { name: "This isn't available" })).toBeOnTheScreen();
  });

  it('is the "nothing at this address" page for an address that is no document', async () => {
    mockParams = { id: 'whatever' };
    asked.mockReturnValue(pending());
    await render(inApp(<Document />));
    expect(screen.getByRole('header', { name: "There's nothing at this address" })).toBeOnTheScreen();
  });
});

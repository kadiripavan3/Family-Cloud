import { render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { sendChecklistChanges, useGetAudience, useGetPage } from '@/api/generated/homeport';
import Page from '@/app/(app)/page/[id]';
import { ChangesProvider } from '@/features/notes/changes/outbox';
import { inApp } from '@/test/phone';
import { hiddenFromMia, linds, loaded, me } from '@/test/samples';
import { birthdayPage, giftIdeas, memoryStore } from '@/test/samples/notes';

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true), canDismiss: jest.fn(() => false) };
const mockCache = { listSent: jest.fn(() => Promise.resolve()), pageSent: jest.fn(() => Promise.resolve()) };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => ({ id: mockId }), useIsFocused: () => true }));
jest.mock('@/api/cache', () => ({ useCache: () => mockCache, cacheFor: () => mockCache }));
jest.mock('@/api/online', () => ({ useOnline: jest.fn(() => true) }));
jest.mock('@/features/circles/current', () => ({ useCircles: () => [mockLinds], useCircleIfAny: () => mockLinds }));
jest.mock('@/features/sharing/AudienceSheet', () => ({ AudienceSheet: () => null }));
jest.mock('@/features/notes/changes/store', () => ({ changeStore: {} }));
jest.mock('@/features/notes/MoveSheet', () => ({ MoveSheet: () => null }));
jest.mock('@/features/notes/page/LinkPicker', () => ({ LinkPicker: () => null }));
jest.mock('@/features/notes/page/send', () => ({ pickPhoto: jest.fn(), sendPhoto: jest.fn(), sendPickedFile: jest.fn() }));
jest.mock('@/features/notes/page/pickFile', () => ({ pickFile: jest.fn() }));
jest.mock('@/api/generated/homeport', () => ({
  ThingKind: { page: 'page', checklist: 'checklist', event: 'event', sheet: 'sheet' },
  useGetPage: jest.fn(),
  useGetAudience: jest.fn(),
  useGetLinks: jest.fn(() => ({ data: [] })),
  useGetMe: jest.fn(() => mockMe),
  getGetPageQueryKey: (id: string) => [`/v1/pages/${id}`],
  getGetChecklistQueryKey: (id: string) => [`/v1/checklists/${id}`],
  getPage: jest.fn(),
  getChecklist: jest.fn(),
  sendPageChanges: jest.fn(),
  sendChecklistChanges: jest.fn(),
  changePage: jest.fn(),
  sharePageLists: jest.fn(),
  deleteThing: jest.fn(),
  pinThing: jest.fn(),
  unpinThing: jest.fn(),
  fileThing: jest.fn(),
  changeFolder: jest.fn(),
  renameChecklist: jest.fn(),
}));
jest.mock('@/lib/ids', () => ({ newClientId: jest.fn(() => 'client-1') }));

const mockId = '55555555-5555-4555-8555-555555555555';
const mockLinds = linds;
const mockMe = loaded(me());
const audience = jest.mocked(useGetAudience) as unknown as jest.Mock;
const onPhone = () => inApp(<ChangesProvider store={memoryStore().store}>{<Page />}</ChangesProvider>);

describe('4.4 Keep it a surprise: a page that is hidden from one person', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (jest.mocked(useGetPage) as unknown as jest.Mock).mockReturnValue(loaded(birthdayPage()));
    audience.mockReturnValue({ data: { ...hiddenFromMia, thingId: mockId } });
    jest.mocked(sendChecklistChanges).mockImplementation(async (_id, body) => ({ answers: body.changes.map(() => ({ outcome: 'done' as const })), list: giftIdeas }));
  });

  it('says on its chip who it is hidden from, and under its title until when', async () => {
    await render(onPhone());
    expect(screen.getByText('Kids / Birthdays')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Seen by: Not Mia. Change who can see this' })).toBeOnTheScreen();
    expect(screen.getByLabelText('Title').props.value).toBe("Mia's 10th birthday");
    // Until when is on the audience sheet's answer: asked for only because the chip says it is hidden.
    expect(audience).toHaveBeenCalledWith(mockId, { query: { enabled: true } });
    expect(screen.getByText('Hidden from Mia until 4 December')).toBeOnTheScreen();
    expect(screen.getByText('Not in their search, their Activity or their calendar. It opens to them the morning after.')).toBeOnTheScreen();
  });

  it('draws the gift list inside the page, with what each costs, and ticks it there', async () => {
    await render(onPhone());
    // Its headings are small labels over what belongs to them, not headings of a text.
    expect(screen.getByText('Gift ideas')).toBeOnTheScreen();
    expect(screen.queryByRole('header', { name: 'Gift ideas' })).toBeNull();
    expect(screen.getByRole('checkbox', { name: 'Roller skates, size 33', checked: true })).toBeOnTheScreen();
    expect(screen.getByText('Alex bought them')).toBeOnTheScreen();
    expect(screen.getByText('€45')).toBeOnTheScreen();
    expect(screen.getByText('€28')).toBeOnTheScreen();
    expect(screen.getByText('€90')).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('checkbox', { name: 'Watercolour set' }));
    await waitFor(() => expect(sendChecklistChanges).toHaveBeenCalledWith(giftIdeas.id, { changes: [{ op: 'change', itemId: 'i-paints', change: { done: true } }] }));
  });

  it("links to the party's event, its budget and its list, each as it stands today", async () => {
    await render(onPhone());
    expect(screen.getByText('The party')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: "Mia's 10th birthday party. Event. Sat 5 Dec, 14:00" })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Party budget. Sheet. €180 of €250' })).toBeOnTheScreen();
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Party prep. List. 4 of 9 done' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'checklist', id: 'l-prep' } });
    await user.press(screen.getByRole('button', { name: /^Party budget\./ }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'sheet', id: 's-party' } });
  });

  it('says so without a day when it is hidden until someone changes that', async () => {
    audience.mockReturnValue({ data: { ...hiddenFromMia, people: hiddenFromMia.people.map((person) => ({ ...person, hiddenThrough: null })) } });
    await render(onPhone());
    expect(screen.getByText('Hidden from Mia')).toBeOnTheScreen();
    expect(screen.getByText('Not in their search, their Activity or their calendar, until you change it.')).toBeOnTheScreen();
  });

  it('names who it is hidden from by the chip alone while the sheet has not answered', async () => {
    audience.mockReturnValue({ data: undefined });
    await render(onPhone());
    expect(screen.getByText('Hidden from Mia')).toBeOnTheScreen();
  });
});

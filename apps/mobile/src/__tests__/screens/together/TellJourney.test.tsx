import { act, render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { ApiError } from '@/api/fetcher';
import { changeJourneyDraft, deleteJourneyDraft, draftJourney, useGetJourneyDraft } from '@/api/generated/homeport';
import TellJourney from '@/app/(app)/journey/tell/[id]/index';
import TellNew from '@/app/(app)/journey/tell/new';
import { tellOnly } from '@/features/journeyLink/tell/start';
import { inApp } from '@/test/phone';
import { failed, linds, loaded, pending } from '@/test/samples';
import { draft, DRAFT, id } from '@/test/samples/together';

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true), canDismiss: jest.fn(() => false), dismissAll: jest.fn(), navigate: jest.fn() };
let mockParams: { id?: string; left?: string; moment?: string; album?: string; circle?: string } = {};
const mockCache = { journeyDraftChanged: jest.fn(() => Promise.resolve()), journeyDraftGone: jest.fn() };
const mockOpenJourney = jest.fn();
let mockGuard: { on: boolean; ask?: (options: { repeat: () => void }) => void } = { on: false };
const mockStopGuard = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams,
  usePreventRemove: (on: boolean, ask: (options: { repeat: () => void }) => void) => {
    mockGuard = { on, ask };
    return mockStopGuard;
  },
}));
jest.mock('@/auth/session', () => ({ useSession: () => ({ status: 'signedIn' }) }));
jest.mock('@/api/cache', () => ({ useCache: () => mockCache }));
jest.mock('@/lib/ids', () => ({ newClientId: () => 'client-1' }));
jest.mock('@/features/circles/current', () => ({ useCircle: () => mockLinds }));
jest.mock('@/features/journeyLink/open', () => ({ useOpenJourney: () => mockOpenJourney }));
jest.mock('@/api/generated/homeport', () => ({ useGetJourneyDraft: jest.fn(), changeJourneyDraft: jest.fn(), deleteJourneyDraft: jest.fn(), draftJourney: jest.fn() }));

const mockLinds = linds;
const asked = jest.mocked(useGetJourneyDraft) as unknown as jest.Mock;
const change = jest.mocked(changeJourneyDraft);
const PHOTO = id(301);

describe('10.5 Tell it as a journey', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = { id: DRAFT };
    asked.mockReturnValue(loaded(draft()));
    change.mockImplementation((_id, request) => Promise.resolve(draft({ title: request.title ?? 'A weekend at Lake Bled' })));
  });

  it('says where the draft comes from, and what it is called', async () => {
    await render(inApp(<TellJourney />));
    expect(screen.getByRole('header', { name: 'Tell it as a journey' })).toBeOnTheScreen();
    expect(screen.getByText(/^From /)).toHaveTextContent('From Saturday at the lake and 2 days around it');
    expect(screen.getByLabelText('Title')).toHaveDisplayValue('A weekend at Lake Bled');
  });

  it('says how it was sorted, and that it is still a draft', async () => {
    await render(inApp(<TellJourney />));
    expect(screen.getByText('Sorted into 3 days')).toBeOnTheScreen();
    expect(screen.getByText('Move anything between days, or drop it. This is still a draft.')).toBeOnTheScreen();
  });

  it('shows each day with its date, its first line and how much is in it', async () => {
    await render(inApp(<TellJourney />));
    expect(screen.getByRole('button', { name: 'Day 1. Fri 6 Nov · the drive up · 9 photos. Change' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Day 2. Sat 7 Nov · on the water · 31 photos, 3 clips. Change' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Day 3. Sun 8 Nov · the walk back · 11 photos. Change' })).toBeOnTheScreen();
    // Four tiles and how many more, when a day has more than five to show.
    expect(screen.getByText('+5')).toBeOnTheScreen();
    expect(screen.getByText('+3')).toBeOnTheScreen();
  });

  it('keeps the title it had when the box is left empty', async () => {
    await render(inApp(<TellJourney />));
    await userEvent.setup().clear(screen.getByLabelText('Title'));
    expect(change).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Title')).toHaveDisplayValue('A weekend at Lake Bled');
  });

  it('saves a new title when the box is left', async () => {
    await render(inApp(<TellJourney />));
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Title'), ', all three days', { submitEditing: true });
    await waitFor(() => expect(change).toHaveBeenCalledWith(DRAFT, { title: 'A weekend at Lake Bled, all three days' }));
    await waitFor(() => expect(mockCache.journeyDraftChanged).toHaveBeenCalledWith(expect.objectContaining({ id: DRAFT, title: 'A weekend at Lake Bled, all three days' })));
    expect(change).toHaveBeenCalledTimes(1);
  });

  it("changes a day's first line", async () => {
    await render(inApp(<TellJourney />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Day 1. Fri 6 Nov · the drive up · 9 photos. Change' }));
    expect(screen.getByRole('header', { name: 'Day 1' })).toBeOnTheScreen();
    await user.type(screen.getByLabelText('What the day was'), ', over the pass', { submitEditing: true });
    await waitFor(() => expect(change).toHaveBeenCalledWith(DRAFT, { days: [{ day: '2026-11-06', line: 'the drive up, over the pass' }] }));
  });

  it('moves a photo to another day, or leaves it out', async () => {
    await render(inApp(<TellJourney />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Day 3. Sun 8 Nov · the walk back · 11 photos. Change' }));
    expect(screen.queryByRole('button', { name: 'Leave it out' })).toBeNull();
    await user.press(screen.getAllByRole('button', { name: 'Photo' })[0]!);
    await user.press(screen.getByRole('button', { name: 'Move to Day 2' }));
    await waitFor(() => expect(change).toHaveBeenCalledWith(DRAFT, { move: [{ itemId: id(220), day: '2026-11-07' }] }));
    await user.press(screen.getAllByRole('button', { name: 'Photo' })[1]!);
    await user.press(screen.getByRole('button', { name: 'Leave it out' }));
    await waitFor(() => expect(change).toHaveBeenCalledWith(DRAFT, { drop: [id(221)] }));
  });

  it('puts back a photo that was left out, which is not counted or shown on the day', async () => {
    const withOneOut = draft();
    withOneOut.days[2] = { ...withOneOut.days[2], photos: 10, items: [{ ...withOneOut.days[2]!.items![0]!, dropped: true }, withOneOut.days[2]!.items![1]!] };
    asked.mockReturnValue(loaded(withOneOut));
    await render(inApp(<TellJourney />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Day 3. Sun 8 Nov · the walk back · 10 photos. Change' }));
    await user.press(screen.getByRole('button', { name: 'Photo, left out' }));
    await user.press(screen.getByRole('button', { name: 'Put it back' }));
    await waitFor(() => expect(change).toHaveBeenCalledWith(DRAFT, { restore: [id(220)] }));
  });

  it('goes on to the screen that stands before it leaves home', async () => {
    await render(inApp(<TellJourney />));
    await userEvent.setup().press(screen.getByRole('button', { name: "Next: check what's shown" }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/journey/tell/[id]/check', params: { id: DRAFT } });
  });

  it("can't go on with everything left out", async () => {
    asked.mockReturnValue(loaded(draft({ photos: 0, clips: 0 })));
    await render(inApp(<TellJourney />));
    expect(screen.getByText('Everything is left out. Put a photo back to go on.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: "Next: check what's shown" })).toBeDisabled();
  });

  it('asks before closing, and throws the draft away', async () => {
    jest.mocked(deleteJourneyDraft).mockResolvedValue(undefined);
    await render(inApp(<TellJourney />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Close' }));
    expect(screen.getByRole('header', { name: 'Throw this draft away?' })).toBeOnTheScreen();
    expect(screen.getByText('Nothing was sent. The photos stay where they are in your Library.')).toBeOnTheScreen();
    expect(mockRouter.back).not.toHaveBeenCalled();
    await user.press(screen.getByRole('button', { name: 'Throw it away' }));
    await waitFor(() => expect(deleteJourneyDraft).toHaveBeenCalledWith(DRAFT));
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    expect(mockCache.journeyDraftGone).toHaveBeenCalledWith(DRAFT);
  });

  it("asks the same when the phone's own way back is used, and then goes on with it", async () => {
    jest.mocked(deleteJourneyDraft).mockResolvedValue(undefined);
    await render(inApp(<TellJourney />));
    expect(mockGuard.on).toBe(true);
    const repeat = jest.fn();
    await act(async () => mockGuard.ask?.({ repeat }));
    expect(screen.getByRole('header', { name: 'Throw this draft away?' })).toBeOnTheScreen();
    expect(repeat).not.toHaveBeenCalled();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Throw it away' }));
    await waitFor(() => expect(repeat).toHaveBeenCalled());
    expect(mockStopGuard).toHaveBeenCalled();
    expect(deleteJourneyDraft).toHaveBeenCalledWith(DRAFT);
    expect(mockRouter.back).not.toHaveBeenCalled();
  });

  it('stays when the answer is to keep writing', async () => {
    await render(inApp(<TellJourney />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Close' }));
    await user.press(screen.getByRole('button', { name: 'Keep writing' }));
    expect(deleteJourneyDraft).not.toHaveBeenCalled();
    expect(mockRouter.back).not.toHaveBeenCalled();
  });

  it('says when some of what was picked is from another day', async () => {
    mockParams = { id: DRAFT, left: '2' };
    await render(inApp(<TellJourney />));
    expect(screen.getByText('2 of the things you picked are from another day. A journey is drafted from one moment or one album.')).toBeOnTheScreen();
  });

  it('is no longer a draft once it was sent: it says so and leads to Journey', async () => {
    asked.mockReturnValue(loaded(draft({ status: 'posted', journeyId: id(70), openUrl: `journey://journey/${id(70)}` })));
    await render(inApp(<TellJourney />));
    expect(screen.getByText("It's in Journey already")).toBeOnTheScreen();
    expect(screen.queryByLabelText('Title')).toBeNull();
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Open in Journey' }));
    expect(mockOpenJourney).toHaveBeenCalledWith(`journey://journey/${id(70)}`);
    // Closing it asks nothing, whichever way: there is nothing to throw away.
    expect(mockGuard.on).toBe(false);
    await user.press(screen.getByRole('button', { name: 'Close' }));
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it("says why a change didn't work, in the API's words", async () => {
    change.mockRejectedValue(new ApiError(409, 'sent', 'This draft was sent already.'));
    await render(inApp(<TellJourney />));
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Title'), '!', { submitEditing: true });
    expect(await screen.findByText('This draft was sent already.')).toBeOnTheScreen();
  });

  it('keeps its Close while it loads', async () => {
    asked.mockReturnValue(pending());
    await render(inApp(<TellJourney />));
    expect(screen.getByLabelText('Loading')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Close' })).toBeOnTheScreen();
  });

  it("is not there for anyone but its writer: a draft is its writer's alone", async () => {
    asked.mockReturnValue(failed(new ApiError(404, 'not_found', "That isn't there any more, or it isn't shared with you.")));
    await render(inApp(<TellJourney />));
    expect(screen.getByRole('header', { name: "This isn't available" })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it('is the "nothing at this address" page for an address that names no draft', async () => {
    mockParams = { id: 'whatever' };
    asked.mockReturnValue(pending());
    await render(inApp(<TellJourney />));
    expect(screen.getByRole('header', { name: "There's nothing at this address" })).toBeOnTheScreen();
  });
});

describe('starting a draft: from a moment, an album, or what was picked', () => {
  const make = jest.mocked(draftJourney);
  beforeEach(() => {
    jest.clearAllMocks();
    make.mockResolvedValue(draft());
    change.mockResolvedValue(draft());
  });

  it("drafts a journey from a photo's moment and gives way to the draft", async () => {
    mockParams = { moment: PHOTO };
    await render(inApp(<TellNew />));
    expect(screen.getByText('Sorting it into days')).toBeOnTheScreen();
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith({ pathname: '/journey/tell/[id]', params: { id: DRAFT } }));
    expect(make).toHaveBeenCalledTimes(1);
    expect(make).toHaveBeenCalledWith({ clientId: 'client-1', circleId: 'c-linds', albumId: undefined, momentOf: PHOTO });
    expect(change).not.toHaveBeenCalled();
  });

  it('drafts from an album, in the circle the album is in', async () => {
    mockParams = { album: id(302), circle: id(303) };
    await render(inApp(<TellNew />));
    await waitFor(() => expect(make).toHaveBeenCalledWith({ clientId: 'client-1', circleId: id(303), albumId: id(302), momentOf: undefined }));
  });

  it('keeps only what was picked in, and counts what is not in the draft at all', async () => {
    mockParams = { moment: PHOTO };
    tellOnly([id(201), id(202), id(999)]);
    await render(inApp(<TellNew />));
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith({ pathname: '/journey/tell/[id]', params: { id: DRAFT, left: '1' } }));
    const dropped = change.mock.calls[0]![1].drop ?? [];
    expect(change.mock.calls[0]![0]).toBe(DRAFT);
    expect(dropped).not.toContain(id(201));
    expect(dropped).not.toContain(id(202));
    expect(dropped).toContain(id(203));
    expect(dropped).toHaveLength(16);
  });

  it("says why it couldn't be drafted, with a way to try again", async () => {
    mockParams = { moment: PHOTO };
    make.mockRejectedValueOnce(new ApiError(404, 'not_found', "We couldn't find that."));
    await render(inApp(<TellNew />));
    expect(await screen.findByText("We couldn't find that.")).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalled());
  });

  it('is the "nothing at this address" page when nothing says what to draft from', async () => {
    mockParams = {};
    await render(inApp(<TellNew />));
    expect(screen.getByRole('header', { name: "There's nothing at this address" })).toBeOnTheScreen();
    expect(make).not.toHaveBeenCalled();
  });
});

import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import { ApiError } from '@/api/fetcher';
import { changeBoard, deleteThing, useGetBoard } from '@/api/generated/homeport';
import Board from '@/app/(app)/board/[id]';
import { inApp } from '@/test/phone';
import { failed, linds, loaded, me, notMia, pending } from '@/test/samples';
import { board } from '@/test/samples/templates';

const ID = '33333333-3333-4333-8333-333333333333';
let mockParams = { id: ID };
const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), navigate: jest.fn(), dismissAll: jest.fn(), canGoBack: jest.fn(() => true), canDismiss: jest.fn(() => false) };
const mockCache = { boardSaved: jest.fn(() => Promise.resolve()), boardTouched: jest.fn(() => Promise.resolve()), thingDeleted: jest.fn(() => Promise.resolve()) };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => mockParams, useIsFocused: () => true }));
jest.mock('@/auth/session', () => ({ useSession: () => ({ status: 'signedIn' }) }));
jest.mock('@/api/cache', () => ({ useCache: () => mockCache }));
jest.mock('@/features/circles/current', () => ({ useCircle: () => mockLinds, useCircles: () => [mockLinds], useCircleIfAny: () => mockLinds }));
jest.mock('@/features/sharing/AudienceSheet', () => ({ AudienceSheet: (props: { thingId: string; visible: boolean }) => mockSheet(props) }));
jest.mock('@/api/generated/homeport', () => ({ useGetBoard: jest.fn(), useGetMe: jest.fn(() => mockMe), changeBoard: jest.fn(), deleteThing: jest.fn(), addBoardEntry: jest.fn(), changeBoardEntry: jest.fn(), removeBoardEntry: jest.fn(), actOnBoard: jest.fn() }));
jest.mock('@/lib/dates', () => ({ ...jest.requireActual('@/lib/dates'), today: () => '2026-11-11' }));

const mockLinds = linds;
const mockMe = loaded(me());
function mockSheet({ thingId, visible }: { thingId: string; visible: boolean }) {
  return visible ? <Text>{`the audience sheet for ${thingId}`}</Text> : null;
}
const asked = jest.mocked(useGetBoard) as unknown as jest.Mock;

/** A board of a template whose screen this version of the app doesn't have: the frame and nothing else. */
const toCome = (over = {}) => board({ template: 'walk_together', title: 'To the sea and back', emoji: '🏃', ...over });

describe('a board, and the frame every board stands in', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = { id: ID };
  });

  it("reads the board for this phone's day", async () => {
    asked.mockReturnValue(loaded(toCome()));
    await render(inApp(<Board />));
    expect(asked).toHaveBeenCalledWith(ID, { day: '2026-11-11' }, { query: { enabled: true, placeholderData: undefined } });
  });

  it('says a template without a screen arrives with the next update, and still has its bar', async () => {
    asked.mockReturnValue(loaded(toCome()));
    await render(inApp(<Board />));
    expect(screen.getByRole('header', { name: 'To the sea and back' })).toBeOnTheScreen();
    expect(screen.getByText('This one arrives with the next update of Homeport. Everything in it is kept, and it opens here as soon as the update is in.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Back' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Seen by: The Linds. Change who can see this' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'More' })).toBeOnTheScreen();
  });

  it("opens the one audience sheet from the chip's place in the menu too", async () => {
    asked.mockReturnValue(loaded(toCome({ chip: notMia })));
    await render(inApp(<Board />));
    expect(screen.getByRole('button', { name: 'Seen by: Not Mia. Change who can see this' })).toBeOnTheScreen();
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'More' }));
    await user.press(screen.getByRole('button', { name: 'Who can see this' }));
    expect(screen.getByText(`the audience sheet for ${ID}`)).toBeOnTheScreen();
  });

  it('renames it: the API sends the board back and the cache is told', async () => {
    const renamed = toCome({ title: 'To the lake' });
    jest.mocked(changeBoard).mockResolvedValue(renamed);
    asked.mockReturnValue(loaded(toCome()));
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'More' }));
    await user.press(screen.getByRole('button', { name: 'Rename' }));
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    await user.clear(screen.getByLabelText('Name'));
    await user.type(screen.getByLabelText('Name'), 'To the lake');
    await user.press(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(mockCache.boardSaved).toHaveBeenCalledWith(renamed));
    expect(changeBoard).toHaveBeenCalledWith(ID, { title: 'To the lake', settings: undefined }, { day: '2026-11-11' });
  });

  it('deletes it for its owner, after asking, and goes Home', async () => {
    jest.mocked(deleteThing).mockResolvedValue(undefined as never);
    asked.mockReturnValue(loaded(toCome()));
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'More' }));
    await user.press(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.getByRole('header', { name: 'Delete “To the sea and back”?' })).toBeOnTheScreen();
    expect(deleteThing).not.toHaveBeenCalled();
    await user.press(screen.getByRole('button', { name: 'Delete it' }));
    await waitFor(() => expect(mockCache.thingDeleted).toHaveBeenCalledWith(expect.objectContaining({ id: ID, circleId: 'c-linds' })));
    expect(deleteThing).toHaveBeenCalledWith(ID);
    expect(mockRouter.replace).toHaveBeenCalledWith('/');
  });

  it("says why deleting didn't work, and stays", async () => {
    jest.mocked(deleteThing).mockRejectedValue(new ApiError(403, 'not_yours', 'Only the person who made this can delete it.'));
    asked.mockReturnValue(loaded(toCome()));
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'More' }));
    await user.press(screen.getByRole('button', { name: 'Delete' }));
    await user.press(screen.getByRole('button', { name: 'Delete it' }));
    expect(await screen.findByText('Only the person who made this can delete it.')).toBeOnTheScreen();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it("offers no Delete on someone else's board, and no Rename on one that can only be looked at", async () => {
    asked.mockReturnValue(loaded(toCome({ mine: false, canEdit: false })));
    await render(inApp(<Board />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'More' }));
    expect(screen.getByRole('button', { name: 'Who can see this' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Rename' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
  });

  it('keeps its Back while it loads', async () => {
    asked.mockReturnValue(pending());
    await render(inApp(<Board />));
    expect(screen.getByLabelText('Loading')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Back' })).toBeOnTheScreen();
  });

  it('says so offline when it was never loaded', async () => {
    asked.mockReturnValue({ ...pending(), isPaused: true });
    await render(inApp(<Board />));
    expect(screen.getByText("You're offline")).toBeOnTheScreen();
  });

  it('says so when the board is not there, or not shared with this person', async () => {
    asked.mockReturnValue(failed(new ApiError(404, 'not_found', "That isn't there any more, or it isn't shared with you.")));
    await render(inApp(<Board />));
    expect(screen.getByRole('header', { name: "This isn't available" })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Go to Home' })).toBeOnTheScreen();
  });

  it('offers to try again when it could not be read', async () => {
    const answer = failed(new ApiError(500, 'error', 'Something went wrong on our side. Try again.'));
    asked.mockReturnValue(answer);
    await render(inApp(<Board />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'Try again' }));
    expect(answer.refetch).toHaveBeenCalled();
  });

  it('is the "nothing at this address" page for an address that is not a board at all', async () => {
    mockParams = { id: 'whatever' };
    asked.mockReturnValue(pending());
    await render(inApp(<Board />));
    expect(screen.getByRole('header', { name: "There's nothing at this address" })).toBeOnTheScreen();
  });
});

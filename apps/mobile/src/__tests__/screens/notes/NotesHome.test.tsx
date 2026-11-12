import { render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { ApiError } from '@/api/fetcher';
import { createFolder, unpinThing, useGetNotes } from '@/api/generated/homeport';
import { NotesHome } from '@/features/notes/NotesHome';
import { inApp } from '@/test/phone';
import { failed, linds, loaded, me, pending } from '@/test/samples';
import { folder, notesHome, pinnedGroceries } from '@/test/samples/notes';

const mockRouter = { push: jest.fn() };
const mockCache = { noteMade: jest.fn(() => Promise.resolve()), notePinned: jest.fn(() => Promise.resolve()), noteGone: jest.fn(() => Promise.resolve()), noteFiled: jest.fn(() => Promise.resolve()) };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('@/api/cache', () => ({ useCache: () => mockCache }));
jest.mock('@/features/circles/current', () => ({ useCircle: () => mockLinds, useCircles: () => [mockLinds], useCircleIfAny: () => mockLinds }));
jest.mock('@/features/notes/MoveSheet', () => ({ MoveSheet: () => null }));
jest.mock('@/api/generated/homeport', () => ({
  useGetNotes: jest.fn(),
  useGetMe: jest.fn(() => mockMe),
  createFolder: jest.fn(),
  pinThing: jest.fn(),
  unpinThing: jest.fn(),
  fileThing: jest.fn(),
  deleteThing: jest.fn(),
  changeFolder: jest.fn(),
  changePage: jest.fn(),
  renameChecklist: jest.fn(),
}));
jest.mock('@/lib/ids', () => ({ newClientId: () => 'client-1' }));

const mockLinds = linds;
const mockMe = loaded(me());
const asked = jest.mocked(useGetNotes) as unknown as jest.Mock;

describe('5.1 Notes, on Home', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    asked.mockReturnValue(loaded(notesHome()));
  });

  it('shows what is pinned first, each with a line on where it stands', async () => {
    await render(inApp(<NotesHome />));
    expect(asked).toHaveBeenCalledWith('c-linds');
    expect(screen.getByRole('header', { name: 'Pinned' })).toBeOnTheScreen();
    // A list: how much is left, and who is in it right now. A page: when it was changed.
    expect(screen.getByRole('button', { name: 'Groceries. 7 left · Alex is adding' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Wi‑Fi and smart home. Edited 2h ago' })).toBeOnTheScreen();
  });

  it('shows the spaces, each with what is in it and who it is shared with', async () => {
    await render(inApp(<NotesHome />));
    expect(screen.getByRole('button', { name: 'Home. 6 folders · 48 pages' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Kids. 4 folders · 31 pages' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: "Nora's work. 2 folders · 19 pages" })).toBeOnTheScreen();
    expect(screen.getAllByLabelText('Seen by: The Linds')).toHaveLength(2);
    expect(screen.getByLabelText('Seen by: Alex and you')).toBeOnTheScreen();
    expect(screen.getByLabelText('Seen by: Only you')).toBeOnTheScreen();
  });

  it('opens a space, a pinned thing and what changed lately', async () => {
    await render(inApp(<NotesHome />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Kids. 4 folders · 31 pages' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/folder/[id]', params: { id: 'f-kids' } });
    await user.press(screen.getByRole('button', { name: /^Groceries\./ }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'checklist', id: pinnedGroceries.id } });
    expect(screen.getByRole('header', { name: 'Lately' })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Christmas plan. Page. Not Mia or Leo' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'page', id: 'n-recent' } });
  });

  it('leads to the pages and lists that are in no folder yet, and says how many', async () => {
    await render(inApp(<NotesHome />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'Not filed. 3 pages and lists in no folder yet' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/folder/[id]', params: { id: 'unfiled', circle: 'c-linds' } });
  });

  it('leaves out what there is nothing of: pins, lately, not filed', async () => {
    asked.mockReturnValue(loaded(notesHome({ pinned: [], recent: [], unfiled: 0 })));
    await render(inApp(<NotesHome />));
    expect(screen.queryByText('Pinned')).toBeNull();
    expect(screen.queryByText('Lately')).toBeNull();
    expect(screen.queryByText('Not filed')).toBeNull();
    expect(screen.getByRole('button', { name: 'Home. 6 folders · 48 pages' })).toBeOnTheScreen();
  });

  it('lists every space behind "Spaces", and makes a new one there', async () => {
    const made = folder({ id: 'f-new', title: 'Garden', emoji: '🏡', folders: 0, pages: 0 });
    jest.mocked(createFolder).mockResolvedValue(made);
    await render(inApp(<NotesHome />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Spaces. See all' }));
    expect(screen.getAllByRole('button', { name: 'Trips. 3 folders · 2 pages' })).toHaveLength(2);
    await user.press(screen.getByRole('button', { name: 'New space' }));
    expect(screen.getByRole('header', { name: 'New space' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled();
    await user.type(screen.getByLabelText('Name'), 'Garden');
    await user.press(screen.getByRole('radio', { name: '🏠' }));
    await user.press(screen.getByRole('button', { name: 'Create' }));
    // A space is a folder at the top: no folder to put it in.
    await waitFor(() => expect(createFolder).toHaveBeenCalledWith({ clientId: 'client-1', circleId: 'c-linds', title: 'Garden', emoji: '🏠' }));
    expect(mockCache.noteMade).toHaveBeenCalledWith('c-linds');
    await waitFor(() => expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/folder/[id]', params: { id: 'f-new' } }));
  });

  it('takes a pin away from the menu of a pinned card', async () => {
    jest.mocked(unpinThing).mockResolvedValue(undefined);
    await render(inApp(<NotesHome />));
    const user = userEvent.setup();
    await user.longPress(screen.getByRole('button', { name: /^Groceries\./ }));
    await user.press(screen.getByRole('button', { name: 'Take the pin away' }));
    await waitFor(() => expect(mockCache.notePinned).toHaveBeenCalledWith({ id: pinnedGroceries.id, circleId: 'c-linds' }, false));
    expect(unpinThing).toHaveBeenCalledWith(pinnedGroceries.id);
  });

  it('offers a first space where a circle has none', async () => {
    asked.mockReturnValue(loaded(notesHome({ spaces: [], pinned: [], recent: [], unfiled: 0 })));
    await render(inApp(<NotesHome />));
    expect(screen.getByRole('header', { name: 'No spaces yet' })).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'New space' }));
    expect(screen.getByLabelText('Name')).toBeOnTheScreen();
  });

  it('draws its shape while it loads', async () => {
    asked.mockReturnValue(pending());
    await render(inApp(<NotesHome />));
    expect(screen.getByLabelText('Loading')).toBeOnTheScreen();
  });

  it('says so when it was never loaded and there is no connection', async () => {
    asked.mockReturnValue({ ...pending(), isPaused: true, isFetching: false });
    await render(inApp(<NotesHome />));
    expect(screen.getByRole('header', { name: "You're offline" })).toBeOnTheScreen();
  });

  it('says what went wrong, and asks again', async () => {
    const problem = failed(new ApiError(500, 'server', 'Something went wrong on our side. Try again.'));
    asked.mockReturnValue(problem);
    await render(inApp(<NotesHome />));
    expect(screen.getByText('Something went wrong on our side. Try again.')).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Try again' }));
    expect(problem.refetch).toHaveBeenCalledTimes(1);
  });
});

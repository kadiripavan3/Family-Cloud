import { render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { changeChecklistItem, stopUsingList, useGetWidgets, useList } from '@/api/generated/homeport';
import Lock from '@/app/(app)/jot/lock';
import { inApp } from '@/test/phone';
import { failed, loaded, pending } from '@/test/samples';
import { widgets } from '@/test/samples/jot';

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true, canDismiss: () => false };
const mockCache = { listInUseChanged: jest.fn(), checklistLineChanged: jest.fn() };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('@/ui/LightStatusBar', () => ({ LightStatusBar: () => null }));
jest.mock('@/features/circles/current', () => ({ useCircle: () => jest.requireActual<typeof import('@/test/samples')>('@/test/samples').linds }));
jest.mock('@/api/cache', () => ({ useCache: () => mockCache }));
jest.mock('@/api/generated/homeport', () => ({ useGetWidgets: jest.fn(), useList: jest.fn(), stopUsingList: jest.fn(), changeChecklistItem: jest.fn() }));

const GROCERIES = '22222222-2222-4222-8222-222222222222';
const show = (answer = widgets()) => jest.mocked(useGetWidgets).mockReturnValue(loaded(answer) as unknown as ReturnType<typeof useGetWidgets>);
/** The API's `useList` is a plain call, whatever its name looks like. */
const startUsing = jest.mocked(useList);

describe('14.5 On the iPhone Lock Screen, as the app shows it', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    startUsing.mockResolvedValue(undefined);
    jest.mocked(stopUsingList).mockResolvedValue(undefined);
    jest.mocked(changeChecklistItem).mockResolvedValue({} as Awaited<ReturnType<typeof changeChecklistItem>>);
    show();
  });

  it('waits, and says what went wrong, with the way back', async () => {
    jest.mocked(useGetWidgets).mockReturnValue(pending() as unknown as ReturnType<typeof useGetWidgets>);
    const view = await render(inApp(<Lock />));
    expect(screen.getByLabelText('Loading')).toBeOnTheScreen();
    jest.mocked(useGetWidgets).mockReturnValue(failed(new Error('down')) as unknown as ReturnType<typeof useGetWidgets>);
    await view.rerender(inApp(<Lock />));
    expect(screen.getByRole('button', { name: 'Try again' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Back' })).toBeOnTheScreen();
  });

  it('shows the three ways in before the phone is unlocked, from real data, and says they come with the phone build', async () => {
    await render(inApp(<Lock />));
    const now = new Date();
    expect(screen.getByText(new RegExp(`^(Sun|Mon|Tues|Wednes|Thurs|Fri|Satur)day ${now.getDate()} [A-Z][a-z]+$`))).toBeOnTheScreen();
    // The small widgets under the clock.
    expect(screen.getByRole('button', { name: 'Add something. Opens the jot bar' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '7 to buy. Open Groceries' })).toBeOnTheScreen();
    // The list in use, with who is using it and its first lines.
    expect(screen.getByText('Alex is at the shop')).toBeOnTheScreen();
    expect(screen.getAllByRole('checkbox').map((line) => line.props.accessibilityLabel)).toEqual(['Bananas', 'Strawberries', 'Oat milk']);
    // The pinned note.
    expect(screen.getByText('Jot it down')).toBeOnTheScreen();
    expect(screen.getByText('Press and hold to type. 3 added today.')).toBeOnTheScreen();
    expect(screen.getByText('On your Lock Screen these come with the phone build of Homeport. Here the ticks and the buttons work the same.')).toBeOnTheScreen();
  });

  it('opens the jot bar, voice and the list from the small widgets, and the bar from the note', async () => {
    await render(inApp(<Lock />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Add something. Opens the jot bar' }));
    await user.press(screen.getByRole('button', { name: 'Say it all at once' }));
    await user.press(screen.getByRole('button', { name: 'Jot it down. Opens the jot bar' }));
    expect(mockRouter.push.mock.calls.map(([to]) => to)).toEqual(['/jot', '/jot/voice', '/jot']);
    await user.press(screen.getByRole('button', { name: '7 to buy. Open Groceries' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'checklist', id: GROCERIES } });
  });

  it('ticks a line of the list in use, for real', async () => {
    await render(inApp(<Lock />));
    await userEvent.setup().press(screen.getByRole('checkbox', { name: 'Strawberries' }));
    expect(screen.getByRole('checkbox', { name: 'Strawberries', checked: true })).toBeOnTheScreen();
    await waitFor(() => expect(mockCache.checklistLineChanged).toHaveBeenCalledWith({ id: GROCERIES, circleId: 'c-linds' }));
    expect(changeChecklistItem).toHaveBeenCalledWith('i-strawberries', { done: true });
  });

  it('says which list you are using when "Use this list on the Lock Screen" is pressed, and stops again', async () => {
    const view = await render(inApp(<Lock />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Use this list on the Lock Screen' }));
    await waitFor(() => expect(mockCache.listInUseChanged).toHaveBeenCalledWith('c-linds'));
    expect(startUsing).toHaveBeenCalledWith('c-linds', { listId: GROCERIES });

    const mine = widgets();
    show(widgets({ inUse: { ...mine.inUse!, you: true } }));
    await view.rerender(inApp(<Lock />));
    expect(screen.getByText("You're using it")).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Stop using this list' }));
    await waitFor(() => expect(stopUsingList).toHaveBeenCalledWith('c-linds'));
  });

  it('offers the shopping list when no list is in use, and nothing to use when there is none', async () => {
    show(widgets({ inUse: null, addedToday: 0 }));
    const view = await render(inApp(<Lock />));
    expect(screen.queryByText('Alex is at the shop')).toBeNull();
    expect(screen.getByText('Groceries shows on the Lock Screen of everyone who may see it, with ticks, for eight hours.')).toBeOnTheScreen();
    expect(screen.getByText('Press and hold to type.')).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Use this list on the Lock Screen' }));
    await waitFor(() => expect(startUsing).toHaveBeenCalledWith('c-linds', { listId: GROCERIES }));

    show(widgets({ inUse: null, shopping: null }));
    await view.rerender(inApp(<Lock />));
    expect(screen.queryByRole('button', { name: 'Use this list on the Lock Screen' })).toBeNull();
    expect(screen.queryByRole('button', { name: /to buy/ })).toBeNull();
  });

  it("says what the API says when a list can't be used", async () => {
    const { ApiError } = jest.requireActual<typeof import('@/api/fetcher')>('@/api/fetcher');
    startUsing.mockRejectedValue(new ApiError(400, 'not_in_circle', 'Choose a list from this circle.'));
    await render(inApp(<Lock />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'Use this list on the Lock Screen' }));
    expect(await screen.findByText('Choose a list from this circle.')).toBeOnTheScreen();
  });
});

import { render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { changeChecklistItem, jot, useGetWidgets } from '@/api/generated/homeport';
import Widgets from '@/app/(app)/jot/widgets';
import { inApp } from '@/test/phone';
import { failed, loaded, pending } from '@/test/samples';
import { jotMade, widgets } from '@/test/samples/jot';

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true, canDismiss: () => false };
const mockCache = { jotFiled: jest.fn(), checklistLineChanged: jest.fn() };
let mockIds = 0;
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('@/ui/LightStatusBar', () => ({ LightStatusBar: () => null }));
jest.mock('@/features/circles/current', () => ({ useCircle: () => mockLinds(), useCircles: () => [mockLinds()], useCircleIfAny: () => mockLinds() }));
jest.mock('@/api/cache', () => ({ useCache: () => mockCache }));
jest.mock('@/lib/ids', () => ({ newClientId: () => `client-${(mockIds += 1)}` }));
jest.mock('@/api/generated/homeport', () => ({ useGetWidgets: jest.fn(), jot: jest.fn(), undoJot: jest.fn(), moveJot: jest.fn(), changeChecklistItem: jest.fn(), useGetMe: () => ({ data: undefined }) }));
const mockLinds = () => jest.requireActual<typeof import('@/test/samples')>('@/test/samples').linds;

const show = (answer = widgets()) => jest.mocked(useGetWidgets).mockReturnValue(loaded(answer) as unknown as ReturnType<typeof useGetWidgets>);

describe('14.1 Widgets on the Home Screen, as the app shows them', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIds = 0;
    jest.mocked(jot).mockResolvedValue([jotMade()]);
    jest.mocked(changeChecklistItem).mockResolvedValue({} as Awaited<ReturnType<typeof changeChecklistItem>>);
    show();
  });

  it('asks for what the widgets show with the day and the time zone of the phone; waits, and says what went wrong', async () => {
    jest.mocked(useGetWidgets).mockReturnValue(pending() as unknown as ReturnType<typeof useGetWidgets>);
    const view = await render(inApp(<Widgets />));
    expect(jest.mocked(useGetWidgets).mock.calls[0]!.slice(0, 2)).toEqual(['c-linds', { day: expect.stringMatching(/^\d{4}-\d\d-\d\d$/), timeZone: expect.any(String) }]);
    expect(screen.getByLabelText('Loading')).toBeOnTheScreen();
    jest.mocked(useGetWidgets).mockReturnValue(failed(new Error('down')) as unknown as ReturnType<typeof useGetWidgets>);
    await view.rerender(inApp(<Widgets />));
    expect(screen.getByRole('button', { name: 'Try again' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Back' })).toBeOnTheScreen();
  });

  it('draws the three widgets from real data, and says that on the Home Screen they come with the phone build', async () => {
    await render(inApp(<Widgets />));
    // Jot: the chips of what is added most.
    expect(screen.getByRole('header', { name: 'Jot' })).toBeOnTheScreen();
    expect(screen.getAllByRole('button', { name: /^Add (Milk|Eggs|Bread|Coffee)$/ })).toHaveLength(4);
    // The shopping list, with its first three lines.
    expect(screen.getByRole('button', { name: 'Groceries. 7 left' })).toBeOnTheScreen();
    expect(screen.getAllByRole('checkbox').map((line) => line.props.accessibilityLabel)).toEqual(['Bananas', 'Strawberries', 'Oat milk']);
    // What is next today.
    expect(screen.getByRole('header', { name: 'Today' })).toBeOnTheScreen();
    expect(screen.getByText('Wed 11')).toBeOnTheScreen();
    expect(screen.getByText('15:30')).toBeOnTheScreen();
    expect(screen.getByText('Dentist · Mia')).toBeOnTheScreen();
    expect(screen.getByText('€84')).toBeOnTheScreen();
    expect(screen.getByText('On your Home Screen these come with the phone build of Homeport. Here they work the same: tap a chip to add it, tick a line.')).toBeOnTheScreen();
  });

  it('adds a chip in one tap, as coming from a widget, and says where it went', async () => {
    await render(inApp(<Widgets />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'Add Milk' }));
    expect(await screen.findByText('Milk added to Groceries')).toBeOnTheScreen();
    expect(jot).toHaveBeenCalledWith('c-linds', expect.objectContaining({ text: 'Milk', source: 'widget', clientId: 'client-1' }));
    expect(mockCache.jotFiled).toHaveBeenCalledWith('c-linds', [expect.objectContaining({ id: 'j-milk' })]);
  });

  it('ticks a line for real, and keeps it where it was although the list now starts with what is left', async () => {
    const view = await render(inApp(<Widgets />));
    await userEvent.setup().press(screen.getByRole('checkbox', { name: 'Bananas' }));
    expect(screen.getByRole('checkbox', { name: 'Bananas', checked: true })).toBeOnTheScreen();
    await waitFor(() => expect(mockCache.checklistLineChanged).toHaveBeenCalledWith({ id: '22222222-2222-4222-8222-222222222222', circleId: 'c-linds' }));
    expect(changeChecklistItem).toHaveBeenCalledWith('i-bananas', { done: true });

    // The API's next answer: bananas are among the ticked now, out of the first three.
    const list = widgets().shopping!;
    show(widgets({ shopping: { ...list, left: 6, done: 2, lines: [list.lines[1]!, list.lines[2]!, { id: 'i-coffee', text: 'Coffee', done: false }, { ...list.lines[0]!, done: true }] } }));
    await view.rerender(inApp(<Widgets />));
    expect(screen.getAllByRole('checkbox').map((line) => line.props.accessibilityLabel)).toEqual(['Bananas', 'Strawberries', 'Oat milk']);
    expect(screen.getByRole('button', { name: 'Groceries. 6 left' })).toBeOnTheScreen();

    // And unticks.
    await userEvent.setup().press(screen.getByRole('checkbox', { name: 'Bananas' }));
    expect(changeChecklistItem).toHaveBeenLastCalledWith('i-bananas', { done: false });
  });

  it("opens the jot bar from the line (no typing inside a widget), voice from the mic, and things from their widgets", async () => {
    await render(inApp(<Widgets />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Type a line. Opens the jot bar' }));
    await user.press(screen.getByRole('button', { name: 'Say it all at once' }));
    await user.press(screen.getByRole('button', { name: 'See the Lock Screen' }));
    expect(mockRouter.push.mock.calls.map(([to]) => to)).toEqual(['/jot', '/jot/voice', '/jot/lock']);
    await user.press(screen.getByRole('button', { name: 'Groceries. 7 left' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'checklist', id: '22222222-2222-4222-8222-222222222222' } });
    await user.press(screen.getByRole('button', { name: '15:30. Dentist · Mia' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'event', id: 'e-dentist' } });
  });

  it('says so when there is no shopping list yet and nothing is next', async () => {
    show(widgets({ shopping: null, inUse: null, next: [], chips: [] }));
    await render(inApp(<Widgets />));
    expect(screen.getByText('Your shopping list shows here once something is on it.')).toBeOnTheScreen();
    expect(screen.getByText('Nothing else today.')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /^Add / })).toBeNull();
  });

  it("says what the API says when a chip can't be added", async () => {
    const { ApiError } = jest.requireActual<typeof import('@/api/fetcher')>('@/api/fetcher');
    jest.mocked(jot).mockRejectedValue(new ApiError(500, 'error', 'Something went wrong on our side. Try again.'));
    await render(inApp(<Widgets />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'Add Eggs' }));
    expect(await screen.findByText('Something went wrong on our side. Try again.')).toBeOnTheScreen();
  });
});

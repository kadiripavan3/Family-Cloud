import { render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { ApiError } from '@/api/fetcher';
import { addGoalEntry, changeGoal, deleteThing, removeGoalEntry, useGetGoal } from '@/api/generated/homeport';
import GoalPage from '@/app/(app)/goal/[id]';
import { shareText } from '@/lib/share';
import { inApp } from '@/test/phone';
import { failed, linds, loaded, me, pending } from '@/test/samples';
import { booksGoal, goal, goalEntry, ids, onSampleToday } from '@/test/samples/plan';

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true), canDismiss: jest.fn(() => false) };
const mockCache = { goalSaved: jest.fn(() => Promise.resolve()), goalMoved: jest.fn(() => Promise.resolve()), thingDeleted: jest.fn(() => Promise.resolve()) };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => ({ id: mockId }), useIsFocused: () => true }));
jest.mock('@/api/cache', () => ({ useCache: () => mockCache }));
jest.mock('@/lib/share', () => ({ shareText: jest.fn() }));
jest.mock('@/lib/ids', () => ({ newClientId: () => 'client-1' }));
jest.mock('@/features/circles/current', () => ({ useCircles: () => [mockLinds], useCircleIfAny: () => mockLinds }));
jest.mock('@/features/sharing/AudienceSheet', () => ({ AudienceSheet: ({ visible }: { visible: boolean }) => (visible ? mockOpen() : null) }));
jest.mock('@/api/generated/homeport', () => ({ useGetGoal: jest.fn(), useGetMe: jest.fn(() => mockMe), addGoalEntry: jest.fn(), removeGoalEntry: jest.fn(), changeGoal: jest.fn(), deleteThing: jest.fn() }));

const mockLinds = linds;
const mockMe = loaded(me());
const mockId = ids.norway;
function mockOpen() {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return <Text>the audience sheet</Text>;
}
const asked = jest.mocked(useGetGoal) as unknown as jest.Mock;

describe('7.7 A goal', () => {
  beforeAll(onSampleToday);
  afterAll(() => jest.useRealTimers());
  beforeEach(() => {
    jest.clearAllMocks();
    asked.mockReturnValue(loaded(goal()));
  });

  it('shows the ring, the numbers and the API\'s sentences on the pace, who chips in, and what was put in', async () => {
    await render(inApp(<GoalPage />));
    expect(asked).toHaveBeenCalledWith(ids.norway, { day: '2026-11-11' }, expect.anything());
    expect(screen.getByText('Goal · by March 2027')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Norway 2027' })).toBeOnTheScreen();
    expect(screen.getByText('Two weeks by train and ferry, paid for before we go')).toBeOnTheScreen();
    expect(screen.getByText('70%')).toBeOnTheScreen();
    expect(screen.getByText('€5,600')).toBeOnTheScreen();
    expect(screen.getByText('€5,600 of €8,000')).toBeOnTheScreen();
    expect(screen.getByText('On track: €120 a week gets there')).toBeOnTheScreen();
    expect(screen.getByText('All four chip in')).toBeOnTheScreen();
    // The months of the year, and the last few times something was put in.
    expect(screen.getByText('Saved each month')).toBeOnTheScreen();
    expect(screen.getByText('2026')).toBeOnTheScreen();
    expect(screen.getByLabelText('What was put in during each month of 2026')).toBeOnTheScreen();
    expect(screen.getByText('Alex added €150')).toBeOnTheScreen();
    expect(screen.getByText('1 Nov · payday')).toBeOnTheScreen();
    expect(screen.getByText('Mia added €5')).toBeOnTheScreen();
    // Where its number is read from, and what is left.
    expect(screen.getByText('Reads “Saved” in Norway budget')).toBeOnTheScreen();
    expect(screen.getByText('€2,400 to go')).toBeOnTheScreen();
    expect(screen.getByText('20 weeks left')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Add money' })).toBeOnTheScreen();
  });

  it('adds money: how much, a few words, and who put it in', async () => {
    jest.mocked(addGoalEntry).mockResolvedValue(goalEntry());
    await render(inApp(<GoalPage />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Add money' }));
    expect(screen.getByRole('header', { name: 'Add money' })).toBeOnTheScreen();
    // Nothing typed is nothing to add.
    await user.press(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByText('Write an amount, like 150 or 12.50.')).toBeOnTheScreen();
    expect(addGoalEntry).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText('How much, in euros'), '12.50');
    await user.type(screen.getByLabelText('A few words'), 'pocket money');
    await user.press(screen.getByRole('button', { name: 'Who put it in: You. Change' }));
    await user.press(screen.getByRole('radio', { name: 'Mia' }));
    await user.press(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(mockCache.goalMoved).toHaveBeenCalled());
    expect(addGoalEntry).toHaveBeenCalledWith(ids.norway, { clientId: 'client-1', amount: 1250, note: 'pocket money', day: '2026-11-11', memberId: 'm-mia' });
  });

  it('adds one to a goal that is counted by hand', async () => {
    asked.mockReturnValue(loaded(booksGoal));
    jest.mocked(addGoalEntry).mockResolvedValue(goalEntry());
    await render(inApp(<GoalPage />));
    expect(screen.getByText('Added each month')).toBeOnTheScreen();
    expect(screen.getByText('At this pace: about 22 weeks to go')).toBeOnTheScreen();
    expect(screen.getByText('Nothing has been put in yet.')).toBeOnTheScreen();
    expect(screen.getByText('Goal')).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Add one' }));
    expect(addGoalEntry).toHaveBeenCalledWith(ids.books, { clientId: 'client-1', amount: 1, day: '2026-11-11' });
    await waitFor(() => expect(mockCache.goalMoved).toHaveBeenCalled());
  });

  it('opens the list of steps of a goal that counts ticks', async () => {
    asked.mockReturnValue(loaded(goal({ how: 'ticks', unit: 'count', source: null, steps: { listId: 'l-steps', title: 'Before we go', left: 3, done: 2 }, recent: [] })));
    await render(inApp(<GoalPage />));
    expect(screen.getByText('2 of 5 steps done')).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Open the steps' }));
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'checklist', id: 'l-steps' } });
  });

  it('takes back something that was put in, after asking', async () => {
    jest.mocked(removeGoalEntry).mockResolvedValue(undefined);
    await render(inApp(<GoalPage />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Alex added €150. 1 Nov · payday. Take it back' }));
    expect(screen.getByRole('header', { name: 'Take this back?' })).toBeOnTheScreen();
    expect(screen.getByText('“Alex added €150” is removed and the ring moves back.')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Take it back' }));
    await waitFor(() => expect(mockCache.goalMoved).toHaveBeenCalled());
    expect(removeGoalEntry).toHaveBeenCalledWith('e-1');
  });

  it('says plainly why the sheet its number is read from cannot be opened yet', async () => {
    await render(inApp(<GoalPage />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'Reads “Saved” in Norway budget. Change it there and the ring moves' }));
    expect(await screen.findByText('Sheets arrive with Money. Until then this goal counts what is put in here by hand.')).toBeOnTheScreen();
  });

  it('changes it, shows who can see it, and deletes it after asking', async () => {
    const saved = goal({ title: 'Norway 2028' });
    jest.mocked(changeGoal).mockResolvedValue(saved);
    jest.mocked(deleteThing).mockResolvedValue(undefined);
    await render(inApp(<GoalPage />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'More' }));
    await user.press(screen.getByRole('button', { name: 'Who can see it' }));
    expect(screen.getByText('the audience sheet')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'More' }));
    await user.press(screen.getByRole('button', { name: 'Change' }));
    expect(screen.getByRole('header', { name: 'Change the goal' })).toBeOnTheScreen();
    expect(screen.getByDisplayValue('8000')).toBeOnTheScreen();
    await user.clear(screen.getByLabelText('What are you working towards?'));
    await user.type(screen.getByLabelText('What are you working towards?'), 'Norway 2028');
    await user.press(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(mockCache.goalSaved).toHaveBeenCalledWith(saved));
    expect(changeGoal).toHaveBeenCalledWith(ids.norway, { title: 'Norway 2028', blurb: 'Two weeks by train and ferry, paid for before we go', emoji: '', target: 800000, targetDay: '2027-03-31', day: '2026-11-11' });
    await user.press(screen.getByRole('button', { name: 'More' }));
    await user.press(screen.getByRole('button', { name: 'Delete goal' }));
    await user.press(screen.getAllByRole('button', { name: 'Delete goal' }).at(-1)!);
    await waitFor(() => expect(mockCache.thingDeleted).toHaveBeenCalled());
    expect(deleteThing).toHaveBeenCalledWith(ids.norway);
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it('hands its line to a message', async () => {
    jest.mocked(shareText).mockResolvedValue('shared');
    await render(inApp(<GoalPage />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'Share' }));
    expect(shareText).toHaveBeenCalledWith('Norway 2027 · €5,600 of €8,000 · on track for March');
  });

  it('only shows where it stands to someone who may not change it', async () => {
    asked.mockReturnValue(loaded(goal({ mine: false, canEdit: false })));
    await render(inApp(<GoalPage />));
    expect(screen.queryByRole('button', { name: 'Add money' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Take it back$/ })).toBeNull();
    expect(screen.getByText('Alex added €150')).toBeOnTheScreen();
  });

  it('keeps its Back while it loads, and says so when it is not there', async () => {
    asked.mockReturnValue(pending());
    const view = await render(inApp(<GoalPage />));
    expect(screen.getAllByLabelText('Loading').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Back' })).toBeOnTheScreen();
    asked.mockReturnValue(failed(new ApiError(404, 'not_found', "That isn't there any more, or it isn't shared with you.")));
    await view.rerender(inApp(<GoalPage />));
    expect(screen.getByRole('header', { name: "This isn't available" })).toBeOnTheScreen();
  });
});

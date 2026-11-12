import { render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { ApiError } from '@/api/fetcher';
import { addBoardEntry, changeBoard, changeBoardEntry, removeBoardEntry, useGetBoard } from '@/api/generated/homeport';
import Board from '@/app/(app)/board/[id]';
import { BOARD_ID, mockBoardCache, mockBoardRouterState } from '@/test/boards';
import { inApp } from '@/test/phone';
import { linds, loaded } from '@/test/samples';
import { mealPlanBoard, mealPlanView } from '@/test/samples/templates';

jest.mock('expo-router', () => jest.requireActual('@/test/boards').mockBoardRouter());
jest.mock('@/api/cache', () => ({ useCache: () => jest.requireActual('@/test/boards').mockBoardCache }));
jest.mock('@/api/generated/homeport', () => jest.requireActual('@/test/boards').mockBoardApi());
jest.mock('@/features/circles/current', () => ({ useCircle: () => mockLinds, useCircles: () => [mockLinds], useCircleIfAny: () => mockLinds }));
jest.mock('@/features/sharing/AudienceSheet', () => ({ AudienceSheet: () => null }));
jest.mock('@/lib/ids', () => ({ newClientId: () => 'client-1' }));
jest.mock('@/lib/dates', () => ({ ...jest.requireActual('@/lib/dates'), today: () => '2026-11-11' }));

const mockLinds = linds;
const asked = jest.mocked(useGetBoard) as unknown as jest.Mock;
const DAY = { day: '2026-11-11' };

describe('5.7 The weekly meal plan', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    asked.mockReturnValue(loaded(mealPlanBoard()));
  });

  it('shows the week with its dinners, who cooks, the recipes, and the two rows that do the work', async () => {
    await render(inApp(<Board />));
    expect(screen.getByRole('header', { name: 'Weekly meal plan' })).toBeOnTheScreen();
    expect(screen.getByText('9 to 15 November')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Seen by: The Linds. Change who can see this' })).toBeOnTheScreen();
    for (const weekday of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) expect(screen.getByText(weekday)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Monday. Tomato pasta. 25 min. Alex cooks' })).toBeOnTheScreen();
    expect(screen.getByText('40 min · Makes two dinners')).toBeOnTheScreen();
    expect(screen.getByText('Tonight · 30 min')).toBeOnTheScreen();
    expect(screen.getByText('Mia and Leo choose')).toBeOnTheScreen();
    expect(screen.getByText('From the calendar')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Thursday. Drop a recipe here' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Baked salmon. Plan it' })).toBeOnTheScreen();
    expect(screen.getByText('23 ingredients go to Groceries')).toBeOnTheScreen();
    expect(screen.getByText('Not the 6 you ticked as “at home”')).toBeOnTheScreen();
    expect(screen.getByRole('switch', { name: 'Send ingredients to Groceries' })).toBeChecked();
    expect(screen.getByLabelText('Cooking for 4')).toBeOnTheScreen();
  });

  it('drops a recipe onto a day: tap the chip, then the day', async () => {
    const after = mealPlanBoard(mealPlanView({ groceries: { listId: null, on: true, going: 28, atHome: 6 } }));
    jest.mocked(addBoardEntry).mockResolvedValue({ entryId: 'meal-new', board: after });
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Baked salmon. Plan it' }));
    expect(screen.getByText('Now tap the day for Baked salmon.')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Thursday. Drop Baked salmon here' }));
    await waitFor(() => expect(mockBoardCache.boardSaved).toHaveBeenCalledWith(after));
    expect(addBoardEntry).toHaveBeenCalledWith(BOARD_ID, { clientId: 'client-1', kind: 'meal', fields: { day: '2026-11-12', recipeId: 'recipe-salmon' } }, DAY);
    expect(screen.queryByText('Now tap the day for Baked salmon.')).toBeNull();
  });

  it('adds a dinner by hand, with its cook and what it needs', async () => {
    jest.mocked(addBoardEntry).mockResolvedValue({ entryId: 'meal-new', board: mealPlanBoard() });
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Sunday. Drop a recipe here' }));
    expect(screen.getByRole('header', { name: 'Dinner on Sunday' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Add to the plan' })).toBeDisabled();
    await user.type(screen.getByLabelText('What is it?'), 'Roast chicken');
    await user.type(screen.getByLabelText('Minutes to make'), '90');
    await user.press(screen.getByRole('button', { name: 'Alex' }));
    await user.type(screen.getByLabelText('What it needs, one per line'), 'Chicken\n\n Potatoes ');
    await user.press(screen.getByRole('button', { name: 'Add to the plan' }));
    await waitFor(() => expect(addBoardEntry).toHaveBeenCalledTimes(1));
    expect(addBoardEntry).toHaveBeenCalledWith(BOARD_ID, { clientId: 'client-1', kind: 'meal', fields: { name: 'Roast chicken', minutes: 90, ingredients: ['Chicken', 'Potatoes'], day: '2026-11-15', cookMemberId: 'm-alex' } }, DAY);
  });

  it("opens a dinner's ingredients, ticks one as at home, adds one, and takes the dinner off the plan", async () => {
    jest.mocked(changeBoardEntry).mockResolvedValue(mealPlanBoard());
    jest.mocked(addBoardEntry).mockResolvedValue({ entryId: 'ing-new', board: mealPlanBoard() });
    jest.mocked(removeBoardEntry).mockResolvedValue(undefined as never);
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Monday. Tomato pasta. 25 min. Alex cooks' }));
    expect(screen.getByRole('header', { name: 'Tomato pasta' })).toBeOnTheScreen();
    expect(screen.getByText('25 min · Alex cooks')).toBeOnTheScreen();
    expect(screen.getByRole('checkbox', { name: 'Spaghetti' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Garlic' })).toBeChecked();
    await user.press(screen.getByRole('checkbox', { name: 'Spaghetti' }));
    await waitFor(() => expect(changeBoardEntry).toHaveBeenCalledWith('ing-spaghetti', { fields: { atHome: true } }, DAY));
    await user.type(screen.getByLabelText('Add an ingredient'), 'Basil');
    await user.press(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(addBoardEntry).toHaveBeenCalledWith(BOARD_ID, { clientId: 'client-1', kind: 'ingredient', fields: { mealId: 'meal-pasta', name: 'Basil' } }, DAY));
    await user.press(screen.getByRole('button', { name: 'Take it off the plan' }));
    await waitFor(() => expect(removeBoardEntry).toHaveBeenCalledWith('meal-pasta'));
    expect(mockBoardCache.boardTouched).toHaveBeenCalledWith({ id: BOARD_ID, circleId: 'c-linds' });
  });

  it('switches Groceries off and on, and changes how many it cooks for', async () => {
    jest.mocked(changeBoard).mockResolvedValue(mealPlanBoard());
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('switch', { name: 'Send ingredients to Groceries' }));
    await waitFor(() => expect(changeBoard).toHaveBeenCalledWith(BOARD_ID, { title: undefined, settings: { toGroceries: false } }, DAY));
    await user.press(screen.getByRole('button', { name: 'Cook for one more' }));
    await waitFor(() => expect(changeBoard).toHaveBeenCalledWith(BOARD_ID, { title: undefined, settings: { cookingFor: 5 } }, DAY));
    await user.press(screen.getByRole('button', { name: 'Cook for one fewer' }));
    await waitFor(() => expect(changeBoard).toHaveBeenCalledWith(BOARD_ID, { title: undefined, settings: { cookingFor: 3 } }, DAY));
  });

  it('says what stays on the plan while Groceries is off', async () => {
    asked.mockReturnValue(loaded(mealPlanBoard(mealPlanView({ groceries: { listId: null, on: false, going: 1, atHome: 0 } }))));
    await render(inApp(<Board />));
    expect(screen.getByText('1 ingredient stays on the plan')).toBeOnTheScreen();
    expect(screen.getByText('Switch it on and they go to your shopping list')).toBeOnTheScreen();
    expect(screen.getByRole('switch', { name: 'Send ingredients to Groceries' })).not.toBeChecked();
  });

  it('opens the Groceries list from its row', async () => {
    await render(inApp(<Board />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'Open the Groceries list' }));
    expect(mockBoardRouterState.push).toHaveBeenCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'checklist', id: '22222222-2222-4222-8222-222222222222' } });
  });

  it('shows another week from More, and the way back to this one', async () => {
    const next = mealPlanBoard(mealPlanView({ weekStart: '2026-11-16', weekEnd: '2026-11-22', days: [], recipes: [] }));
    asked.mockImplementation((_id: string, params: { show?: string }) => loaded(params.show ? next : mealPlanBoard()));
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'More' }));
    expect(screen.queryByRole('button', { name: 'Back to this week' })).toBeNull();
    await user.press(screen.getByRole('button', { name: 'Next week' }));
    expect(asked).toHaveBeenCalledWith(BOARD_ID, { day: '2026-11-11', show: '2026-11-16' }, expect.anything());
    expect(screen.getByText('16 to 22 November')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'More' }));
    await user.press(screen.getByRole('button', { name: 'Back to this week' }));
    expect(screen.getByText('9 to 15 November')).toBeOnTheScreen();
  });

  it('is a week of empty days when nothing is planned, and says why a change did not work', async () => {
    const empty = mealPlanView({ days: mealPlanView().days.map((day) => ({ ...day, meals: [] })), recipes: [], groceries: { listId: null, on: true, going: 0, atHome: 0 } });
    asked.mockReturnValue(loaded(mealPlanBoard(empty)));
    jest.mocked(changeBoard).mockRejectedValue(new ApiError(403, 'not_allowed', "You can look at this, but you can't change it."));
    await render(inApp(<Board />));
    expect(screen.getAllByText('Drop a recipe here')).toHaveLength(7);
    expect(screen.getByText('0 ingredients go to Groceries')).toBeOnTheScreen();
    expect(screen.getByText('Open a dinner to tick what you have at home')).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Cook for one more' }));
    expect(await screen.findByText("You can look at this, but you can't change it.")).toBeOnTheScreen();
  });

  it('only shows the plan to someone who may look and not change', async () => {
    asked.mockReturnValue(loaded(mealPlanBoard(mealPlanView(), { canEdit: false, mine: false })));
    await render(inApp(<Board />));
    expect(screen.getByRole('button', { name: 'Thursday. Drop a recipe here' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Baked salmon. Plan it' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Cook for one more' })).toBeNull();
  });
});

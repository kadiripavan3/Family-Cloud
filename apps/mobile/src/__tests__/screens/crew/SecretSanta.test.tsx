import { render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { ApiError } from '@/api/fetcher';
import { actOnBoard, addBoardEntry, changeBoard, changeBoardEntry, removeBoardEntry, useGetBoard } from '@/api/generated/homeport';
import Board from '@/app/(app)/board/[id]';
import { formatDay } from '@/lib/dates';
import { BOARD_ID, mockBoardRouterState } from '@/test/boards';
import { inApp } from '@/test/phone';
import { crewCircle, loaded } from '@/test/samples';
import { santaBeforeTheDraw, santaBoard, santaView } from '@/test/samples/crew';

jest.mock('expo-router', () => jest.requireActual('@/test/boards').mockBoardRouter());
jest.mock('@/api/cache', () => ({ useCache: () => jest.requireActual('@/test/boards').mockBoardCache }));
jest.mock('@/api/generated/homeport', () => jest.requireActual('@/test/boards').mockBoardApi());
jest.mock('@/features/circles/current', () => ({ useCircle: () => mockCrew, useCircles: () => [mockCrew], useCircleIfAny: () => mockCrew }));
jest.mock('@/features/sharing/AudienceSheet', () => ({ AudienceSheet: () => null }));
jest.mock('@/lib/ids', () => ({ newClientId: () => 'client-1' }));
jest.mock('@/lib/dates', () => ({ ...jest.requireActual('@/lib/dates'), today: () => '2026-11-11' }));

const mockCrew = { ...crewCircle, myMemberId: 'm-crew-1' };
const asked = jest.mocked(useGetBoard) as unknown as jest.Mock;
const DAY = { day: '2026-11-11' };

describe('19.4 Secret Santa', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    asked.mockReturnValue(loaded(santaBoard()));
    jest.mocked(actOnBoard).mockResolvedValue(santaBoard());
    jest.mocked(addBoardEntry).mockResolvedValue({ entryId: 'new', board: santaBoard() });
    jest.mocked(changeBoardEntry).mockResolvedValue(santaBoard());
    jest.mocked(changeBoard).mockResolvedValue(santaBoard());
    jest.mocked(removeBoardEntry).mockResolvedValue(undefined as never);
  });

  it('shows the one name this person drew with that person\'s wishes, what everyone may know, and their own wish list', async () => {
    await render(inApp(<Board />));
    expect(screen.getByRole('header', { name: 'Secret Santa' })).toBeOnTheScreen();
    expect(screen.getByText('Only you can see this')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: "You're buying for Lena." })).toBeOnTheScreen();
    expect(screen.getByText('Up to €25. Lena would like a plant that is hard to kill, or anything from the ceramics stall.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: "I've got it" })).toBeOnTheScreen();
    expect(screen.getByText('The draw')).toBeOnTheScreen();
    expect(screen.getByText('Five names in the hat')).toBeOnTheScreen();
    expect(screen.getByText(`Drawn on ${formatDay('2026-11-01')}. Nobody can see the whole list.`)).toBeOnTheScreen();
    expect(screen.getByText("Lea and Kai can't draw each other")).toBeOnTheScreen();
    expect(screen.getByText("They're a couple")).toBeOnTheScreen();
    expect(screen.getByText('Swapped at the reunion dinner')).toBeOnTheScreen();
    expect(screen.getByText('Sat 28 Nov')).toBeOnTheScreen();
    expect(screen.getByText('Your own wish list')).toBeOnTheScreen();
    expect(screen.getByText('Good walking socks')).toBeOnTheScreen();
    expect(screen.getByText('A roll of 35 mm film')).toBeOnTheScreen();
    // Said once, under the last wish.
    expect(screen.getAllByText('Whoever has you can see this')).toHaveLength(1);
    expect(screen.getByLabelText("Something you'd like")).toBeOnTheScreen();
    // Nothing is drawn of anyone else's name: the API sent none.
    expect(screen.queryByText(/buying for (Lea|Kai|Ana|Nora)/)).toBeNull();
  });

  it('ticks "I\'ve got it", which nobody else is shown, and takes the tick back', async () => {
    const { rerender } = await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: "I've got it" }));
    await waitFor(() => expect(actOnBoard).toHaveBeenCalledWith(BOARD_ID, { verb: 'got_it', body: { got: true } }, DAY));

    const got = santaView();
    asked.mockReturnValue(loaded(santaBoard({ ...got, yours: { ...got.yours!, gotIt: true } })));
    await rerender(inApp(<Board />));
    expect(screen.getByText('Got it')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: "You've got it. Take that back" }));
    await waitFor(() => expect(actOnBoard).toHaveBeenLastCalledWith(BOARD_ID, { verb: 'got_it', body: { got: false } }, DAY));
  });

  it('opens what the swap belongs to', async () => {
    await render(inApp(<Board />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'Swapped at the reunion dinner. Sat 28 Nov' }));
    expect(mockBoardRouterState.push).toHaveBeenCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'board', id: '44444444-4444-4444-8444-444444444444' } });
  });

  it('adds a wish, changes one and takes one off the list', async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Something you'd like"), 'A corkscrew that works');
    await user.press(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(addBoardEntry).toHaveBeenCalledWith(BOARD_ID, { clientId: 'client-1', kind: 'wish', fields: { text: 'A corkscrew that works' } }, DAY));

    await user.press(screen.getByRole('button', { name: 'Good walking socks. Change it' }));
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    await user.type(screen.getByLabelText('Your wish'), ', size 39');
    await user.press(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(changeBoardEntry).toHaveBeenCalledWith('wish-socks', { fields: { text: 'Good walking socks, size 39' } }, DAY));

    await user.press(screen.getByRole('button', { name: 'A roll of 35 mm film. Change it' }));
    await user.press(screen.getByRole('button', { name: 'Take it off the list' }));
    await waitFor(() => expect(removeBoardEntry).toHaveBeenCalledWith('wish-film'));
  });

  it('draws the names before the draw, and says why when the rules leave no way to', async () => {
    asked.mockReturnValue(loaded(santaBoard(santaBeforeTheDraw)));
    await render(inApp(<Board />));
    expect(screen.getAllByText('Not drawn yet').length).toBeGreaterThan(0);
    expect(screen.getByRole('header', { name: 'Five names in the hat.' })).toBeOnTheScreen();
    expect(screen.getByText('Up to €25. When everyone is in, draw the names. Each person sees one name, and nobody sees the list.')).toBeOnTheScreen();
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Draw the names' }));
    await waitFor(() => expect(actOnBoard).toHaveBeenCalledWith(BOARD_ID, { verb: 'draw', body: {} }, DAY));

    jest.mocked(actOnBoard).mockRejectedValue(new ApiError(409, 'no_secret', 'With these rules everyone could work out who Lea draws. Take a rule away, or add a name.'));
    await user.press(screen.getByRole('button', { name: 'Draw the names' }));
    expect(await screen.findByText('With these rules everyone could work out who Lea draws. Take a rule away, or add a name.')).toBeOnTheScreen();
  });

  it('shows who is in the hat, and lets a name be taken out only before the draw', async () => {
    const { rerender } = await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Five names in the hat. See who is in it' }));
    expect(screen.getByText('The names are drawn, so the hat is closed. Who gives to whom is shown to nobody.')).toBeOnTheScreen();
    expect(screen.getByText('You')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Take Kai out of the hat' })).toBeNull();

    asked.mockReturnValue(loaded(santaBoard(santaBeforeTheDraw)));
    await rerender(inApp(<Board />));
    expect(screen.getByText('Everyone here draws one name and is drawn by one person.')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Take Kai out of the hat' }));
    await waitFor(() => expect(removeBoardEntry).toHaveBeenCalledWith('name-kai'));
  });

  it('puts someone of the circle into the hat who is not in it yet', async () => {
    const view = santaBeforeTheDraw;
    asked.mockReturnValue(loaded(santaBoard({ ...view, names: view.names.filter((one) => one.person.name !== 'Ana') })));
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'More' }));
    await user.press(screen.getByRole('button', { name: 'Who is in the hat' }));
    expect(screen.getByText('Put someone in')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Ana' }));
    await waitFor(() => expect(addBoardEntry).toHaveBeenCalledWith(BOARD_ID, { clientId: 'client-1', kind: 'name', fields: { memberId: 'm-crew-4' } }, DAY));
  });

  it('keeps two people apart before the draw, and takes such a rule away again', async () => {
    asked.mockReturnValue(loaded(santaBoard(santaBeforeTheDraw)));
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'More' }));
    await user.press(screen.getByRole('button', { name: "Two who can't draw each other" }));
    expect(screen.getByRole('button', { name: 'Keep them apart' })).toBeDisabled();
    await user.press(screen.getAllByRole('button', { name: 'Lena' })[0]!);
    await user.press(screen.getAllByRole('button', { name: 'Ana' }).pop()!);
    await user.type(screen.getByLabelText('Why (if you like)'), 'Flatmates');
    await user.press(screen.getByRole('button', { name: 'Keep them apart' }));
    await waitFor(() => expect(addBoardEntry).toHaveBeenCalledWith(BOARD_ID, { clientId: 'client-1', kind: 'apart', fields: { memberId: 'm-crew-3', otherMemberId: 'm-crew-4', why: 'Flatmates' } }, DAY));

    await user.press(screen.getByRole('button', { name: "Lea and Kai can't draw each other. They're a couple" }));
    await user.press(screen.getByRole('button', { name: 'Take this rule away' }));
    await waitFor(() => expect(removeBoardEntry).toHaveBeenCalledWith('apart-1'));
  });

  it('closes the rules once the names are drawn', async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    // A rule is plain words now, not something to press.
    expect(screen.queryByRole('button', { name: /^Lea and Kai can't draw each other/ })).toBeNull();
    await user.press(screen.getByRole('button', { name: 'More' }));
    expect(screen.queryByRole('button', { name: "Two who can't draw each other" })).toBeNull();
    expect(screen.getByRole('button', { name: 'Undo the draw' })).toBeOnTheScreen();
  });

  it('saves the budget and the swap', async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'More' }));
    await user.press(screen.getByRole('button', { name: 'Budget and swap day' }));
    expect(screen.getByLabelText('The most a present should cost')).toHaveProp('value', '25');
    expect(screen.getByRole('button', { name: 'Swap day: Sat 28 Nov. Change' })).toBeOnTheScreen();
    await user.clear(screen.getByLabelText('The most a present should cost'));
    await user.type(screen.getByLabelText('The most a present should cost'), 'lots');
    await user.press(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText('Write an amount, like 25. Leave it empty for no limit.')).toBeOnTheScreen();
    expect(changeBoard).not.toHaveBeenCalled();
    await user.clear(screen.getByLabelText('The most a present should cost'));
    await user.type(screen.getByLabelText('The most a present should cost'), '30');
    await user.press(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(changeBoard).toHaveBeenCalledWith(BOARD_ID, { title: undefined, settings: { budgetCents: 3000, swapOn: '2026-11-28', swapAt: 'the reunion dinner' } }, DAY));
  });

  it('undoes the draw after asking, and says so when someone has their present already', async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'More' }));
    await user.press(screen.getByRole('button', { name: 'Undo the draw' }));
    expect(screen.getByRole('header', { name: 'Undo the draw?' })).toBeOnTheScreen();
    jest.mocked(actOnBoard).mockRejectedValue(new ApiError(409, 'someone_has_theirs', 'Someone has their present already. The draw stays.'));
    await user.press(screen.getAllByRole('button', { name: 'Undo the draw' }).pop()!);
    await waitFor(() => expect(actOnBoard).toHaveBeenCalledWith(BOARD_ID, { verb: 'undo_draw', body: {} }, DAY));
    expect((await screen.findAllByText('Someone has their present already. The draw stays.')).length).toBeGreaterThan(0);
  });

  it('tells someone who is not in the hat so, and asks them for no wish list', async () => {
    asked.mockReturnValue(loaded(santaBoard(santaView({ inTheHat: false, yours: null, myWishes: [] }))));
    await render(inApp(<Board />));
    expect(screen.getByRole('header', { name: "You're not in the hat this time." })).toBeOnTheScreen();
    expect(screen.queryByText('Your own wish list')).toBeNull();
    expect(screen.queryByLabelText("Something you'd like")).toBeNull();
    expect(screen.queryByRole('button', { name: "I've got it" })).toBeNull();
  });

  it('says a wish list is empty, and that the person drawn has not written one', async () => {
    const view = santaView({ myWishes: [] });
    asked.mockReturnValue(loaded(santaBoard({ ...view, budgetCents: 0, yours: { ...view.yours!, wishes: [] } })));
    await render(inApp(<Board />));
    expect(screen.getByText("Lena hasn't written a wish list yet.")).toBeOnTheScreen();
    expect(screen.getByText('Nothing on it yet. Whoever draws you will be glad of a hint.')).toBeOnTheScreen();
  });
});

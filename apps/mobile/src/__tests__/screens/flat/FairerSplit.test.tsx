import { fireEvent, render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { ApiError } from '@/api/fetcher';
import { actOnBoard, addBoardEntry, removeBoardEntry, useGetBoard } from '@/api/generated/homeport';
import Board from '@/app/(app)/board/[id]';
import { BOARD_ID, mockBoardCache } from '@/test/boards';
import { inApp } from '@/test/phone';
import { loaded } from '@/test/samples';
import { electricity, flatCircle, kaiBrief, kittySplit, leasProposal, pinClock, rentSplit, share, leaBrief, lenaBrief, splitBoard, splitView, version } from '@/test/samples/flat';

jest.mock('expo-router', () => jest.requireActual('@/test/boards').mockBoardRouter());
jest.mock('@/api/cache', () => ({ useCache: () => jest.requireActual('@/test/boards').mockBoardCache }));
jest.mock('@/api/generated/homeport', () => jest.requireActual('@/test/boards').mockBoardApi());
jest.mock('@/features/circles/current', () => ({ useCircle: () => mockFlat, useCircles: () => [mockFlat], useCircleIfAny: () => mockFlat }));
jest.mock('@/features/sharing/AudienceSheet', () => ({ AudienceSheet: (props: { visible: boolean }) => mockSheet(props) }));
jest.mock('@/lib/ids', () => ({ newClientId: () => 'client-1' }));

const mockFlat = flatCircle;
function mockSheet({ visible }: { visible: boolean }) {
  const { Text } = jest.requireActual('react-native');
  return visible ? <Text>the audience sheet</Text> : null;
}
const asked = jest.mocked(useGetBoard) as unknown as jest.Mock;
const DAY = { day: '2026-11-12' };
const nudge = (name: string, actionName: 'increment' | 'decrement') => fireEvent(screen.getByRole('adjustable', { name }), 'accessibilityAction', { nativeEvent: { actionName } });

describe('18.4 A fairer split', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    pinClock();
    asked.mockReturnValue(loaded(splitBoard()));
    jest.mocked(actOnBoard).mockResolvedValue(splitBoard());
    jest.mocked(addBoardEntry).mockResolvedValue({ entryId: 'split-new', board: splitBoard() });
    jest.mocked(removeBoardEntry).mockResolvedValue(undefined as never);
  });
  afterEach(() => jest.useRealTimers());

  it("shows the rent with a slider for each person, the total, since when it counts, and the newest bill as bars", async () => {
    await render(inApp(<Board />));
    expect(screen.getByRole('header', { name: 'How we split' })).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Rent' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Bills' })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'Kitty' })).toBeOnTheScreen();
    // "Other" has nothing under it: it isn't drawn.
    expect(screen.queryByRole('radio', { name: 'Other' })).toBeNull();
    expect(screen.getByText('You · 18 m², the big room')).toBeOnTheScreen();
    expect(screen.getByText('Lea · 14 m²')).toBeOnTheScreen();
    expect(screen.getByText('Lena · 11 m², facing the street')).toBeOnTheScreen();
    expect(screen.getByRole('adjustable', { name: 'Your share of rent' })).toHaveAccessibilityValue({ text: '€372' });
    expect(screen.getByRole('adjustable', { name: "Lea's share of rent" })).toHaveAccessibilityValue({ text: '€310' });
    expect(screen.getByRole('adjustable', { name: "Lena's share of rent" })).toHaveAccessibilityValue({ text: '€268' });
    expect(screen.getByText('The rent')).toBeOnTheScreen();
    expect(screen.getByText('€950')).toBeOnTheScreen();
    expect(screen.getByText('Agreed by all three on 1 September')).toBeOnTheScreen();
    expect(screen.getByText('Drag a slider and the others move to keep the total. It counts once everyone says yes.')).toBeOnTheScreen();
    // The bill, the largest share first, to the nearest euro.
    expect(screen.getByRole('button', { name: "October's electricity, by nights at home. Lea €70. You €61. Lena €28" })).toBeOnTheScreen();
  });

  it('has who can see it on More, where the drawing has no chip in the bar', async () => {
    await render(inApp(<Board />));
    expect(screen.queryByRole('button', { name: /^Seen by/ })).toBeNull();
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'More' }));
    await user.press(screen.getByRole('button', { name: 'Who can see this' }));
    expect(screen.getByText('the audience sheet')).toBeOnTheScreen();
  });

  it('moves the others when one slider moves, and proposes the new numbers only when asked to', async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await nudge('Your share of rent', 'increment');
    expect(await screen.findByText('€373')).toBeOnTheScreen();
    expect(screen.getByText('€309')).toBeOnTheScreen();
    expect(screen.getByText('€268')).toBeOnTheScreen();
    // The total is the same, and nothing has been sent: the numbers are the viewer's own so far.
    expect(screen.getByText('€950')).toBeOnTheScreen();
    expect(screen.getByText('Not proposed yet')).toBeOnTheScreen();
    expect(screen.queryByText('Agreed by all three on 1 September')).toBeNull();
    expect(actOnBoard).not.toHaveBeenCalled();
    await user.press(screen.getByRole('button', { name: 'Propose this split' }));
    await waitFor(() =>
      expect(actOnBoard).toHaveBeenCalledWith(
        BOARD_ID,
        {
          verb: 'propose',
          body: {
            splitId: 'split-rent',
            parts: [
              { memberId: 'm-kai', cents: 37300, measure: 18, note: 'the big room' },
              { memberId: 'm-lea', cents: 30900, measure: 14, note: undefined },
              { memberId: 'm-lena', cents: 26800, measure: 11, note: 'facing the street' },
            ],
          },
        },
        DAY,
      ),
    );
    await waitFor(() => expect(mockBoardCache.boardSaved).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText('Not proposed yet')).toBeNull());
  });

  it('follows a finger dragged along a slider, and puts the numbers back', async () => {
    await render(inApp(<Board />));
    const slider = screen.getByRole('adjustable', { name: 'Your share of rent' });
    await fireEvent(slider, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 300, height: 32 } } });
    await fireEvent(slider, 'responderGrant', { nativeEvent: { pageX: 100, pageY: 10 } });
    // A tenth of the track to the right, in two moves: the others keep their part of what is left.
    await fireEvent(slider, 'responderMove', { nativeEvent: { pageX: 110, pageY: 10 } });
    await fireEvent(slider, 'responderMove', { nativeEvent: { pageX: 130, pageY: 12 } });
    await fireEvent(slider, 'responderRelease', { nativeEvent: { pageX: 130, pageY: 12 } });
    expect(await screen.findByText('€397')).toBeOnTheScreen();
    expect(screen.getByText('€297')).toBeOnTheScreen();
    expect(screen.getByText('€256')).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Put it back' }));
    expect(screen.getByText('€372')).toBeOnTheScreen();
    expect(screen.getByText('Agreed by all three on 1 September')).toBeOnTheScreen();
    expect(actOnBoard).not.toHaveBeenCalled();
  });

  it("shows someone else's proposal with what counts until everyone says yes, and says yes", async () => {
    asked.mockReturnValue(loaded(splitBoard(splitView({ splits: [rentSplit({ proposed: leasProposal }), kittySplit, electricity()], waitingForYou: 1 }))));
    await render(inApp(<Board />));
    // What is on the table is on the sliders; what counts is said under them.
    expect(screen.getByRole('adjustable', { name: 'Your share of rent' })).toHaveAccessibilityValue({ text: '€380' });
    expect(screen.getByText('Lea proposed this')).toBeOnTheScreen();
    expect(screen.getByText('Waiting for a yes from you and Lena. Until everyone says yes, the split agreed on 1 September counts: You €372, Lea €310, Lena €268.')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Take it back' })).toBeNull();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Say yes' }));
    await waitFor(() => expect(actOnBoard).toHaveBeenCalledWith(BOARD_ID, { verb: 'agree', body: { proposalId: 'proposal-new' } }, DAY));
  });

  it("takes the viewer's own proposal back while it waits", async () => {
    const mine = version({ ...leasProposal, proposedBy: kaiBrief, agreedBy: [kaiBrief], waitingFor: [leaBrief, lenaBrief], youAgreed: true, needsYou: false, yours: true });
    asked.mockReturnValue(loaded(splitBoard(splitView({ splits: [rentSplit({ proposed: mine })] }))));
    await render(inApp(<Board />));
    expect(screen.getByText('You proposed this')).toBeOnTheScreen();
    expect(screen.getByText(/^Waiting for a yes from Lea and Lena\./)).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Say yes' })).toBeNull();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Take it back' }));
    await waitFor(() => expect(removeBoardEntry).toHaveBeenCalledWith('proposal-new'));
  });

  it('shows each tab its own: the bills newest first, the kitty with its sliders', async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('radio', { name: 'Bills' }));
    expect(screen.getByRole('radio', { name: 'Bills' })).toBeChecked();
    expect(screen.queryByRole('adjustable', { name: 'Your share of rent' })).toBeNull();
    expect(screen.getAllByRole('button', { name: /^October's electricity, by nights at home/ })).toHaveLength(1);
    await user.press(screen.getByRole('radio', { name: 'Kitty' }));
    expect(screen.getByRole('adjustable', { name: 'Your share of the kitty' })).toHaveAccessibilityValue({ text: '€10' });
    expect(screen.getByText('€30')).toBeOnTheScreen();
    // A small pot moves by ten cents.
    await nudge("Lea's share of the kitty", 'decrement');
    expect(await screen.findByText('€9.90')).toBeOnTheScreen();
    // The ten cents go to one of the others whole: every share stays on a notch, and the total stays €30.
    expect(screen.getByText('€10.10')).toBeOnTheScreen();
    expect(screen.getByText('€10')).toBeOnTheScreen();
  });

  it('opens a bill with the exact shares and who has paid; the viewer ticks their own', async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: /^October's electricity/ }));
    expect(screen.getByRole('header', { name: "October's electricity" })).toBeOnTheScreen();
    expect(screen.getByText('€159.00 · 1 to 31 October · Lea paid it')).toBeOnTheScreen();
    expect(screen.getByText('€60.79 · 26 nights')).toBeOnTheScreen();
    expect(screen.getByText('€70.15 · 30 nights')).toBeOnTheScreen();
    expect(screen.getByText('€28.06 · 12 nights')).toBeOnTheScreen();
    // Lea paid the bill, so her share is paid by that; Kai ticks his own, and can't tick Lena's.
    expect(screen.getByRole('checkbox', { name: 'Lea has paid' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Lea has paid' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'You have paid' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Lena has paid' })).toBeDisabled();
    expect(screen.getByText('Agreed by all three on 5 November')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: "I've paid my €60.79" }));
    await waitFor(() => expect(actOnBoard).toHaveBeenCalledWith(BOARD_ID, { verb: 'paid', body: { splitId: 'split-electricity' } }, DAY));
    await user.press(screen.getByRole('checkbox', { name: 'You have paid' }));
    await waitFor(() => expect(actOnBoard).toHaveBeenLastCalledWith(BOARD_ID, { verb: 'paid', body: { splitId: 'split-electricity', memberId: 'm-kai', paid: true } }, DAY));
  });

  it('lets whoever paid the bill tick for the others, and says when it is settled', async () => {
    const paidByKai = electricity({
      payer: kaiBrief,
      settled: true,
      agreed: version({ id: 'proposal-electricity', way: 'nights', totalCents: 15900, shared: null, agreedOn: '2026-11-05', shares: [share(kaiBrief, 6079, { measure: 26, paid: true }), share(leaBrief, 7015, { measure: 30, paid: true }), share(lenaBrief, 2806, { measure: 12, paid: true })] }),
    });
    asked.mockReturnValue(loaded(splitBoard(splitView({ splits: [rentSplit(), paidByKai] }))));
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: /^October's electricity/ }));
    expect(screen.getByText('€159.00 · 1 to 31 October · You paid it')).toBeOnTheScreen();
    expect(screen.getByText('Every share is paid. This one is settled.')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /^I've paid my/ })).toBeNull();
    await user.press(screen.getByRole('checkbox', { name: 'Lena has paid' }));
    await waitFor(() => expect(actOnBoard).toHaveBeenCalledWith(BOARD_ID, { verb: 'paid', body: { splitId: 'split-electricity', memberId: 'm-lena', paid: false } }, DAY));
  });

  it('splits something new: by room size it asks for each room and the shared space', async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'More' }));
    await user.press(screen.getByRole('button', { name: 'Split something new' }));
    expect(screen.getByRole('button', { name: 'Propose it' })).toBeDisabled();
    await user.type(screen.getByLabelText('What is it?'), 'Garage');
    await user.type(screen.getByLabelText('How much is there to split?'), '90');
    // Opened from the rent's tab: it stands under Rent and goes by room size unless said otherwise.
    expect(screen.getByRole('button', { name: 'By room size' })).toBeSelected();
    await user.type(screen.getByLabelText('Your room, in m²'), '18');
    await user.type(screen.getByLabelText("Lea's room, in m²"), '14');
    expect(screen.getByRole('button', { name: 'Propose it' })).toBeDisabled();
    await user.type(screen.getByLabelText("Lena's room, in m²"), '11');
    await user.type(screen.getByLabelText('The shared space, in m²'), '20');
    await user.press(screen.getByRole('button', { name: 'Propose it' }));
    await waitFor(() =>
      expect(addBoardEntry).toHaveBeenCalledWith(
        BOARD_ID,
        {
          clientId: 'client-1',
          kind: 'split',
          fields: {
            name: 'Garage',
            group: 'rent',
            way: 'room',
            totalCents: 9000,
            shared: 20,
            from: undefined,
            to: undefined,
            payerMemberId: undefined,
            parts: [
              { memberId: 'm-kai', measure: 18 },
              { memberId: 'm-lea', measure: 14 },
              { memberId: 'm-lena', measure: 11 },
            ],
          },
        },
        DAY,
      ),
    );
  });

  it('splits a bill by nights at home for the days it is for, and names who paid it', async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('radio', { name: 'Bills' }));
    await user.press(screen.getByRole('button', { name: 'More' }));
    await user.press(screen.getByRole('button', { name: 'Split something new' }));
    await user.type(screen.getByLabelText('What is it?'), 'Gas');
    await user.type(screen.getByLabelText('How much is there to split?'), '48,20');
    expect(screen.getByRole('button', { name: 'By nights at home' })).toBeSelected();
    // Last month, to begin with: the bill that usually just arrived.
    expect(screen.getByRole('button', { name: 'The first day: Thu 1 Oct. Change' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'The last day: Sat 31 Oct. Change' })).toBeOnTheScreen();
    expect(screen.getByText(/^The nights each of you was away come from Heads-up/)).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Lea' }));
    await user.press(screen.getByRole('button', { name: 'Propose it' }));
    await waitFor(() => expect(addBoardEntry).toHaveBeenCalledWith(BOARD_ID, { clientId: 'client-1', kind: 'split', fields: { name: 'Gas', group: 'bills', way: 'nights', totalCents: 4820, shared: undefined, from: '2026-10-01', to: '2026-10-31', payerMemberId: 'm-lea', parts: undefined } }, DAY));
  });

  it('says so in a tab with nothing under it, and why a proposal did not work', async () => {
    asked.mockReturnValue(loaded(splitBoard(splitView({ splits: [rentSplit()] }))));
    jest.mocked(actOnBoard).mockRejectedValue(new ApiError(400, 'shares_dont_add_up', 'The shares add up to €949, but there is €950 to split.'));
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await nudge("Lena's share of rent", 'decrement');
    await user.press(await screen.findByRole('button', { name: 'Propose this split' }));
    expect(await screen.findByText('The shares add up to €949, but there is €950 to split.')).toBeOnTheScreen();
    await user.press(screen.getByRole('radio', { name: 'Bills' }));
    expect(screen.getByText('No bill is split here yet.')).toBeOnTheScreen();
    expect(screen.getAllByRole('button', { name: 'Split something new' }).length).toBeGreaterThan(0);
  });

  it('draws the sliders for someone who may only look, without letting them move', async () => {
    asked.mockReturnValue(loaded(splitBoard(splitView(), { canEdit: false, mine: false })));
    await render(inApp(<Board />));
    expect(screen.getByRole('adjustable', { name: 'Your share of rent' })).toBeDisabled();
    expect(screen.queryByText('Drag a slider and the others move to keep the total. It counts once everyone says yes.')).toBeNull();
    expect(screen.getByText('It counts because everyone said yes. A change is a new proposal, and everyone is asked again.')).toBeOnTheScreen();
  });
});

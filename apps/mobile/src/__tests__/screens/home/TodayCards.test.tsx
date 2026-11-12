import { render, screen, userEvent } from '@testing-library/react-native';

import { type TodayCard, useGetToday } from '@/api/generated/homeport';
import { useCircle } from '@/features/circles/current';
import { runsOf, TodayCards } from '@/features/today/TodayCards';
import { TodayHome } from '@/features/today/TodayHome';
import { onPhone } from '@/test/phone';
import { coupleCircle, crewCircle, linds, loaded, todayAnswer } from '@/test/samples';

const mockRouter = { push: jest.fn(), navigate: jest.fn() };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('@/features/circles/current', () => ({ useCircle: jest.fn() }));
jest.mock('@/api/generated/homeport', () => ({ useGetToday: jest.fn() }));
// Journey's cards on Today have their own test (together/OnJourney): here every card is Today's own to draw.
jest.mock('@/features/journeyLink/TodayJourneyCard', () => ({ JourneyOnToday: ({ cards, children }: { cards: unknown[]; children: (rest: unknown[]) => unknown }) => children(cards) }));

const asked = jest.mocked(useGetToday) as unknown as jest.Mock;
const OWED = 'aaaaaaaa-2222-4222-8222-222222222222';
const SANTA = 'bbbbbbbb-2222-4222-8222-222222222222';
const STORY = 'cccccccc-2222-4222-8222-222222222222';
const card = (over: Partial<TodayCard>): TodayCard => ({ thingId: OWED, kind: 'split', look: 'split', emoji: '💸', title: "You're owed for Lisbon", line: 'Lea €44 · Kai €20', figure: null, imageUrl: null, action: null, order: 0, ...over });
/** What a crew's Today is mostly made of: what they are owed (with a button), a draw, a walk, and a keepsake with a picture. */
const crewCards = [
  card({ figure: '€64', action: 'Remind', order: 1 }),
  card({ thingId: SANTA, kind: 'board', look: 'secret_santa', emoji: '🎁', title: 'Secret Santa has been drawn', line: 'You know yours. Nobody knows who has you.', order: 2 }),
  card({ thingId: STORY, kind: 'board', look: 'our_story', emoji: '❤️', title: 'Our story', line: 'Since a wedding in Piran', figure: '4,503 days', imageUrl: 'https://example.com/bench.jpg', order: 3 }),
];

describe("3.1 Today: the cards of a circle's own templates", () => {
  beforeEach(() => jest.clearAllMocks());

  it('draws each card the same way whatever sent it: what stands in front, a title, a line', async () => {
    await render(onPhone(<TodayCards cards={crewCards} />));
    expect(screen.getByText('€64')).toBeOnTheScreen();
    expect(screen.getByText("You're owed for Lisbon")).toBeOnTheScreen();
    expect(screen.getByText('Lea €44 · Kai €20')).toBeOnTheScreen();
    expect(screen.getByText('Secret Santa has been drawn')).toBeOnTheScreen();
    // A card with a picture carries its figure as a label on it.
    expect(screen.getByText('4,503 days')).toBeOnTheScreen();
    expect(screen.getByText('Since a wedding in Piran')).toBeOnTheScreen();
  });

  it('opens the thing a card is about, by its kind', async () => {
    await render(onPhone(<TodayCards cards={crewCards} />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: "€64. You're owed for Lisbon. Lea €44 · Kai €20" }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'split', id: OWED } });
    await user.press(screen.getByRole('button', { name: 'Secret Santa has been drawn. You know yours. Nobody knows who has you.' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'board', id: SANTA } });
    await user.press(screen.getByRole('button', { name: 'Our story. 4,503 days. Since a wedding in Piran' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'board', id: STORY } });
  });

  it("has a button when the card has something to do, in the API's own word, and it opens the thing too", async () => {
    await render(onPhone(<TodayCards cards={crewCards} />));
    expect(screen.getAllByRole('button', { name: /^Remind/ })).toHaveLength(1);
    await userEvent.setup().press(screen.getByRole('button', { name: "Remind. You're owed for Lisbon" }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'split', id: OWED } });
  });

  it('keeps the cards in their own order, and draws those with a picture side by side', () => {
    const shuffled = [crewCards[2]!, crewCards[0]!, card({ thingId: 'x', title: 'First', order: 0, imageUrl: 'https://example.com/a.jpg' }), crewCards[1]!];
    expect(runsOf(shuffled).map((run) => [run.pictures, run.cards.map((one) => one.title)])).toEqual([
      [true, ['First']],
      [false, ["You're owed for Lisbon", 'Secret Santa has been drawn']],
      [true, ['Our story']],
    ]);
    expect(runsOf([])).toEqual([]);
  });

  it('is nothing at all when there are no cards', async () => {
    await render(onPhone(<TodayCards cards={[]} />));
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('3.1 Today, with cards', () => {
  beforeEach(() => jest.clearAllMocks());

  it("stands above the day's list, and a day made only of cards is not an empty one", async () => {
    jest.mocked(useCircle).mockReturnValue(crewCircle);
    asked.mockReturnValue(loaded(todayAnswer({ cards: crewCards })));
    await render(onPhone(<TodayHome />));
    expect(screen.queryByRole('header', { name: 'Lisbon crew is ready' })).toBeNull();
    // With nothing in the day's list, the summary is about the first cards.
    expect(screen.getByText("You're owed for Lisbon, Secret Santa has been drawn and 1 more")).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: "Remind. You're owed for Lisbon" })).toBeOnTheScreen();
  });

  it("puts the cards between the summary and the day's list", async () => {
    jest.mocked(useCircle).mockReturnValue(coupleCircle);
    asked.mockReturnValue(
      loaded(
        todayAnswer({
          left: 1,
          cards: [card({ title: 'Alex owes you for October', line: 'From “Who pays what”', figure: '€42', action: 'Settle' })],
          items: [{ thingId: 'e-1', kind: 'event', title: 'Run together', note: 'Week 3 of couch to 5K', lead: '7:00', done: null, minute: 420, avatarUrls: [] }],
        }),
      ),
    );
    await render(onPhone(<TodayHome />));
    // The summary names the day's own things first.
    expect(screen.getAllByText('Run together')).toHaveLength(2);
    const order = screen.getAllByRole('button').map((one) => one.props.accessibilityLabel as string);
    expect(order.indexOf('€42. Alex owes you for October. From “Who pays what”')).toBeLessThan(order.indexOf('7:00. Run together. Week 3 of couch to 5K'));
    expect(order.indexOf('€42. Alex owes you for October. From “Who pays what”')).toBeGreaterThanOrEqual(0);
  });

  it('looks exactly as before for a circle nobody sends cards for', async () => {
    jest.mocked(useCircle).mockReturnValue(linds);
    asked.mockReturnValue(loaded(todayAnswer({ left: 1, items: [{ thingId: 'e-1', kind: 'event', title: 'Dentist · Mia', note: 'Alex is taking her', lead: '15:30', done: null, minute: 930, avatarUrls: [] }] })));
    await render(onPhone(<TodayHome />));
    expect(screen.getAllByRole('button').map((one) => one.props.accessibilityLabel)).toEqual(['15:30. Dentist · Mia. Alex is taking her']);
  });
});

import { render, screen, userEvent } from '@testing-library/react-native';

import { type TodayCard, useGetToday } from '@/api/generated/homeport';
import { useCircle } from '@/features/circles/current';
import { partsOf } from '@/features/today/about';
import { TodayHome } from '@/features/today/TodayHome';
import { onPhone } from '@/test/phone';
import { crewCircle, linds, loaded, todayAnswer } from '@/test/samples';

const mockRouter = { push: jest.fn(), navigate: jest.fn() };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('@/features/circles/current', () => ({ useCircle: jest.fn() }));
jest.mock('@/api/generated/homeport', () => ({ useGetToday: jest.fn() }));
// Journey's cards on Today have their own test (together/OnJourney): here every card is Today's own to draw.
jest.mock('@/features/journeyLink/TodayJourneyCard', () => ({ JourneyOnToday: ({ cards, children }: { cards: unknown[]; children: (rest: unknown[]) => unknown }) => children(cards) }));

const asked = jest.mocked(useGetToday) as unknown as jest.Mock;
const DATE = 'aaaaaaaa-2222-4222-8222-222222222222';
const SANTA = 'bbbbbbbb-2222-4222-8222-222222222222';
const STORY = 'cccccccc-2222-4222-8222-222222222222';
const WALK = 'dddddddd-2222-4222-8222-222222222222';
const card = (over: Partial<TodayCard>): TodayCard => ({ thingId: DATE, kind: 'board', look: 'find_date', emoji: '📅', title: 'Sat 28 Nov works for four of you', line: 'Reunion dinner · waiting for Kai', figure: null, imageUrl: null, action: null, order: 0, ...over });
/** What a crew's Today is mostly made of: a day that works, a draw, a walk with its figure, and a keepsake with a picture. */
const cards = [
  card({ order: 5 }),
  card({ thingId: SANTA, look: 'secret_santa', emoji: '🎁', title: 'Secret Santa has been drawn', line: 'You know yours. Nobody knows who has you.', order: 20 }),
  card({ thingId: WALK, look: 'walk_together', emoji: '🏃', title: 'Walk to Lisbon', line: '1,240 of 2,100 km · you added 31 this week', figure: '59%', order: 30 }),
  card({ thingId: STORY, look: 'our_story', emoji: '❤️', title: 'Our story', line: 'Since a wedding in Piran', figure: '4,503 days', imageUrl: 'https://example.com/bench.jpg', order: 40 }),
];
const titles = (some: readonly TodayCard[]) => some.map((one) => one.title);

describe("3.1 Today: where each of a day's cards is drawn", () => {
  it('makes the first card that is only words the headline, the others lines, and those from the first picture on the rail', () => {
    const shuffled = [cards[3]!, cards[1]!, cards[0]!, cards[2]!];
    const parts = partsOf(shuffled);
    expect(parts.headline?.title).toBe('Sat 28 Nov works for four of you');
    expect(titles(parts.lines)).toEqual(['Secret Santa has been drawn', 'Walk to Lisbon']);
    expect(titles(parts.rail)).toEqual(['Our story']);
  });

  it('keeps a card with a figure or a button out of the headline: it needs a line to show them', () => {
    const answer = card({ title: 'Six people over on Saturday', line: 'Lea · waiting for your answer', figure: 'Sat', action: 'Answer', order: 1 });
    const pay = card({ title: 'Your share of the electricity', line: '€159, split by nights at home', figure: '€61', action: 'Pay', order: 2 });
    expect(partsOf([answer, pay])).toEqual({ headline: null, lines: [answer, pay], rail: [] });
    // A later card that is only words is the headline all the same.
    expect(partsOf([answer, cards[1]!, pay]).headline?.title).toBe('Secret Santa has been drawn');
  });

  it('leaves what is sorted after the first picture in the rail, with or without a picture of its own', () => {
    const someday = card({ thingId: 'list', kind: 'checklist', look: 'checklist', emoji: '🌍', title: 'Someday', line: '14 of 60 done', order: 50 });
    const parts = partsOf([cards[3]!, someday]);
    expect(parts.headline).toBeNull();
    expect(parts.lines).toEqual([]);
    expect(titles(parts.rail)).toEqual(['Our story', 'Someday']);
    expect(partsOf([])).toEqual({ headline: null, lines: [], rail: [] });
  });
});

describe('3.1 Today, with cards', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(useCircle).mockReturnValue(crewCircle);
    asked.mockReturnValue(loaded(todayAnswer({ left: 1, cards })));
  });

  it('opens on the headline card with the ring, and a day made only of cards is not an empty one', async () => {
    await render(onPhone(<TodayHome />));
    expect(screen.queryByRole('header', { name: 'Lisbon crew is ready' })).toBeNull();
    // The headline is the card's own words, not a sum of the day.
    expect(screen.queryByText(/left today/)).toBeNull();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Sat 28 Nov works for four of you. Reunion dinner · waiting for Kai' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'board', id: DATE } });
  });

  it('draws a card as a line of the list: an emoji or a figure in front, and it opens its thing', async () => {
    await render(onPhone(<TodayHome />));
    const user = userEvent.setup();
    expect(screen.getByText('59%')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Secret Santa has been drawn. You know yours. Nobody knows who has you.' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'board', id: SANTA } });
    await user.press(screen.getByRole('button', { name: '59%. Walk to Lisbon. 1,240 of 2,100 km · you added 31 this week' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'board', id: WALK } });
  });

  it("puts the day's own things first in the list, then the cards", async () => {
    asked.mockReturnValue(loaded(todayAnswer({ left: 1, cards, items: [{ thingId: 'e-1', kind: 'event', title: 'Run together', note: 'Week 3 of couch to 5K', lead: '7:00', done: null, minute: 420, avatarUrls: [] }] })));
    await render(onPhone(<TodayHome />));
    const order = screen.getAllByRole('button').map((one) => one.props.accessibilityLabel as string);
    expect(order.indexOf('7:00. Run together. Week 3 of couch to 5K')).toBeGreaterThan(order.indexOf('Sat 28 Nov works for four of you. Reunion dinner · waiting for Kai'));
    expect(order.indexOf('7:00. Run together. Week 3 of couch to 5K')).toBeLessThan(order.indexOf('Secret Santa has been drawn. You know yours. Nobody knows who has you.'));
  });

  it("has a button when a card has something to do, in the API's own word, and it opens the thing too", async () => {
    asked.mockReturnValue(loaded(todayAnswer({ cards: [card({ thingId: SANTA, title: 'Your share of the electricity', line: '€159, split by nights at home', figure: '€61', action: 'Pay' })] })));
    await render(onPhone(<TodayHome />));
    // With no card that is only words, the headline sums the day up from its cards.
    expect(screen.getAllByText('Your share of the electricity')).toHaveLength(2);
    expect(screen.getByText('€61')).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Pay. Your share of the electricity' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'board', id: SANTA } });
  });

  it("stands a card with a picture in the rail under the kind's own heading, with its figure as a label", async () => {
    await render(onPhone(<TodayHome />));
    const user = userEvent.setup();
    expect(screen.getByText('From the crew')).toBeOnTheScreen();
    expect(screen.getByText('4,503 days')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Our story. 4,503 days. Since a wedding in Piran' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'board', id: STORY } });
    // A rail that holds the circle's own boards leads to where those start.
    await user.press(screen.getByRole('button', { name: 'From the crew. See all' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith('/templates');
  });

  it('looks exactly as before for a circle nobody sends cards for', async () => {
    jest.mocked(useCircle).mockReturnValue(linds);
    asked.mockReturnValue(loaded(todayAnswer({ left: 1, items: [{ thingId: 'e-1', kind: 'event', title: 'Dentist · Mia', note: 'Alex is taking her', lead: '15:30', done: null, minute: 930, avatarUrls: [] }] })));
    await render(onPhone(<TodayHome />));
    expect(screen.getAllByRole('button').map((one) => one.props.accessibilityLabel)).toEqual(['15:30. Dentist · Mia. Alex is taking her']);
    // The headline sums the day up from its own list, and the line is in the list: twice.
    expect(screen.getAllByText('Dentist · Mia')).toHaveLength(2);
    expect(screen.getByText('1 thing left today')).toBeOnTheScreen();
  });
});

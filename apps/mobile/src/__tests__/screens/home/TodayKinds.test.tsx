import { render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { ApiError } from '@/api/fetcher';
import { addSplitPayment, remindSplitMember, type SplitResponse, type ToPayResponse, useGetSplit, useGetToday } from '@/api/generated/homeport';
import { useCircle } from '@/features/circles/current';
import { TodayHome } from '@/features/today/TodayHome';
import { inApp } from '@/test/phone';
import { circle, coupleCircle, crewCircle, everyone, linds, loaded, member, pending, todayAnswer } from '@/test/samples';
import { coupleToday, RUN, SOMEDAY, STORY_BOARD, TUCKED_BOARD } from '@/test/samples/couple';

const mockRouter = { push: jest.fn(), navigate: jest.fn() };
const mockCache = { thingChanged: jest.fn(() => Promise.resolve()) };
// The link with Journey draws its own cards around the day (together/OnJourney has its test): here it hands every card back.
jest.mock('@/features/journeyLink/TodayJourneyCard', () => ({ JourneyOnToday: ({ cards, children }: { cards: unknown[]; children: (rest: unknown[]) => unknown }) => children(cards) }));
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('@/api/cache', () => ({ useCache: () => mockCache }));
jest.mock('@/features/circles/current', () => ({ useCircle: jest.fn() }));
jest.mock('@/api/generated/homeport', () => ({ useGetToday: jest.fn(), useGetSplit: jest.fn(), remindSplitMember: jest.fn(), addSplitPayment: jest.fn() }));
jest.mock('@/features/flat/RunningLow', () => ({ RunningLow: jest.fn(() => null) }));
jest.mock('@/lib/ids', () => ({ newClientId: () => 'client-1' }));
jest.mock('@/lib/dates', () => ({ ...jest.requireActual('@/lib/dates'), today: () => '2026-11-12' }));

const asked = jest.mocked(useGetToday) as unknown as jest.Mock;
const split = jest.mocked(useGetSplit) as unknown as jest.Mock;
const { RunningLow } = jest.requireMock<{ RunningLow: jest.Mock }>('@/features/flat/RunningLow');

const SPLIT = 'eeeeeeee-3333-4333-8333-333333333333';
const brief = (memberId: string, name: string) => ({ memberId, name, avatarUrl: null });
const toPay = (over: Partial<ToPayResponse>): ToPayResponse => ({ from: brief('m-alex-2', 'Alex'), to: brief('m-nora-2', 'Nora'), cents: 4200, youPay: false, paysYou: true, remindedAt: null, ...over });
const aSplit = (over: Partial<SplitResponse> = {}): SplitResponse => ({
  id: SPLIT,
  circleId: 'c-couple',
  title: 'October',
  currency: 'EUR',
  expenses: 3,
  totalCents: 8400,
  myBalanceCents: 4200,
  people: [],
  settle: [toPay({})],
  latest: [],
  paid: [],
  updatedAt: '2026-11-11T09:00:00Z',
  mine: true,
  canEdit: true,
  chip: everyone,
  ...over,
});
const owed = (title: string, note: string, lead: string) => ({ thingId: SPLIT, kind: 'split' as const, title, note, lead, done: null, minute: 1440, avatarUrls: ['https://example.com/alex.jpg'] });
const labels = () => screen.getAllByRole('button').map((one) => one.props.accessibilityLabel as string);

describe('3.1 Today, for two (us-today)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(useCircle).mockReturnValue(coupleCircle);
    asked.mockReturnValue(loaded(coupleToday()));
    split.mockReturnValue(loaded(aSplit()));
  });

  it("opens on the mystery date's own words, with what is on under it and the couple's keepsakes in a rail", async () => {
    await render(inApp(<TodayHome />));
    expect(screen.getByText('Friday is yours to plan')).toBeOnTheScreen();
    expect(screen.getByText('All Alex knows: “20:00, wear something warm”')).toBeOnTheScreen();
    expect(screen.getByText('The two of you')).toBeOnTheScreen();
    expect(screen.getByText('4,503 days')).toBeOnTheScreen();
    expect(screen.getByText('A match')).toBeOnTheScreen();
    expect(labels()).toEqual([
      'Friday is yours to plan. All Alex knows: “20:00, wear something warm”',
      '7:00. Run together. Week 3 of couch to 5K',
      'A note is tucked away for you. From Alex. It turns up when it turns up.',
      "€42. You're owed for October. Alex €42",
      "Settle. You're owed for October",
      'The two of you. See all',
      'Our story. 4,503 days. Since a wedding in Piran',
      'Both said yes. A match. Thai, on Saturday',
      'Someday. 14 of 60 done',
    ]);
    expect(RunningLow).not.toHaveBeenCalled();
  });

  it('opens each line and each card by its kind', async () => {
    await render(inApp(<TodayHome />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: /^7:00\. Run together/ }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'event', id: RUN } });
    // A line with no time and no tick has its kind's icon in front, and opens the board the note is tucked in.
    await user.press(screen.getByRole('button', { name: /^A note is tucked away for you/ }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'board', id: TUCKED_BOARD } });
    await user.press(screen.getByRole('button', { name: /^Our story/ }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'board', id: STORY_BOARD } });
    // The list pinned by both stands in the rail with its emoji, where it has no picture.
    await user.press(screen.getByRole('button', { name: 'Someday. 14 of 60 done' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'checklist', id: SOMEDAY } });
  });

  it('settles between two: it asks first, then marks the payment as made', async () => {
    jest.mocked(addSplitPayment).mockResolvedValue({ id: 'pay-1', from: brief('m-alex-2', 'Alex'), to: brief('m-nora-2', 'Nora'), amountCents: 4200, paidOn: '2026-11-12', createdAt: '2026-11-12T09:00:00Z' });
    await render(inApp(<TodayHome />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: "Settle. You're owed for October" }));
    expect(screen.getByText('Has Alex paid you €42?')).toBeOnTheScreen();
    expect(screen.getByText(/^It is marked as paid in “October”, for everyone who sees it\./)).toBeOnTheScreen();
    expect(addSplitPayment).not.toHaveBeenCalled();
    await user.press(screen.getByRole('button', { name: 'Yes, mark it paid' }));
    await waitFor(() => expect(mockCache.thingChanged).toHaveBeenCalledWith(expect.objectContaining({ id: SPLIT, circleId: 'c-couple' })));
    expect(addSplitPayment).toHaveBeenCalledWith(SPLIT, { clientId: 'client-1', from: 'm-alex-2', to: 'm-nora-2', amountCents: 4200 }, { day: '2026-11-12' });
    expect(screen.getByText('“October” is marked as paid.')).toBeOnTheScreen();
  });

  it('changes nothing when the answer is not yet, and says why a payment could not be marked', async () => {
    jest.mocked(addSplitPayment).mockRejectedValue(new ApiError(403, 'view_only', 'You can look at this, but not change it.'));
    await render(inApp(<TodayHome />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: "Settle. You're owed for October" }));
    await user.press(screen.getByRole('button', { name: 'Not yet' }));
    expect(addSplitPayment).not.toHaveBeenCalled();
    await user.press(screen.getByRole('button', { name: "Settle. You're owed for October" }));
    await user.press(screen.getByRole('button', { name: 'Yes, mark it paid' }));
    expect(await screen.findByText('You can look at this, but not change it.')).toBeOnTheScreen();
    expect(mockCache.thingChanged).not.toHaveBeenCalled();
  });

  it('asks whether you have paid, when you are the one who owes', async () => {
    asked.mockReturnValue(loaded(todayAnswer({ left: 1, items: [owed('You owe for October', 'Alex €42', '€42')] })));
    split.mockReturnValue(loaded(aSplit({ myBalanceCents: -4200, settle: [toPay({ from: brief('m-nora-2', 'Nora'), to: brief('m-alex-2', 'Alex'), youPay: true, paysYou: false })] })));
    await render(inApp(<TodayHome />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'Settle. You owe for October' }));
    expect(screen.getByText('Have you paid Alex €42?')).toBeOnTheScreen();
  });

  it('shows whose it is, and no button, until the split has said there is something to settle', async () => {
    split.mockReturnValue(pending());
    const view = await render(inApp(<TodayHome />));
    expect(screen.queryByRole('button', { name: /^Settle/ })).toBeNull();
    // A split that is even for this person has nothing to press either.
    split.mockReturnValue(loaded(aSplit({ myBalanceCents: 0, settle: [] })));
    await view.rerender(inApp(<TodayHome />));
    expect(screen.queryByRole('button', { name: /^Settle/ })).toBeNull();
    expect(screen.getByRole('button', { name: "€42. You're owed for October. Alex €42" })).toBeOnTheScreen();
  });
});

describe('3.1 Today, in a shared flat (flat-today)', () => {
  const flat = circle({
    id: 'c-flat',
    kind: 'flat',
    name: 'Trubarjeva 9',
    startsAs: 'circle',
    hasRoles: false,
    myMemberId: 'm-kai',
    myRole: 'adult',
    members: ['Kai', 'Lena', 'Lea'].map((name) => member({ id: `m-${name.toLowerCase()}`, circleId: 'c-flat', name, role: 'adult', you: name === 'Kai' })),
    shared: {},
  });
  const KITTY = 'aaaaaaaa-4444-4444-8444-444444444444';
  const HEADS_UP = 'bbbbbbbb-4444-4444-8444-444444444444';
  const FAIR_SPLIT = 'cccccccc-4444-4444-8444-444444444444';
  /** What the API sends Kai: the kitty, a notice that waits for his answer, his share of the electricity. */
  const flatToday = todayAnswer({
    left: 2,
    items: [
      { thingId: 'r-bins', kind: 'checklist', title: 'Bins out', note: 'Tonight · Lena', lead: null, done: false, minute: 1200, avatarUrls: ['https://example.com/lena.jpg'] },
      { thingId: HEADS_UP, kind: 'board', title: "My sister's staying, Friday to Sunday", note: 'Lena · until Sunday · everyone said fine', lead: 'Fri', done: null, minute: 1440, avatarUrls: ['https://example.com/lena.jpg'] },
    ],
    cards: [
      { thingId: KITTY, kind: 'board', look: 'kitty', emoji: '💰', title: 'The kitty is down to €6.40', line: "Running low: loo roll · Lena's turn to shop", figure: null, imageUrl: null, action: null, order: 10 },
      { thingId: HEADS_UP, kind: 'board', look: 'heads_up', emoji: '👋', title: 'Six people over on Saturday, done by midnight', line: 'Lea · waiting for your answer', figure: 'Sat', imageUrl: null, action: 'Answer', order: 20 },
      { thingId: FAIR_SPLIT, kind: 'board', look: 'fairer_split', emoji: '📊', title: 'Your share of the electricity', line: '€159, split by nights at home', figure: '€61', imageUrl: null, action: 'Pay', order: 30 },
    ],
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(useCircle).mockReturnValue(flat);
    asked.mockReturnValue(loaded(flatToday));
  });

  it("opens on the kitty, lists the day's things and then the cards with their figures and buttons", async () => {
    await render(inApp(<TodayHome />));
    expect(labels()).toEqual([
      "The kitty is down to €6.40. Running low: loo roll · Lena's turn to shop",
      'Not done yet. Bins out. Tonight · Lena',
      "Fri. My sister's staying, Friday to Sunday. Lena · until Sunday · everyone said fine",
      'Sat. Six people over on Saturday, done by midnight. Lea · waiting for your answer',
      'Answer. Six people over on Saturday, done by midnight',
      '€61. Your share of the electricity. €159, split by nights at home',
      'Pay. Your share of the electricity',
    ]);
    expect(screen.getByText('Fri')).toBeOnTheScreen();
    expect(screen.getByText('€61')).toBeOnTheScreen();
  });

  it("opens the board a button is about: what it does is done on the board's own screen", async () => {
    await render(inApp(<TodayHome />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Answer. Six people over on Saturday, done by midnight' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'board', id: HEADS_UP } });
    await user.press(screen.getByRole('button', { name: 'Pay. Your share of the electricity' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'board', id: FAIR_SPLIT } });
    await user.press(screen.getByRole('button', { name: /^The kitty is down to €6\.40/ }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'board', id: KITTY } });
  });

  it("mounts the flat's own Running low under the list, for a flat and for no other kind of circle", async () => {
    await render(inApp(<TodayHome />));
    expect(RunningLow).toHaveBeenCalledWith({ circle: flat }, undefined);
    RunningLow.mockClear();
    jest.mocked(useCircle).mockReturnValue(linds);
    await render(inApp(<TodayHome />));
    expect(RunningLow).not.toHaveBeenCalled();
  });
});

describe('3.1 Today, with friends (crew-today)', () => {
  const crewSplit = aSplit({
    circleId: 'c-crew',
    title: 'Lisbon weekend',
    myBalanceCents: 6400,
    settle: [
      toPay({ from: brief('m-crew-0', 'Lea'), to: brief('m-crew-1', 'Nora'), cents: 4400 }),
      toPay({ from: brief('m-crew-2', 'Kai'), to: brief('m-crew-1', 'Nora'), cents: 2000 }),
      toPay({ from: brief('m-crew-3', 'Lena'), to: brief('m-crew-4', 'Ana'), cents: 3100, paysYou: false }),
    ],
  });
  const crewToday = todayAnswer({
    left: 1,
    items: [owed("You're owed for Lisbon weekend", 'Lea €44 · Kai €20', '€64')],
    cards: [
      { thingId: 'b-date', kind: 'board', look: 'find_date', emoji: '📅', title: 'Sat 28 Nov works for four of you', line: 'Reunion dinner · waiting for Kai', figure: null, imageUrl: null, action: null, order: 5 },
      { thingId: 'b-santa', kind: 'board', look: 'secret_santa', emoji: '🎁', title: 'Secret Santa has been drawn', line: 'You know yours. Nobody knows who has you.', figure: null, imageUrl: null, action: null, order: 20 },
      { thingId: 'b-walk', kind: 'board', look: 'walk_together', emoji: '🏃', title: 'Walk to Lisbon', line: '1,240 of 2,100 km · you added 31 this week', figure: '59%', imageUrl: null, action: null, order: 30 },
    ],
    fresh: [
      { thingId: 'b-next', kind: 'board', title: 'Where next?', note: 'Porto it is', imageUrl: 'https://example.com/sea-cave.jpg', pill: '3 votes' },
      { thingId: 'b-word', kind: 'board', title: 'New word', note: '“doing a Kai”', imageUrl: 'https://example.com/cappadocia.jpg', pill: null },
    ],
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(useCircle).mockReturnValue(crewCircle);
    asked.mockReturnValue(loaded(crewToday));
    split.mockReturnValue(loaded(crewSplit));
  });

  it('opens on the day that works, lists what is owed and the cards, and shows what is new from the crew', async () => {
    await render(inApp(<TodayHome />));
    expect(labels()).toEqual([
      'Sat 28 Nov works for four of you. Reunion dinner · waiting for Kai',
      "€64. You're owed for Lisbon weekend. Lea €44 · Kai €20",
      "Remind. You're owed for Lisbon weekend",
      'Secret Santa has been drawn. You know yours. Nobody knows who has you.',
      '59%. Walk to Lisbon. 1,240 of 2,100 km · you added 31 this week',
      'From the crew. See all',
      'Where next?. 3 votes. Porto it is',
      'New word. “doing a Kai”',
    ]);
    // With nothing of the circle's own in the rail, the heading leads to the Library, as in a family.
    await userEvent.setup().press(screen.getByRole('button', { name: 'From the crew. See all' }));
    expect(mockRouter.navigate).toHaveBeenCalledWith({ pathname: '/', params: { place: 'library' } });
  });

  it('reminds everyone who owes you, and nobody else, and says so', async () => {
    jest.mocked(remindSplitMember).mockResolvedValue(crewSplit);
    await render(inApp(<TodayHome />));
    await userEvent.setup().press(screen.getByRole('button', { name: "Remind. You're owed for Lisbon weekend" }));
    await waitFor(() => expect(mockCache.thingChanged).toHaveBeenCalledWith(expect.objectContaining({ id: SPLIT, circleId: 'c-crew' })));
    expect(jest.mocked(remindSplitMember).mock.calls).toEqual([
      [SPLIT, 'm-crew-0'],
      [SPLIT, 'm-crew-2'],
    ]);
    expect(screen.getByText('Lea and Kai have been reminded.')).toBeOnTheScreen();
    expect(addSplitPayment).not.toHaveBeenCalled();
  });

  it("says in the API's words why a reminder could not be sent", async () => {
    jest.mocked(remindSplitMember).mockRejectedValue(new ApiError(400, 'nothing_owed', "They don't owe you anything here."));
    await render(inApp(<TodayHome />));
    await userEvent.setup().press(screen.getByRole('button', { name: "Remind. You're owed for Lisbon weekend" }));
    expect(await screen.findByText("They don't owe you anything here.")).toBeOnTheScreen();
  });

  it('offers to settle, not to remind, to someone who owes', async () => {
    asked.mockReturnValue(loaded(todayAnswer({ left: 1, items: [owed('You owe for Lisbon weekend', 'Ana €31', '€31')] })));
    split.mockReturnValue(loaded(aSplit({ circleId: 'c-crew', title: 'Lisbon weekend', myBalanceCents: -3100, settle: [toPay({ from: brief('m-crew-1', 'Nora'), to: brief('m-crew-4', 'Ana'), cents: 3100, youPay: true, paysYou: false })] })));
    await render(inApp(<TodayHome />));
    expect(screen.queryByRole('button', { name: /^Remind/ })).toBeNull();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Settle. You owe for Lisbon weekend' }));
    expect(screen.getByText('Have you paid Ana €31?')).toBeOnTheScreen();
  });
});

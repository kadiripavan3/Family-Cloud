import { act, render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import { ApiError } from '@/api/fetcher';
import { changeHomeSettings, loveJourneyEntry, type TodayCard, unloveJourneyEntry, useGetGoodnightsInfinite, useGetHomeSettings, useGetJourneyAtHome, useGetPlaces } from '@/api/generated/homeport';
import JourneyAtHome from '@/app/(app)/journey/at-home';
import { openInJourney } from '@/features/journeyLink/open';
import { JourneyOnToday } from '@/features/journeyLink/TodayJourneyCard';
import { today } from '@/lib/dates';
import { inApp } from '@/test/phone';
import { coupleCircle, failed, linds, loaded, pending } from '@/test/samples';
import { atHome, away, awayCard, ENTRY, goodnight, goodnightCard, homeSettings, id, miaBrief, NIGHT, noraBrief, pages, pastCard } from '@/test/samples/together';

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true), canDismiss: jest.fn(() => false), dismissAll: jest.fn(), navigate: jest.fn() };
const mockCache = { awayHearted: jest.fn(), homeSettingsSaved: jest.fn(() => Promise.resolve()) };
let mockCircle = linds;
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('@/api/cache', () => ({ useCache: () => mockCache }));
jest.mock('@/features/circles/current', () => ({ useCircle: () => mockCircle }));
jest.mock('@/features/journeyLink/open', () => ({ openInJourney: jest.fn(), useOpenJourney: () => mockOpenJourney }));
jest.mock('@/api/generated/homeport', () => ({
  useGetJourneyAtHome: jest.fn(),
  useGetHomeSettings: jest.fn(),
  useGetGoodnightsInfinite: jest.fn(),
  useGetPlaces: jest.fn(),
  loveJourneyEntry: jest.fn(),
  unloveJourneyEntry: jest.fn(),
  changeHomeSettings: jest.fn(),
}));

const mockOpenJourney = jest.fn();
const asked = jest.mocked(useGetJourneyAtHome) as unknown as jest.Mock;
const settings = jest.mocked(useGetHomeSettings) as unknown as jest.Mock;
const nights = jest.mocked(useGetGoodnightsInfinite) as unknown as jest.Mock;
const places = jest.mocked(useGetPlaces) as unknown as jest.Mock;
const open = jest.mocked(openInJourney);
const kitty: TodayCard = { thingId: id(50), kind: 'board', look: 'kitty', emoji: '🫙', title: 'The kitty is low', line: '€12 left', figure: '€12', imageUrl: null, action: 'Top up', order: 30 };

/** Today, as far as these tests need it: Journey's cards among the others, the others drawn as their titles. */
function Cards({ cards }: { cards: TodayCard[] }) {
  return <JourneyOnToday cards={cards}>{(rest) => <Text>{`Today draws: ${rest.map((card) => card.title).join(', ')}`}</Text>}</JourneyOnToday>;
}
/** An evening on the day the sample goodnight is for, so nothing waits for bedtime unless a test says so. */
const at = (time: string) => jest.setSystemTime(new Date(`${today()}T${time}:00`));

describe('10.8 Journey, at home: on Today', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    at('21:00');
    mockCircle = linds;
    asked.mockReturnValue(loaded(atHome({ goodnights: [goodnight({ forDay: today() })] })));
    open.mockResolvedValue('opened');
  });
  afterEach(() => jest.useRealTimers());

  it('gives someone who is away a card of their own: who, which journey, how far, how many new, and the latest entry', async () => {
    await render(inApp(<Cards cards={[awayCard]} />));
    expect(asked).toHaveBeenCalledWith('c-linds', { day: today() }, { query: { enabled: true } });
    expect(screen.getByText('Alex is on a journey')).toBeOnTheScreen();
    expect(screen.getByText('Lofoten by bike · Day 6 of 9')).toBeOnTheScreen();
    expect(screen.getByText('2 new')).toBeOnTheScreen();
    expect(screen.getByText('Journey')).toBeOnTheScreen();
    expect(screen.getByText('Day 6 · Reine')).toBeOnTheScreen();
    expect(screen.getByText('Ferry day, and finally a rest')).toBeOnTheScreen();
    expect(screen.getByText('Mia loved it')).toBeOnTheScreen();
  });

  it('draws a card that is no thing (no id, no kind) without handing it to Today, and the rest in their order', async () => {
    await render(inApp(<Cards cards={[pastCard, kitty, awayCard, goodnightCard]} />));
    // The goodnight (after bedtime) and the kitty are Today's to draw, each in its place around Alex's card.
    expect(screen.getByText('Today draws: Goodnight from Alex')).toBeOnTheScreen();
    expect(screen.getByText('Today draws: The kitty is low')).toBeOnTheScreen();
    expect(screen.getByText('Alex is on a journey')).toBeOnTheScreen();
    expect(screen.getByText('On this day')).toBeOnTheScreen();
  });

  it('is the card at once from what Today sent, before Journey at home has answered', async () => {
    asked.mockReturnValue(pending());
    await render(inApp(<Cards cards={[awayCard]} />));
    expect(screen.getByText('Alex is on a journey')).toBeOnTheScreen();
    expect(screen.getByText('2 new')).toBeOnTheScreen();
    expect(screen.queryByText('Mia loved it')).toBeNull();
  });

  it('opens the journey in Journey, and says why where that can not be done', async () => {
    await render(inApp(<Cards cards={[awayCard]} />));
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await user.press(screen.getByRole('button', { name: 'Open in Journey' }));
    expect(open).toHaveBeenLastCalledWith(away().journey.openUrl);
    open.mockResolvedValue('browser');
    await user.press(screen.getByRole('button', { name: 'Ferry day, and finally a rest. Open in Journey' }));
    await waitFor(() => expect(screen.getByText('Journey opens from here when both apps are on your phone. A browser has no app to hop to.')).toBeOnTheScreen());
  });

  it("asks whose heart it is in a home with children, and gives a child's", async () => {
    jest.mocked(loveJourneyEntry).mockResolvedValue([away()]);
    await render(inApp(<Cards cards={[awayCard]} />));
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await user.press(screen.getByRole('button', { name: 'Mia loved it. Change' }));
    expect(screen.getByRole('header', { name: 'A heart from' })).toBeOnTheScreen();
    expect(screen.getByText('It stays at home: Journey is not told.')).toBeOnTheScreen();
    expect(screen.getByRole('switch', { name: 'Mia' }).props['aria-checked']).toBe(true);
    expect(screen.getByRole('switch', { name: 'You' }).props['aria-checked']).toBe(false);
    // The dog has no heart to give.
    expect(screen.queryByRole('switch', { name: 'Biscuit' })).toBeNull();
    await user.press(screen.getByRole('switch', { name: 'Leo' }));
    await waitFor(() => expect(loveJourneyEntry).toHaveBeenCalledWith('c-linds', ENTRY, { as: 'm-leo' }));
    await waitFor(() => expect(mockCache.awayHearted).toHaveBeenCalledWith('c-linds', [away()]));
  });

  it("gives and takes back the person's own heart, said as \"You\"", async () => {
    asked.mockReturnValue(loaded(atHome({ away: [away({ latest: { ...away().latest, lovedBy: [miaBrief, noraBrief], loved: true } })] })));
    jest.mocked(unloveJourneyEntry).mockResolvedValue([away()]);
    await render(inApp(<Cards cards={[awayCard]} />));
    expect(screen.getByText('You and Mia loved it')).toBeOnTheScreen();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await user.press(screen.getByRole('button', { name: 'You and Mia loved it. Change' }));
    await user.press(screen.getByRole('switch', { name: 'You' }));
    await waitFor(() => expect(unloveJourneyEntry).toHaveBeenCalledWith('c-linds', ENTRY, undefined));
  });

  it('gives the heart at once where nobody is without a phone', async () => {
    mockCircle = coupleCircle;
    asked.mockReturnValue(loaded(atHome({ away: [away({ latest: { ...away().latest, lovedBy: [], loved: false } })] })));
    jest.mocked(loveJourneyEntry).mockResolvedValue([away()]);
    await render(inApp(<Cards cards={[awayCard]} />));
    await userEvent.setup({ advanceTimers: jest.advanceTimersByTime }).press(screen.getByRole('button', { name: 'Love “Ferry day, and finally a rest”' }));
    await waitFor(() => expect(loveJourneyEntry).toHaveBeenCalledWith('c-couple', ENTRY, undefined));
    expect(screen.queryByRole('header', { name: 'A heart from' })).toBeNull();
  });

  it('leads from the card to Journey at home', async () => {
    await render(inApp(<Cards cards={[awayCard]} />));
    await userEvent.setup({ advanceTimers: jest.advanceTimersByTime }).press(screen.getByRole('button', { name: 'Alex is on a journey. Lofoten by bike · Day 6 of 9. 2 new' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith('/journey/at-home');
  });

  it('brings back a day of a kept journey under "On this day", and opens its book', async () => {
    await render(inApp(<Cards cards={[pastCard]} />));
    expect(screen.getByText('On this day')).toBeOnTheScreen();
    expect(screen.getByText('2 years ago')).toBeOnTheScreen();
    expect(screen.getByText('Sunrise over Bromo')).toBeOnTheScreen();
    expect(screen.getByText('Day 22 · kept journey')).toBeOnTheScreen();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await user.press(screen.getByRole('button', { name: 'Sunrise over Bromo. 2 years ago. Day 22 · kept journey' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'page', id: id(12) } });
    await user.press(screen.getByRole('button', { name: 'On this day. See all' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith('/journey/kept');
  });

  it('holds a goodnight back until bedtime, and shows it then by itself', async () => {
    at('19:40');
    await render(inApp(<Cards cards={[goodnightCard, kitty]} />));
    expect(screen.getByText('Today draws: The kitty is low')).toBeOnTheScreen();
    expect(screen.queryByText(/Goodnight from Alex/)).toBeNull();
    at('20:00');
    await act(async () => {
      jest.advanceTimersByTime(31_000);
    });
    expect(screen.getByText('Today draws: Goodnight from Alex, The kitty is low')).toBeOnTheScreen();
  });

  it('asks Journey at home for nothing when Today has none of its cards', async () => {
    await render(inApp(<Cards cards={[kitty]} />));
    expect(asked).toHaveBeenCalledWith('c-linds', { day: today() }, { query: { enabled: false } });
    expect(screen.getByText('Today draws: The kitty is low')).toBeOnTheScreen();
  });
});

describe('Journey at home: what stands behind the cards', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCircle = linds;
    asked.mockReturnValue(loaded(atHome()));
    settings.mockReturnValue(loaded(homeSettings()));
    nights.mockReturnValue(pages([goodnight()]));
    places.mockReturnValue(loaded({ places: 2, countries: 1, list: [{ name: 'Lake Bled', country: 'Slovenia', lat: 46.3625, lng: 14.0938, count: 53 }, { name: 'Home', country: 'Slovenia', lat: 46.0569, lng: 14.5058, count: 12 }, { name: 'Somewhere', country: null, lat: null, lng: null, count: 1 }] }));
    jest.mocked(changeHomeSettings).mockImplementation((_id, request) => Promise.resolve(homeSettings({ bedtime: request.bedtime ?? '20:00' })));
  });

  it('says who is away, where home is, when bedtime is, and which clock home keeps', async () => {
    await render(inApp(<JourneyAtHome />));
    expect(screen.getByRole('header', { name: 'Journey at home' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Alex. Lofoten by bike · Day 6 of 9. Open in Journey' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Where home is. Set. Photos taken there stay home when a journey is told' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Bedtime. 20:00. A goodnight waits on Today until then' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'The clock home keeps. Europe/Ljubljana' })).toBeOnTheScreen();
  });

  it('opens the journey of someone who is away, a goodnight, and the ways to what was kept', async () => {
    await render(inApp(<JourneyAtHome />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Alex. Lofoten by bike · Day 6 of 9. Open in Journey' }));
    expect(mockOpenJourney).toHaveBeenCalledWith(away().journey.openUrl);
    await user.press(screen.getByRole('button', { name: 'Goodnight, you two. Alex · Thu 12 Nov' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'goodnight', id: NIGHT } });
    await user.press(screen.getByRole('button', { name: 'Kept from Journey' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith('/journey/kept');
    await user.press(screen.getByRole('button', { name: 'Keep a journey' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith('/journey/keep');
  });

  it('changes bedtime', async () => {
    await render(inApp(<JourneyAtHome />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Bedtime. 20:00. A goodnight waits on Today until then' }));
    expect(screen.getByRole('header', { name: 'When is bedtime?' })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: '19:30' }));
    await waitFor(() => expect(changeHomeSettings).toHaveBeenCalledWith('c-linds', { bedtime: '19:30' }));
    await waitFor(() => expect(mockCache.homeSettingsSaved).toHaveBeenCalledWith(expect.objectContaining({ bedtime: '19:30' })));
  });

  it('says where home is by choosing a place photos were taken at, or forgets it', async () => {
    await render(inApp(<JourneyAtHome />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: /^Where home is\./ }));
    expect(screen.getByText('Choose one of the places your photos were taken. A photo taken within 150 metres of it counts as taken at home.')).toBeOnTheScreen();
    // A place that doesn't say where it is can't be home.
    expect(screen.queryByRole('button', { name: /^Somewhere/ })).toBeNull();
    await user.press(screen.getByRole('button', { name: 'Lake Bled. Slovenia · 53 photos' }));
    await waitFor(() => expect(changeHomeSettings).toHaveBeenCalledWith('c-linds', { homeLat: 46.3625, homeLng: 14.0938 }));
    await user.press(screen.getByRole('button', { name: /^Where home is\./ }));
    await user.press(screen.getByRole('button', { name: 'Forget where home is' }));
    await waitFor(() => expect(changeHomeSettings).toHaveBeenLastCalledWith('c-linds', { removeHome: true }));
  });

  it("gives home this phone's clock", async () => {
    await render(inApp(<JourneyAtHome />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: /^The clock home keeps\./ }));
    await user.press(screen.getByRole('button', { name: /^Use this phone's clock: / }));
    await waitFor(() => expect(changeHomeSettings).toHaveBeenCalledWith('c-linds', { timeZone: expect.any(String) }));
  });

  it("only shows them to someone who doesn't run the circle", async () => {
    settings.mockReturnValue(loaded(homeSettings({ canChange: false, homeLat: null, homeLng: null, timeZone: null })));
    await render(inApp(<JourneyAtHome />));
    expect(screen.getByText('The people who run the circle can change these.')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /^Bedtime\./ })).toBeNull();
    expect(screen.getAllByText('Not said yet')).toHaveLength(2);
  });

  it('says so when nobody is away, and when this app runs without Journey', async () => {
    asked.mockReturnValue(loaded(atHome({ away: [] })));
    await render(inApp(<JourneyAtHome />));
    expect(screen.getByText('Nobody in this circle is away on a journey you can see.')).toBeOnTheScreen();
    asked.mockReturnValue(loaded(atHome({ available: false, away: [] })));
    await render(inApp(<JourneyAtHome />));
    expect(screen.getByText('This Homeport runs without Journey, so nothing of it shows at home.')).toBeOnTheScreen();
  });

  it('keeps its Back while it loads, and says what went wrong', async () => {
    asked.mockReturnValue(pending());
    await render(inApp(<JourneyAtHome />));
    expect(screen.getByLabelText('Loading')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Back' })).toBeOnTheScreen();
    asked.mockReturnValue(failed(new ApiError(500, 'server', 'Something went wrong on our side.')));
    await render(inApp(<JourneyAtHome />));
    expect(screen.getByText('Something went wrong on our side.')).toBeOnTheScreen();
  });
});

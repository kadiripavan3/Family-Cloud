import { render, screen, userEvent } from '@testing-library/react-native';

import { ApiError } from '@/api/fetcher';
import { useGetToday } from '@/api/generated/homeport';
import { useCircle } from '@/features/circles/current';
import { TodayHome } from '@/features/today/TodayHome';
import { today } from '@/lib/dates';
import { onPhone } from '@/test/phone';
import { coupleCircle, crewCircle, failed, linds, loaded, pending, soloCircle, todayAnswer } from '@/test/samples';

const mockRouter = { push: jest.fn(), navigate: jest.fn() };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('@/features/circles/current', () => ({ useCircle: jest.fn() }));
jest.mock('@/api/generated/homeport', () => ({ useGetToday: jest.fn() }));

const asked = jest.mocked(useGetToday) as unknown as jest.Mock;
const DENTIST = 'aaaaaaaa-1111-4111-8111-111111111111';
const BINS = 'bbbbbbbb-1111-4111-8111-111111111111';
const BILL = 'cccccccc-1111-4111-8111-111111111111';
const aDay = todayAnswer({
  left: 3,
  done: 2,
  items: [
    { thingId: DENTIST, kind: 'event' as never, title: 'Dentist · Mia', note: 'Alex is taking her', lead: '15:30', done: null, minute: 930, avatarUrls: ['https://example.com/mia.jpg', 'https://example.com/alex.jpg'] },
    { thingId: BINS, kind: 'checklist', title: 'Take the bins out', note: 'Tonight · your turn', lead: null, done: false, minute: 1440, avatarUrls: [] },
    { thingId: BILL, kind: 'bill' as never, title: 'Electricity', note: 'Due tomorrow · split with Alex', lead: '€84', done: null, minute: 1440, avatarUrls: [] },
  ],
  fresh: [
    { thingId: 'dddddddd-1111-4111-8111-111111111111', kind: 'album' as never, title: 'Saturday at the lake', note: 'Alex, Mia and you', imageUrl: 'https://example.com/canoe.jpg', pill: '19 new' },
    { thingId: 'eeeeeeee-1111-4111-8111-111111111111', kind: 'page', title: "Grandma's cookies", note: 'Astrid added a page', imageUrl: null, pill: null },
  ],
});

describe('3.1 Today', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(useCircle).mockReturnValue(linds);
    asked.mockReturnValue(loaded(aDay));
  });

  it("asks for the current circle's day, by the day on the phone", async () => {
    await render(onPhone(<TodayHome />));
    expect(asked).toHaveBeenCalledWith('c-linds', { day: today() });
  });

  it('sums the day up: what is first, how much is left and done', async () => {
    await render(onPhone(<TodayHome />));
    expect(screen.getByText('Dentist · Mia, Take the bins out and 1 more')).toBeOnTheScreen();
    expect(screen.getByText('3 things left today · 2 done')).toBeOnTheScreen();
  });

  it("draws the day's list the same way whatever each thing is, and opens each by its kind", async () => {
    await render(onPhone(<TodayHome />));
    const user = userEvent.setup();
    // A time in front, a tick, an amount.
    await user.press(screen.getByRole('button', { name: '15:30. Dentist · Mia. Alex is taking her' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'event', id: DENTIST } });
    await user.press(screen.getByRole('button', { name: 'Not done yet. Take the bins out. Tonight · your turn' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'checklist', id: BINS } });
    await user.press(screen.getByRole('button', { name: '€84. Electricity. Due tomorrow · split with Alex' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'bill', id: BILL } });
  });

  it('shows what is new as a rail of cards, and the way to the library', async () => {
    await render(onPhone(<TodayHome />));
    const user = userEvent.setup();
    expect(screen.getByText('19 new')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Saturday at the lake. 19 new. Alex, Mia and you' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'album', id: 'dddddddd-1111-4111-8111-111111111111' } });
    expect(screen.getByRole('button', { name: "Grandma's cookies. Astrid added a page" })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'New in the library. See all' }));
    expect(mockRouter.navigate).toHaveBeenCalledWith({ pathname: '/', params: { place: 'library' } });
  });

  it('says a day with nothing on it is clear, and still shows what is new', async () => {
    asked.mockReturnValue(loaded(todayAnswer({ fresh: aDay.fresh })));
    await render(onPhone(<TodayHome />));
    expect(screen.getByText('Nothing on today')).toBeOnTheScreen();
    expect(screen.getByText('Nothing due, nothing to tick')).toBeOnTheScreen();
    expect(screen.getByText('New in the library')).toBeOnTheScreen();
  });

  it('a brand-new circle never opens on a blank page: its name, who can add, and three ways to begin', async () => {
    asked.mockReturnValue(loaded(todayAnswer()));
    jest.mocked(useCircle).mockReturnValue(crewCircle);
    await render(onPhone(<TodayHome />));
    expect(screen.getByRole('header', { name: 'Lisbon crew is ready' })).toBeOnTheScreen();
    expect(screen.getByText('Nothing here yet. Whatever any of the five of you adds will show up on Today.')).toBeOnTheScreen();
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: "Add the photos. everyone's, in one album" }));
    expect(mockRouter.push).toHaveBeenLastCalledWith('/new/photos');
    await user.press(screen.getByRole('button', { name: 'Split what you paid. scan a receipt' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith('/new/bill');
    await user.press(screen.getByRole('button', { name: 'Plan the next one. pick a date together' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith('/new/event');
  });

  it.each([
    [linds, 'Nothing here yet. Whatever any of the four of you adds will show up on Today.', /^Start the shopping list/],
    [coupleCircle, 'Nothing here yet. Whatever either of you adds will show up on Today.', /^Plan a date/],
    [soloCircle, 'Nothing here yet. Whatever you add will show up on Today.', /^Keep your first password/],
  ])('fits the empty page to the kind of circle', async (circle, body, shortcut) => {
    asked.mockReturnValue(loaded(todayAnswer()));
    jest.mocked(useCircle).mockReturnValue(circle);
    await render(onPhone(<TodayHome />));
    expect(screen.getByText(body)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: shortcut })).toBeOnTheScreen();
  });

  it('shows grey shapes in the coming layout while it loads, and says so when offline with nothing loaded', async () => {
    asked.mockReturnValue(pending());
    const view = await render(onPhone(<TodayHome />));
    expect(screen.getByLabelText('Loading')).toBeOnTheScreen();
    asked.mockReturnValue({ ...pending(), isPaused: true });
    await view.rerender(onPhone(<TodayHome />));
    expect(screen.getByText("You're offline")).toBeOnTheScreen();
  });

  it("says what went wrong when the day can't be fetched, and tries again", async () => {
    const refetch = jest.fn();
    asked.mockReturnValue({ ...failed(new ApiError(500, 'server', 'Something went wrong on our side. Try again.')), refetch });
    await render(onPhone(<TodayHome />));
    expect(screen.getByText('Something went wrong on our side. Try again.')).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Try again' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});

import { render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { ApiError } from '@/api/fetcher';
import { createEvent } from '@/api/generated/homeport';
import NewEvent from '@/app/(app)/new/event';
import { inApp } from '@/test/phone';
import { linds } from '@/test/samples';
import { event, onSampleToday } from '@/test/samples/plan';

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) };
const mockCache = { eventMade: jest.fn(() => Promise.resolve()) };
let mockParams: { day?: string; audience?: string } = {};
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => mockParams, usePreventRemove: () => jest.fn() }));
jest.mock('@/api/cache', () => ({ useCache: () => mockCache }));
jest.mock('@/lib/ids', () => ({ newClientId: () => 'client-1' }));
jest.mock('@/features/circles/current', () => ({ useCircle: () => mockLinds }));
jest.mock('@/api/generated/homeport', () => ({ createEvent: jest.fn() }));

const mockLinds = linds;

describe('/new/event', () => {
  beforeAll(onSampleToday);
  afterAll(() => jest.useRealTimers());
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = {};
  });

  it('makes an all-day event today from a name alone, seen by what a family starts things as, and opens it', async () => {
    jest.mocked(createEvent).mockResolvedValue(event({ id: 'e-new' }));
    await render(inApp(<NewEvent />));
    expect(screen.getByRole('header', { name: 'New event' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'When. Wed 11 Nov · All day' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Seen by Only you. Change' })).toBeOnTheScreen();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('What is it?'), 'Dinner at Grandma Astrid\'s');
    await user.press(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'event', id: 'e-new' } }));
    expect(createEvent).toHaveBeenCalledWith({ clientId: 'client-1', circleId: 'c-linds', title: "Dinner at Grandma Astrid's", day: '2026-11-11', time: undefined, endTime: undefined, timeZone: expect.any(String), place: undefined, notes: undefined, remindMinutes: undefined, repeat: undefined, guests: [], about: undefined, audience: 'me' });
    expect(mockCache.eventMade).toHaveBeenCalled();
  });

  it('takes the day the month handed over, a time, a place, who is coming, a reminder and how often', async () => {
    mockParams = { day: '2026-11-14', audience: 'circle' };
    jest.mocked(createEvent).mockResolvedValue(event());
    await render(inApp(<NewEvent />));
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('What is it?'), 'Haircut');
    await user.press(screen.getByRole('button', { name: 'When. Sat 14 Nov · All day' }));
    await user.type(screen.getByLabelText('Starts'), '10');
    await user.press(screen.getByRole('button', { name: 'Done' }));
    // An event with a start and no end lasts half an hour.
    expect(screen.getByRole('button', { name: 'When. Sat 14 Nov · 10:00 to 10:30' })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: "Who's coming. Nobody yet" }));
    await user.press(screen.getByRole('checkbox', { name: 'Leo' }));
    await user.press(screen.getByRole('checkbox', { name: 'You' }));
    await user.press(screen.getByRole('button', { name: 'Done' }));
    expect(screen.getByRole('button', { name: "Who's coming. Leo · You" })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Remind you. No reminder' }));
    await user.press(screen.getByRole('radio', { name: '1 hour before' }));
    await user.press(screen.getByRole('button', { name: "Repeats. Doesn't repeat" }));
    await user.press(screen.getByRole('radio', { name: 'Every week' }));
    // It begins as the day of the week it starts on, and more days can be added.
    expect(screen.getByRole('checkbox', { name: 'Saturday', checked: true })).toBeOnTheScreen();
    await user.press(screen.getByRole('checkbox', { name: 'Tuesday' }));
    await user.press(screen.getByRole('button', { name: 'Done' }));
    expect(screen.getByRole('button', { name: 'Repeats. Tue and Sat' })).toBeOnTheScreen();
    await user.type(screen.getByLabelText('Where'), 'Barber Miha');
    await user.type(screen.getByLabelText('Notes'), 'Bring the voucher');
    await user.press(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(createEvent).toHaveBeenCalled());
    expect(createEvent).toHaveBeenCalledWith({
      clientId: 'client-1',
      circleId: 'c-linds',
      title: 'Haircut',
      day: '2026-11-14',
      time: '10:00',
      endTime: '10:30',
      timeZone: expect.any(String),
      place: 'Barber Miha',
      notes: 'Bring the voucher',
      remindMinutes: 60,
      repeat: { unit: 'week', every: undefined, days: ['tue', 'sat'], until: undefined },
      guests: [{ memberId: 'm-leo' }, { memberId: 'm-nora' }],
      about: ['m-leo'],
      audience: 'circle',
    });
  });

  it('asks for a name first, and shows what the API said about a box', async () => {
    jest.mocked(createEvent).mockRejectedValue(new ApiError(400, 'ends_before_it_starts', "It can't end before it starts."));
    await render(inApp(<NewEvent />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByText('Give it a name first.')).toBeOnTheScreen();
    expect(createEvent).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText('What is it?'), 'Dinner');
    await user.press(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByText("It can't end before it starts.")).toBeOnTheScreen();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it('leads to "Type it" from the line on top, with who it starts as seen by', async () => {
    await render(inApp(<NewEvent />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Or type it: “Haircut for Leo, Saturday 10”' }));
    expect(mockRouter.replace).toHaveBeenLastCalledWith('/plan/quick-add');
    await user.press(screen.getByRole('button', { name: 'Seen by Only you. Change' }));
    await user.press(screen.getByRole('button', { name: 'Or type it: “Haircut for Leo, Saturday 10”' }));
    expect(mockRouter.replace).toHaveBeenLastCalledWith({ pathname: '/plan/quick-add', params: { audience: 'circle' } });
  });
});

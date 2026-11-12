import { render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { ApiError } from '@/api/fetcher';
import { createReminder } from '@/api/generated/homeport';
import NewReminder from '@/app/(app)/new/reminder';
import { inApp } from '@/test/phone';
import { linds } from '@/test/samples';
import { onSampleToday, reminder } from '@/test/samples/plan';

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) };
const mockCache = { reminderMade: jest.fn(() => Promise.resolve()) };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => ({}), usePreventRemove: () => jest.fn() }));
jest.mock('@/api/cache', () => ({ useCache: () => mockCache }));
jest.mock('@/lib/ids', () => ({ newClientId: () => 'client-1' }));
jest.mock('@/features/circles/current', () => ({ useCircle: () => mockLinds }));
jest.mock('@/api/generated/homeport', () => ({ createReminder: jest.fn() }));

const mockLinds = linds;

describe('/new/reminder', () => {
  beforeAll(onSampleToday);
  afterAll(() => jest.useRealTimers());
  beforeEach(() => jest.clearAllMocks());

  it('makes one for some time from what has to be done alone, and goes back', async () => {
    jest.mocked(createReminder).mockResolvedValue(reminder());
    await render(inApp(<NewReminder />));
    expect(screen.getByRole('header', { name: 'New reminder' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'When. Some time' })).toBeOnTheScreen();
    // What needs a day (repeating, a reminder ahead) isn't offered without one.
    expect(screen.queryByRole('button', { name: /^Repeats/ })).toBeNull();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('What has to be done?'), 'Call the plumber');
    await user.press(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    expect(createReminder).toHaveBeenCalledWith({ clientId: 'client-1', circleId: 'c-linds', title: 'Call the plumber', notes: undefined, dueOn: undefined, dueTime: undefined, timeZone: expect.any(String), remindMinutes: 0, repeat: undefined, givenTo: [], takesTurns: false, place: undefined, audience: 'me' });
    expect(mockCache.reminderMade).toHaveBeenCalled();
  });

  it('gives one to two people who take turns, every Tuesday and Friday at 19:00', async () => {
    jest.mocked(createReminder).mockResolvedValue(reminder());
    await render(inApp(<NewReminder />));
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('What has to be done?'), 'Take the bins out');
    await user.press(screen.getByRole('button', { name: 'When. Some time' }));
    await user.press(screen.getByRole('button', { name: 'Day: No day yet. Change' }));
    await user.press(screen.getByRole('button', { name: '13 November 2026' }));
    await user.type(screen.getByLabelText('Time'), '7pm');
    expect(screen.getByText('Read as 19:00')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Done' }));
    expect(screen.getByRole('button', { name: 'When. Fri 13 Nov · 19:00' })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: "Repeats. Doesn't repeat" }));
    await user.press(screen.getByRole('radio', { name: 'Every week' }));
    await user.press(screen.getByRole('checkbox', { name: 'Tuesday' }));
    await user.press(screen.getByRole('button', { name: 'Done' }));
    // Taking turns needs two people: it is offered once there are.
    expect(screen.queryByRole('switch', { name: 'Take turns' })).toBeNull();
    await user.press(screen.getByRole('button', { name: 'Give it to. Nobody: it is yours' }));
    // A pet can't be given a job.
    expect(screen.queryByRole('checkbox', { name: 'Biscuit' })).toBeNull();
    await user.press(screen.getByRole('checkbox', { name: 'You' }));
    await user.press(screen.getByRole('checkbox', { name: 'Alex' }));
    await user.press(screen.getByRole('button', { name: 'Done' }));
    await user.press(screen.getByRole('switch', { name: 'Take turns' }));
    await user.press(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(createReminder).toHaveBeenCalled());
    expect(createReminder).toHaveBeenCalledWith(expect.objectContaining({ title: 'Take the bins out', dueOn: '2026-11-13', dueTime: '19:00', repeat: { unit: 'week', every: undefined, days: ['tue', 'fri'], until: undefined }, givenTo: ['m-nora', 'm-alex'], takesTurns: true }));
  });

  it('makes one that waits for a place, and says who watches the place', async () => {
    jest.mocked(createReminder).mockResolvedValue(reminder());
    await render(inApp(<NewReminder />));
    const user = userEvent.setup();
    expect(screen.getByText(/^Instead of a time: it waits until whoever has it is near that place\./)).toBeOnTheScreen();
    await user.type(screen.getByLabelText('What has to be done?'), 'Pick up the parcel');
    await user.type(screen.getByLabelText('When someone is near'), 'the post office');
    await user.press(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(createReminder).toHaveBeenCalledWith(expect.objectContaining({ title: 'Pick up the parcel', place: { words: 'the post office' } })));
  });

  it('asks what has to be done first, and shows what the API said', async () => {
    jest.mocked(createReminder).mockRejectedValue(new ApiError(400, 'not_a_person', "A pet can't be given a job. Give it to a person."));
    await render(inApp(<NewReminder />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByText('Say what has to be done first.')).toBeOnTheScreen();
    await user.type(screen.getByLabelText('What has to be done?'), 'Feed Biscuit');
    await user.press(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByText("A pet can't be given a job. Give it to a person.")).toBeOnTheScreen();
    expect(mockRouter.back).not.toHaveBeenCalled();
  });

  it('leads to "Type it" from the line on top', async () => {
    await render(inApp(<NewReminder />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'Or type it: “Ask Alex to book the car service”' }));
    expect(mockRouter.replace).toHaveBeenCalledWith('/plan/quick-add');
  });
});

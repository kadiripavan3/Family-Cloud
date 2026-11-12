import { render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { ApiError } from '@/api/fetcher';
import { changeReminder, deleteThing, nudgeReminder, tickReminder, useGetReminder } from '@/api/generated/homeport';
import ReminderPage from '@/app/(app)/reminder/[id]';
import { inApp } from '@/test/phone';
import { failed, linds, loaded, me, pending } from '@/test/samples';
import { carService, ids, onSampleToday, parcel, reminder } from '@/test/samples/plan';

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true), canDismiss: jest.fn(() => false) };
const mockCache = { reminderSaved: jest.fn(() => Promise.resolve()), reminderNudged: jest.fn(() => Promise.resolve()), thingDeleted: jest.fn(() => Promise.resolve()) };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => ({ id: mockId }) }));
jest.mock('@/api/cache', () => ({ useCache: () => mockCache }));
jest.mock('@/features/circles/current', () => ({ useCircles: () => [mockLinds], useCircleIfAny: () => mockLinds }));
jest.mock('@/features/sharing/AudienceSheet', () => ({ AudienceSheet: () => null }));
jest.mock('@/api/generated/homeport', () => ({ useGetReminder: jest.fn(), useGetMe: jest.fn(() => mockMe), tickReminder: jest.fn(), nudgeReminder: jest.fn(), changeReminder: jest.fn(), deleteThing: jest.fn() }));

const mockLinds = linds;
const mockMe = loaded(me());
const mockId = ids.bins;
const asked = jest.mocked(useGetReminder) as unknown as jest.Mock;

describe('a reminder, opened', () => {
  beforeAll(onSampleToday);
  afterAll(() => jest.useRealTimers());
  beforeEach(() => {
    jest.clearAllMocks();
    asked.mockReturnValue(loaded(reminder()));
  });

  it('shows what has to be done, when, how often, and whose turn it is', async () => {
    await render(inApp(<ReminderPage />));
    expect(asked).toHaveBeenCalledWith(ids.bins, { day: '2026-11-11' });
    expect(screen.getByRole('header', { name: 'Take the bins out' })).toBeOnTheScreen();
    expect(screen.getByText('19:00 · Tue and Fri · takes turns')).toBeOnTheScreen();
    expect(screen.getByText('Wed 11 Nov · 19:00')).toBeOnTheScreen();
    expect(screen.getByText('Tue and Fri')).toBeOnTheScreen();
    expect(screen.getByText('Your turn, then Alex · They take turns')).toBeOnTheScreen();
    expect(screen.getByText('At the time')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Seen by: The Linds. Change who can see this' })).toBeOnTheScreen();
    expect(screen.getByRole('checkbox', { name: 'Take the bins out, Wed 11 Nov', checked: false })).toBeOnTheScreen();
  });

  it('ticks it for the day it is due, and takes the tick away for the day it was given for', async () => {
    const ticked = reminder({ dueOn: '2026-11-13', done: true, tickedDueOn: '2026-11-11', yours: false, turn: null });
    jest.mocked(tickReminder).mockResolvedValue(ticked);
    const view = await render(inApp(<ReminderPage />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('checkbox', { name: 'Take the bins out, Wed 11 Nov' }));
    expect(tickReminder).toHaveBeenLastCalledWith(ids.bins, { done: true, dueOn: '2026-11-11', day: '2026-11-11' });
    await waitFor(() => expect(mockCache.reminderSaved).toHaveBeenCalledWith(ticked));
    asked.mockReturnValue(loaded(ticked));
    await view.rerender(inApp(<ReminderPage />));
    await user.press(screen.getByRole('checkbox', { name: 'Take the bins out, Fri 13 Nov', checked: true }));
    expect(tickReminder).toHaveBeenLastCalledWith(ids.bins, { done: false, dueOn: '2026-11-11', day: '2026-11-11' });
  });

  it('says who has one that was given to someone, and nudges them', async () => {
    asked.mockReturnValue(loaded(carService));
    jest.mocked(nudgeReminder).mockResolvedValue(undefined);
    await render(inApp(<ReminderPage />));
    expect(screen.getByText('Some time')).toBeOnTheScreen();
    expect(screen.getByText('Alex')).toBeOnTheScreen();
    expect(screen.getByText('Asked by')).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Nudge Alex about Book the car service' }));
    expect(nudgeReminder).toHaveBeenCalledWith(ids.carService);
    expect(await screen.findByText('A gentle nudge is on its way to Alex.')).toBeOnTheScreen();
  });

  it('says where one waits, and that the phone watches the place', async () => {
    asked.mockReturnValue(loaded(parcel));
    await render(inApp(<ReminderPage />));
    expect(screen.getByText('Near the post office')).toBeOnTheScreen();
    expect(screen.getByText('The phone of whoever has this watches for the place.')).toBeOnTheScreen();
  });

  it('changes it: gives it to someone, with what the API needs for that', async () => {
    asked.mockReturnValue(loaded(parcel));
    const saved = reminder({ ...parcel, title: 'Pick up the big parcel' });
    jest.mocked(changeReminder).mockResolvedValue(saved);
    await render(inApp(<ReminderPage />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'More' }));
    await user.press(screen.getByRole('button', { name: 'Change' }));
    expect(screen.getByRole('header', { name: 'Change the reminder' })).toBeOnTheScreen();
    await user.clear(screen.getByLabelText('What has to be done?'));
    await user.type(screen.getByLabelText('What has to be done?'), 'Pick up the big parcel');
    await user.press(screen.getByRole('button', { name: 'Give it to. Nobody: it is yours' }));
    await user.press(screen.getByRole('checkbox', { name: 'Alex' }));
    await user.press(screen.getByRole('button', { name: 'Done' }));
    expect(screen.getByRole('button', { name: 'Give it to. Alex' })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(mockCache.reminderSaved).toHaveBeenCalledWith(saved));
    // The place's words didn't change, so where it is stays as it was.
    expect(changeReminder).toHaveBeenCalledWith(ids.parcel, { title: 'Pick up the big parcel', notes: '', remindMinutes: 0, givenTo: ['m-alex'], takesTurns: false });
  });

  it('deletes it after asking, and leaves', async () => {
    jest.mocked(deleteThing).mockResolvedValue(undefined);
    await render(inApp(<ReminderPage />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'More' }));
    await user.press(screen.getByRole('button', { name: 'Delete reminder' }));
    await user.press(screen.getAllByRole('button', { name: 'Delete reminder' }).at(-1)!);
    await waitFor(() => expect(mockCache.thingDeleted).toHaveBeenCalled());
    expect(deleteThing).toHaveBeenCalledWith(ids.bins);
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it('has no menu and no tick for someone who may only look', async () => {
    asked.mockReturnValue(loaded(reminder({ mine: false, canEdit: false, canTick: false, yours: false })));
    await render(inApp(<ReminderPage />));
    expect(screen.queryByRole('button', { name: 'More' })).toBeNull();
    expect(screen.getByRole('checkbox', { name: 'Take the bins out, Wed 11 Nov' })).toBeDisabled();
  });

  it('keeps its Back while it loads, and says so when it is not there', async () => {
    asked.mockReturnValue(pending());
    const view = await render(inApp(<ReminderPage />));
    expect(screen.getByLabelText('Loading')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Back' })).toBeOnTheScreen();
    asked.mockReturnValue(failed(new ApiError(404, 'not_found', "That isn't there any more, or it isn't shared with you.")));
    await view.rerender(inApp(<ReminderPage />));
    expect(screen.getByRole('header', { name: "This isn't available" })).toBeOnTheScreen();
  });
});

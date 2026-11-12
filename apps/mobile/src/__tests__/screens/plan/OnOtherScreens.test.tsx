import { render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { ApiError } from '@/api/fetcher';
import { getReminder, tickReminder, useGetPlan, useGetToday } from '@/api/generated/homeport';
import { ComingUp, upcoming } from '@/features/plan/ComingUp';
import { TodayHome } from '@/features/today/TodayHome';
import { inApp } from '@/test/phone';
import { failed, linds, loaded, mia, pending, todayAnswer } from '@/test/samples';
import { bins, dentist, ids, onSampleToday, planAnswer, reminder, swimming } from '@/test/samples/plan';

const mockRouter = { push: jest.fn(), navigate: jest.fn() };
const mockCache = { reminderSaved: jest.fn(() => Promise.resolve()) };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('@/api/cache', () => ({ useCache: () => mockCache }));
jest.mock('@/features/circles/current', () => ({ useCircle: () => mockLinds, useCircles: () => [mockLinds], useCircleIfAny: () => mockLinds }));
jest.mock('@/features/sharing/AudienceSheet', () => ({ AudienceSheet: () => null }));
jest.mock('@/api/generated/homeport', () => ({ useGetToday: jest.fn(), useGetPlan: jest.fn(), useGetMe: jest.fn(() => ({ data: undefined })), getReminder: jest.fn(), tickReminder: jest.fn() }));

const mockLinds = linds;
const today = jest.mocked(useGetToday) as unknown as jest.Mock;
const plan = jest.mocked(useGetPlan) as unknown as jest.Mock;

describe('what Plan puts on other screens', () => {
  beforeAll(onSampleToday);
  afterAll(() => jest.useRealTimers());
  beforeEach(() => jest.clearAllMocks());

  describe('Today: a reminder is ticked where it stands', () => {
    const aDay = todayAnswer({
      left: 2,
      done: 0,
      items: [
        { thingId: ids.dentist, kind: 'event', title: 'Dentist · Mia', note: 'Alex is taking her', lead: '15:30', done: null, minute: 930, avatarUrls: [] },
        { thingId: ids.bins, kind: 'reminder', title: 'Take the bins out', note: 'Tonight · your turn', lead: null, done: false, minute: 1140, avatarUrls: [] },
      ],
    });

    it('ticks it for the day it is due, shows the tick at once, and does not open the reminder', async () => {
      today.mockReturnValue(loaded(aDay));
      const ticked = reminder({ done: true });
      // Today doesn't say which due day a line is for: the reminder itself is asked first.
      jest.mocked(getReminder).mockResolvedValue(reminder());
      jest.mocked(tickReminder).mockResolvedValue(ticked);
      await render(inApp(<TodayHome />));
      expect(screen.getByRole('button', { name: '15:30. Dentist · Mia. Alex is taking her' })).toBeOnTheScreen();
      await userEvent.setup().press(screen.getByRole('checkbox', { name: 'Take the bins out', checked: false }));
      await waitFor(() => expect(mockCache.reminderSaved).toHaveBeenCalledWith(ticked));
      expect(getReminder).toHaveBeenCalledWith(ids.bins, { day: '2026-11-11' });
      expect(tickReminder).toHaveBeenCalledWith(ids.bins, { done: true, dueOn: '2026-11-11', day: '2026-11-11' });
      expect(mockRouter.push).not.toHaveBeenCalled();
    });

    it('ticks the day the line says it is due, without asking the reminder first, when Today says which day that is', async () => {
      today.mockReturnValue(loaded({ ...aDay, items: [{ ...aDay.items[1]!, repeats: true, due: { on: '2026-11-10', amount: null, note: null } }] }));
      const ticked = reminder({ done: true });
      jest.mocked(tickReminder).mockResolvedValue(ticked);
      await render(inApp(<TodayHome />));
      await userEvent.setup().press(screen.getByRole('checkbox', { name: 'Take the bins out', checked: false }));
      await waitFor(() => expect(mockCache.reminderSaved).toHaveBeenCalledWith(ticked));
      // Still open from Tuesday: that is the day the tick is for.
      expect(tickReminder).toHaveBeenCalledWith(ids.bins, { done: true, dueOn: '2026-11-10', day: '2026-11-11' });
      expect(getReminder).not.toHaveBeenCalled();
    });

    it('does not tick the next time round when the list had not caught up with a tick given elsewhere', async () => {
      today.mockReturnValue(loaded(aDay));
      // It was ticked on Plan a moment ago: it is due on Friday now, and done for today.
      const already = reminder({ done: true, dueOn: '2026-11-13', tickedDueOn: '2026-11-11' });
      jest.mocked(getReminder).mockResolvedValue(already);
      await render(inApp(<TodayHome />));
      await userEvent.setup().press(screen.getByRole('checkbox', { name: 'Take the bins out', checked: false }));
      await waitFor(() => expect(mockCache.reminderSaved).toHaveBeenCalledWith(already));
      expect(tickReminder).not.toHaveBeenCalled();
    });

    it('takes the tick away for the day it was given for, and puts it back when that did not arrive', async () => {
      today.mockReturnValue(loaded({ ...aDay, items: [{ ...aDay.items[1]!, done: true, note: 'Done at 10:41' }] }));
      jest.mocked(getReminder).mockResolvedValue(reminder({ done: true, dueOn: '2026-11-13', tickedDueOn: '2026-11-11' }));
      jest.mocked(tickReminder).mockRejectedValue(new ApiError(403, 'view_only', 'You can look at this, but not change it.'));
      await render(inApp(<TodayHome />));
      await userEvent.setup().press(screen.getByRole('checkbox', { name: 'Take the bins out', checked: true }));
      await waitFor(() => expect(tickReminder).toHaveBeenCalledWith(ids.bins, { done: false, dueOn: '2026-11-11', day: '2026-11-11' }));
      await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Take the bins out', checked: true })).toBeOnTheScreen());
    });
  });

  describe('a person\'s page: what is coming up for them', () => {
    it('asks the calendar for that one person and names each thing once, at its next time', async () => {
      const again = { ...swimming, day: '2026-11-19' };
      plan.mockReturnValue(loaded(planAnswer({ days: [{ day: '2026-11-11', entries: [dentist] }, { day: '2026-11-12', entries: [swimming] }, { day: '2026-11-19', entries: [again] }] })));
      await render(inApp(<ComingUp member={mia} />));
      expect(plan).toHaveBeenCalledWith('c-linds', { day: '2026-11-11', days: 14, member: 'm-mia' });
      expect(screen.getByRole('button', { name: 'Dentist · Mia. Event. Today 15:30 · Trubarjeva 12' })).toBeOnTheScreen();
      expect(screen.getAllByRole('button', { name: /^Swimming · Mia/ })).toHaveLength(1);
      expect(screen.getByText('Tomorrow 17:00 · Thursdays')).toBeOnTheScreen();
      await userEvent.setup().press(screen.getByRole('button', { name: /^Dentist · Mia/ }));
      expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'event', id: ids.dentist } });
    });

    it('leaves out what is done, and names four at most', () => {
      const days = [{ entries: [{ ...bins, done: true }, dentist, { ...dentist, thingId: 'a' }, { ...dentist, thingId: 'b' }, { ...dentist, thingId: 'c' }, { ...dentist, thingId: 'd' }] }];
      expect(upcoming(days).map((entry) => entry.thingId)).toEqual([ids.dentist, 'a', 'b', 'c']);
    });

    it('says so when nothing is coming up, while it loads, and when it did not load', async () => {
      plan.mockReturnValue(loaded(planAnswer({ days: [] })));
      const view = await render(inApp(<ComingUp member={mia} />));
      expect(screen.getByText('Nothing in the next two weeks.')).toBeOnTheScreen();
      plan.mockReturnValue(pending());
      await view.rerender(inApp(<ComingUp member={mia} />));
      expect(screen.getByLabelText('Loading')).toBeOnTheScreen();
      plan.mockReturnValue(failed(new ApiError(500, 'server', 'Something went wrong on our side. Try again.')));
      await view.rerender(inApp(<ComingUp member={mia} />));
      expect(screen.getByText('Something went wrong on our side. Try again.')).toBeOnTheScreen();
    });
  });
});

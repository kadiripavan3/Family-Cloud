import { carService, event, goal, booksGoal, onSampleToday, parcel, reminder } from '@/test/samples/plan';
import { words } from '@/words';

import { eventChangeRequest, eventDraftOf, newEventDraft, newEventRequest, recurrenceOf, whenLine } from '../eventDraft';
import { goalChangeRequest, goalDraftOf, goalProblems, kindOfGoal, newGoalDraft, newGoalRequest, readAmount, stepsOf } from '../goalDraft';
import { canTakeTurns, dueLine, newReminderDraft, newReminderRequest, reminderChangeRequest, reminderDraftOf } from '../reminderDraft';

describe('what the forms of Plan send', () => {
  beforeAll(onSampleToday);
  afterAll(() => jest.useRealTimers());

  describe('an event', () => {
    it('writes when it is: a span, all day, or several days', () => {
      expect(whenLine('2026-12-05', '14:00', '17:00')).toBe('Sat 5 Dec · 14:00 to 17:00');
      expect(whenLine('2026-12-05', '14:00', null)).toBe('Sat 5 Dec · 14:00');
      expect(whenLine('2026-12-05', null, null)).toBe('Sat 5 Dec · All day');
      expect(whenLine('2026-12-05', null, null, '2026-12-06')).toBe('Sat 5 Dec to Sun 6 Dec');
      expect(whenLine('2026-12-05', '18:00', '10:00', '2026-12-06')).toBe('Sat 5 Dec · 18:00 to Sun 6 Dec · 10:00');
    });

    it('keeps how often it comes round without the label the API added', () => {
      expect(recurrenceOf({ unit: 'week', every: 2, days: ['thu'], until: null, label: 'Every other Thursday' })).toEqual({ unit: 'week', every: 2, days: ['thu'], until: undefined });
      expect(recurrenceOf(null)).toBeNull();
    });

    it('leaves out what was not said, and never an end without a start', () => {
      const request = newEventRequest({ ...newEventDraft('2026-11-14'), title: '  Picnic ', endTime: '12:00' }, { clientId: 'c-1', circleId: 'c-linds' });
      expect(request).toMatchObject({ title: 'Picnic', day: '2026-11-14', time: undefined, endTime: undefined, place: undefined, guests: [], about: undefined });
    });

    it('changes only what the form holds; stopping a reminder or a repeat is said in so many words', () => {
      const weekly = event({ remindMinutes: 60, remindLabel: '1 hour before', repeat: { unit: 'week', every: 1, days: ['sat'], until: null, label: 'Saturdays' } });
      const draft = eventDraftOf(weekly);
      expect(draft).toMatchObject({ guests: ['m-nora', 'm-alex'], remindMinutes: 60, repeat: { unit: 'week', every: 1, days: ['sat'] } });
      expect(eventChangeRequest(draft, weekly)).toMatchObject({ remindMinutes: 60, repeat: { unit: 'week', every: 1, days: ['sat'] } });
      const stopped = eventChangeRequest({ ...draft, remindMinutes: null, repeat: null }, weekly);
      expect(stopped).toMatchObject({ stopReminding: true, stopRepeating: true });
      expect(stopped).not.toHaveProperty('remindMinutes');
      // One that never repeated or reminded says nothing about either.
      const plain = eventChangeRequest(eventDraftOf(event()), event());
      expect(plain).not.toHaveProperty('stopReminding');
      expect(plain).not.toHaveProperty('stopRepeating');
    });

    it('keeps the length of one that lasts several days when its day moves', () => {
      const weekend = event({ day: '2026-12-05', endDay: '2026-12-06' });
      expect(eventChangeRequest({ ...eventDraftOf(weekend), day: '2026-12-12' }, weekend)).toMatchObject({ day: '2026-12-12', endDay: '2026-12-13' });
    });
  });

  describe('a reminder', () => {
    it('writes when it is due, or that it has no day', () => {
      expect(dueLine('2026-11-13', '18:00')).toBe('Fri 13 Nov · 18:00');
      expect(dueLine('2026-11-13', null)).toBe('Fri 13 Nov');
      expect(dueLine(null, null)).toBe('Some time');
    });

    it('takes turns only with a day, a repeat and two people', () => {
      const draft = { ...newReminderDraft(), day: '2026-11-13', repeat: { unit: 'week' as const }, givenTo: ['m-nora', 'm-alex'], takesTurns: true };
      expect(canTakeTurns(draft)).toBe(true);
      expect(canTakeTurns({ ...draft, givenTo: ['m-alex'] })).toBe(false);
      expect(canTakeTurns({ ...draft, repeat: null })).toBe(false);
      expect(newReminderRequest({ ...draft, title: 'Bins', givenTo: ['m-alex'] }, { clientId: 'c-1', circleId: 'c-linds' }).takesTurns).toBe(false);
    });

    it('drops a time and a repeat that have no day to stand on', () => {
      const request = newReminderRequest({ ...newReminderDraft(), title: 'Call', time: '09:00', repeat: { unit: 'day' } }, { clientId: 'c-1', circleId: 'c-linds', audience: 'circle' });
      expect(request).toMatchObject({ dueOn: undefined, dueTime: undefined, repeat: undefined, audience: 'circle' });
    });

    it('says in so many words when a day, a repeat or a place is taken away', () => {
      const bins = reminder();
      expect(reminderChangeRequest({ ...reminderDraftOf(bins), day: null }, bins)).toMatchObject({ removeDue: true });
      expect(reminderChangeRequest({ ...reminderDraftOf(bins), repeat: null }, bins)).toMatchObject({ stopRepeating: true, takesTurns: false });
      expect(reminderChangeRequest({ ...reminderDraftOf(parcel), place: '' }, parcel)).toMatchObject({ removePlace: true });
      expect(reminderChangeRequest({ ...reminderDraftOf(parcel), place: 'the bakery' }, parcel)).toMatchObject({ place: { words: 'the bakery' } });
      // Nothing about the place when its words stayed: where it is on the map is kept.
      expect(reminderChangeRequest(reminderDraftOf(parcel), parcel)).not.toHaveProperty('place');
      expect(reminderChangeRequest(reminderDraftOf(carService), carService)).toMatchObject({ givenTo: ['m-alex'] });
    });
  });

  describe('a goal', () => {
    it('knows what a goal counts, and reads an amount in that unit', () => {
      expect(kindOfGoal(goal())).toBe('money');
      expect(kindOfGoal(booksGoal)).toBe('count');
      expect(kindOfGoal(goal({ how: 'ticks', unit: 'count' }))).toBe('steps');
      expect(readAmount('12.50', 'money')).toBe(1250);
      expect(readAmount('20', 'count')).toBe(20);
      expect(readAmount('12.50', 'count')).toBeNull();
      expect(stepsOf(' Pack \n\n Van ')).toEqual(['Pack', 'Van']);
    });

    it('says what is missing before anything is sent', () => {
      const says = words.plan.goalForm;
      expect(goalProblems(newGoalDraft(), says)).toEqual({ title: 'Give the goal a name first.', target: 'Say how much, or how many.' });
      expect(goalProblems({ ...newGoalDraft(), title: 'Move', kind: 'steps' }, says)).toEqual({ steps: 'Write at least one step.' });
      expect(goalProblems({ ...newGoalDraft(), title: 'Skates', target: '90' }, says)).toEqual({});
    });

    it('fills the form of a goal that exists with its amount as it is typed', () => {
      expect(goalDraftOf(goal())).toMatchObject({ kind: 'money', target: '8000', by: '2027-03-31' });
      expect(goalDraftOf(goal({ target: 1250 })).target).toBe('12.50');
      expect(goalDraftOf(booksGoal)).toMatchObject({ kind: 'count', target: '20', by: null });
    });

    it('sends a goal of steps without a target, and changes a day to be done by in so many words', () => {
      expect(newGoalRequest({ ...newGoalDraft(), title: 'Move', kind: 'steps', steps: 'Pack\nVan' }, { clientId: 'c-1', circleId: 'c-linds' })).toMatchObject({ how: 'ticks', steps: ['Pack', 'Van'] });
      expect(goalChangeRequest({ ...goalDraftOf(goal()), by: null }, goal())).toMatchObject({ removeTargetDay: true, target: 800000 });
      expect(goalChangeRequest({ ...goalDraftOf(booksGoal), unitWords: 'books', target: '25' }, booksGoal)).toMatchObject({ target: 25, unitWords: 'books' });
      expect(goalChangeRequest(goalDraftOf(booksGoal), booksGoal)).not.toHaveProperty('removeTargetDay');
    });
  });
});

describe("Plan's own words", () => {
  it('say how often something comes round the way the API does', () => {
    const label = words.plan.repeat.label;
    expect(label({ unit: 'day' })).toBe('Every day');
    expect(label({ unit: 'day', every: 2 })).toBe('Every other day');
    expect(label({ unit: 'month', every: 3 })).toBe('Every 3 months');
    expect(label({ unit: 'year' })).toBe('Every year');
    expect(label({ unit: 'week' })).toBe('Every week');
    expect(label({ unit: 'week', days: ['thu'] })).toBe('Thursdays');
    expect(label({ unit: 'week', days: ['fri', 'tue'] })).toBe('Tue and Fri');
    expect(label({ unit: 'week', days: ['mon', 'tue', 'wed', 'thu', 'fri'] })).toBe('Weekdays');
    expect(label({ unit: 'week', days: ['sat', 'sun'] })).toBe('Weekends');
    expect(label({ unit: 'week', days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] })).toBe('Every day');
    expect(label({ unit: 'week', every: 2, days: ['thu'] })).toBe('Every other Thursday');
    expect(label({ unit: 'week', every: 3, days: ['thu'] })).toBe('Every 3 weeks on Thursday');
    expect(label({ unit: 'week', every: 2, days: ['mon', 'wed'] })).toBe('Every other week on Mon and Wed');
  });

  it('say how long ahead a reminder comes', () => {
    const before = words.plan.remind.before;
    expect(before(0)).toBe('At the time');
    expect(before(10)).toBe('10 minutes before');
    expect(before(60)).toBe('1 hour before');
    expect(before(120)).toBe('2 hours before');
    expect(before(1440)).toBe('1 day before');
    expect(before(10080)).toBe('1 week before');
  });

  it('count who is coming, in one line with its bold part', () => {
    expect(words.plan.event.going(9, 0, 2)).toEqual([{ mark: 'bold', text: '9 going' }, " · 2 haven't answered"]);
    expect(words.plan.event.going(3, 1, 1)).toEqual([{ mark: 'bold', text: '3 going' }, ' · 1 maybe', " · 1 hasn't answered"]);
    expect(words.plan.event.going(0, 0, 0)).toEqual([{ mark: 'bold', text: '0 going' }]);
  });
});

import { alex, biscuit, leo, mia, noraInLinds } from '@/test/samples';
import { askAlex, milk, onSampleToday, readItem } from '@/test/samples/plan';

import { eventOf, fixOf, readOf, reminderOf, whenLabel, whoLabel } from '../reading';

const members = [noraInLinds, alex, mia, leo, biscuit];
const making = { clientId: 'client-1', circleId: 'c-linds', today: '2026-11-11', members };

describe('how a typed line was read, and what the person corrected of it', () => {
  beforeAll(onSampleToday);
  afterAll(() => jest.useRealTimers());

  it('is what the API read while nothing is corrected', () => {
    const read = readOf(readItem());
    expect(read).toEqual({ as: 'event', title: 'Haircut', when: { day: '2026-11-14', time: '10:00', endTime: '10:30' }, personId: 'm-leo', personRole: 'for', remindMinutes: 60, repeat: null, place: 'Barber Miha', fixed: [] });
  });

  it('takes a correction of one piece and leaves the others as they were read', () => {
    const item = readItem();
    const fixes = fixOf(item, {}, 'when', { day: '2026-11-14', time: '11:00', endTime: '11:30' });
    const read = readOf(item, fixes);
    expect(read.when).toEqual({ day: '2026-11-14', time: '11:00', endTime: '11:30' });
    expect(read.fixed).toEqual(['when']);
    expect(read.personId).toBe('m-leo');
    expect(whenLabel(read.when)).toBe('Sat 14 Nov · 11:00 to 11:30');
  });

  it('forgets a correction when it is set back to what was read', () => {
    const item = readItem();
    const fixes = fixOf(item, fixOf(item, {}, 'remind', 30), 'remind', 60);
    expect(fixes).toEqual({});
    expect(readOf(item, fixes).fixed).toEqual([]);
  });

  it('lets the sentence win again when the piece is typed differently after it was corrected', () => {
    const fixes = fixOf(readItem(), {}, 'when', { day: '2026-11-14', time: '11:00', endTime: '11:30' });
    // The person types on: "…Sunday at 10". The correction was for Saturday.
    const retyped = readItem({ day: '2026-11-15' });
    expect(readOf(retyped, fixes).when).toEqual({ day: '2026-11-15', time: '10:00', endTime: '10:30' });
    expect(readOf(retyped, fixes).fixed).toEqual([]);
    // A correction of another piece still holds.
    const both = fixOf(readItem(), fixes, 'person', 'm-mia');
    expect(readOf(retyped, both).fixed).toEqual(['person']);
  });

  it('says who it is for the way the API does, also for a name that was picked', () => {
    const item = readItem();
    expect(whoLabel(readOf(item, fixOf(item, {}, 'person', 'm-mia')), members)).toBe('For Mia');
    expect(whoLabel(readOf(item, fixOf(item, {}, 'person', 'm-nora')), members)).toBe('For you');
    expect(whoLabel(readOf(item, fixOf(item, {}, 'person', null)), members)).toBe('For nobody in particular');
    // A reminder nobody was named in: a picked name is who it is given to.
    const plain = readItem({ as: 'reminder', person: null, personRole: null, personLabel: null });
    expect(whoLabel(readOf(plain, fixOf(plain, {}, 'person', 'm-alex')), members)).toBe('Given to Alex');
    expect(whoLabel(readOf(askAlex), members)).toBe('Given to Alex');
  });

  it('writes when without a time, and nothing without a day', () => {
    expect(whenLabel({ day: '2026-11-14', time: null, endTime: null })).toBe('Sat 14 Nov');
    expect(whenLabel({ day: '2026-11-14', time: '18:00', endTime: null })).toBe('Sat 14 Nov · 18:00');
    expect(whenLabel({ day: null, time: null, endTime: null })).toBeNull();
  });

  it('makes the event the way the API files one: named for who it is for, who is coming, on their page', () => {
    const item = readItem();
    const read = readOf(item, fixOf(item, {}, 'when', { day: '2026-11-14', time: '11:00', endTime: '11:30' }));
    expect(eventOf(read, making)).toEqual({
      clientId: 'client-1',
      circleId: 'c-linds',
      title: 'Haircut · Leo',
      day: '2026-11-14',
      time: '11:00',
      endTime: '11:30',
      timeZone: expect.any(String),
      place: 'Barber Miha',
      remindMinutes: 60,
      repeat: undefined,
      guests: [{ memberId: 'm-leo' }],
      about: ['m-leo'],
      audience: undefined,
    });
  });

  it('makes an event for today when no day was read, and gives one that was a reminder half an hour', () => {
    const turned = readOf(askAlex, fixOf(askAlex, {}, 'as', 'event'));
    const made = eventOf(turned, making);
    expect(made.title).toBe('Book the car service');
    expect([made.time, made.endTime]).toEqual(['18:00', '18:30']);
    // "Given to Alex" on an event is nobody coming and nobody's page.
    expect(made.guests).toEqual([]);
    expect(eventOf(readOf(readItem({ day: null, time: null, endTime: null })), making).day).toBe('2026-11-11');
  });

  it('makes the reminder the way the API files one: given to the person it names, unless that is you or a pet', () => {
    const read = readOf(askAlex, fixOf(askAlex, {}, 'remind', 30));
    expect(reminderOf(read, making)).toEqual({ clientId: 'client-1', circleId: 'c-linds', title: 'Book the car service', dueOn: '2026-11-12', dueTime: '18:00', timeZone: expect.any(String), remindMinutes: 30, repeat: undefined, givenTo: ['m-alex'], about: undefined, audience: undefined });
    expect(reminderOf(readOf(askAlex, fixOf(askAlex, {}, 'person', 'm-nora')), making).givenTo).toEqual([]);
    expect(reminderOf(readOf(askAlex, fixOf(askAlex, {}, 'person', 'm-biscuit')), making).givenTo).toEqual([]);
    // Without a day there is no time and nothing to repeat.
    const someTime = readOf(askAlex, fixOf(askAlex, {}, 'when', { day: null, time: '18:00', endTime: null }));
    expect(reminderOf(someTime, making)).toMatchObject({ dueOn: undefined, dueTime: undefined, repeat: undefined });
  });

  it('has nothing to correct in a line for a list', () => {
    expect(readOf(milk)).toMatchObject({ as: 'list_item', title: 'Milk', personId: null, personRole: null, fixed: [] });
  });
});

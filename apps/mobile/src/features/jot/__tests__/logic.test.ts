import { codeJot, codeRead, carRead, eggsJot, eggsRead, jotMade, letterReading, letterText, mumRead, noteJot, plumberJot, readItem, reading } from '@/test/samples/jot';

import { readingChip, readingLine } from '../kinds';
import { foundIn, letterTitle } from '../letter';
import { batches, todaysJots } from '../today';
import { sameLines, widgetLines } from '../widgetLines';

const at = (minutesAgo: number, now: Date) => new Date(now.getTime() - minutesAgo * 60_000).toISOString();

describe("today's jots, as the screens group them", () => {
  const now = new Date(2026, 10, 11, 12, 0, 0);

  it('splits what was filed just now from what came earlier today', () => {
    const jots = [jotMade({ id: 'a', createdAt: at(1, now) }), jotMade({ id: 'b', createdAt: at(2, now) }), jotMade({ id: 'c', createdAt: at(9, now) }), jotMade({ id: 'd', createdAt: at(200, now) }), jotMade({ id: 'e', createdAt: at(230, now) })];
    const { fresh, latest, earlier } = todaysJots(jots, now);
    expect(fresh).toBe(true);
    expect(latest.map((jot) => jot.id)).toEqual(['a', 'b', 'c']);
    expect(earlier.map((jot) => jot.id)).toEqual(['d', 'e']);
  });

  it('calls nothing "just now" when the latest is a while ago, and leaves other days out', () => {
    const jots = [jotMade({ id: 'a', createdAt: at(45, now) }), jotMade({ id: 'b', createdAt: at(50, now) }), jotMade({ id: 'old', createdAt: at(60 * 30, now) })];
    expect(todaysJots(jots, now)).toEqual({ fresh: false, latest: [jots[0], jots[1]], earlier: [] });
    expect(todaysJots([], now)).toEqual({ fresh: false, latest: [], earlier: [] });
  });

  it('puts what one line made on one row, the oldest line first', () => {
    const bread = jotMade({ id: 'j-bread', title: 'Bread', createdAt: at(230, now) });
    const milk = jotMade({ id: 'j-milk', createdAt: at(230, now) });
    const note = { ...noteJot, createdAt: at(200, now) };
    // The API lists the latest first.
    expect(batches([note, bread, milk])).toEqual([
      { id: 'b-1:Groceries', became: 'list_item', titles: ['Milk', 'Bread'], where: 'Groceries', at: milk.createdAt },
      { id: 'b-3:Note', became: 'note', titles: [note.title], where: 'Note', at: note.createdAt },
    ]);
    // One line that went to two places is two rows.
    expect(batches([{ ...plumberJot, batchId: 'b-1' }, milk]).map((row) => row.titles)).toEqual([['Milk'], ['Call the plumber']]);
  });
});

describe('a reading, in words', () => {
  it('is a chip under the line: what, and where or when', () => {
    expect(readingChip(eggsRead, 'm-nora')).toBe('Eggs · Groceries');
    // Given to someone else: their name is the news.
    expect(readingChip(carRead, 'm-nora')).toBe('Alex · today 18:00');
    expect(readingChip(mumRead, 'm-nora')).toBe('Call Mum · today 18:00');
    expect(readingChip(codeRead, 'm-nora')).toBe('Gate code 4471 · looks like a code');
    expect(readingChip(readItem({ as: 'note', title: 'A thought', list: null }), 'm-nora')).toBe('A thought · Note');
    expect(readingChip(readItem({ as: 'reminder', title: 'Water the plants', list: null }), 'm-nora')).toBe('Water the plants · Reminder');
  });

  it('is the small line under a thing on the voice screen', () => {
    expect(readingLine(eggsRead)).toBe('Groceries');
    expect(readingLine(mumRead)).toBe('Reminder · today 18:00 · for you');
    expect(readingLine(carRead)).toBe('Reminder · today 18:00 · given to Alex');
    expect(readingLine(codeRead)).toBe('Looks like a code · the Vault');
    expect(readingLine(readItem({ as: 'event', title: 'Dentist', whenNear: 'Tue 17 Nov, 15:00', personLabel: 'For Mia', list: null }))).toBe('Event · Tue 17 Nov, 15:00 · for Mia');
  });
});

describe('what was read from a letter', () => {
  it('names the letter by its first sentence', () => {
    expect(letterTitle(letterText, 'A letter')).toBe('Class 4B is going to the Postojna caves on Friday 20 November at 8:00');
    expect(letterTitle('\n\n  School trip  \nDear parents', 'A letter')).toBe('School trip');
    expect(letterTitle('   ', 'A letter')).toBe('A letter');
    expect(letterTitle('x'.repeat(200), 'A letter')).toHaveLength(70);
  });

  it('is a row for each day and each amount, and one for the letter itself', () => {
    const found = foundIn(letterReading, letterText, '2026-11-11', 'A letter');
    expect(found.map((row) => row.kind)).toEqual(['event', 'reminder', 'bill', 'keep']);
    expect(found[0]).toEqual({ id: 'date-0', kind: 'event', title: 'Class 4B is going to the Postojna caves', day: '2026-11-20', time: '08:00' });
    expect(found[1]).toEqual({ id: 'date-1', kind: 'reminder', title: 'Sign the attached form and return it', day: '2026-11-18', time: null });
    // The bill is due on the day the letter asks for things by.
    expect(found[2]).toMatchObject({ kind: 'bill', cents: 1200, currency: 'EUR', dueOn: '2026-11-18' });
    expect(found[3]).toMatchObject({ kind: 'keep', body: letterText });
  });

  it('dates a bill by the first day when nothing is due, and by today when the letter names no day', () => {
    const amount = letterReading.amounts[0]!;
    expect(foundIn({ ...letterReading, dates: [letterReading.dates[0]!] }, letterText, '2026-11-11', 'A letter')[1]).toMatchObject({ kind: 'bill', dueOn: '2026-11-20' });
    expect(foundIn({ letter: true, items: [], dates: [], amounts: [amount] }, letterText, '2026-11-11', 'A letter')[0]).toMatchObject({ kind: 'bill', dueOn: '2026-11-11' });
  });

  it('takes the events and reminders of a short text that reads as a line, and offers nothing for no words', () => {
    const line = reading([readItem({ as: 'event', title: 'Dentist', day: '2026-11-17', time: '15:00', list: null }), eggsRead]);
    expect(foundIn(line, 'dentist Tuesday at 3, eggs', '2026-11-11', 'A letter').map((row) => row.kind)).toEqual(['event', 'keep']);
    expect(foundIn(undefined, '  ', '2026-11-11', 'A letter')).toEqual([]);
  });
});

describe('the lines a widget shows', () => {
  const lines = [
    { id: 'a', text: 'Bananas', done: false },
    { id: 'b', text: 'Strawberries', done: false },
    { id: 'c', text: 'Oat milk', done: false },
    { id: 'd', text: 'Butter', done: true },
  ];

  it('are the first few of the list', () => {
    expect(widgetLines(lines, [], 3).map((line) => line.id)).toEqual(['a', 'b', 'c']);
  });

  it('keep a line that was ticked here in its place, though the list now starts with what is left', () => {
    const shown = [{ ...lines[0]!, done: true }, lines[1]!, lines[2]!];
    // The API lists what is left first: the ticked line has dropped out of the first few.
    const fresh = [lines[1]!, lines[2]!, { id: 'e', text: 'Coffee', done: false }, { id: 'f', text: 'Bread', done: false }];
    expect(widgetLines(fresh, shown, 3).map((line) => [line.id, line.done])).toEqual([['a', true], ['b', false], ['c', false]]);
  });

  it('drop a line someone removed, take the next one in, and follow a tick made elsewhere', () => {
    const fresh = [{ ...lines[0]!, done: true }, lines[2]!, { id: 'e', text: 'Coffee', done: false }];
    expect(widgetLines(fresh, lines.slice(0, 3), 3)).toEqual([{ ...lines[0]!, done: true }, lines[2]!, { id: 'e', text: 'Coffee', done: false }]);
    expect(sameLines(lines, [...lines])).toBe(true);
    expect(sameLines(lines, [{ ...lines[0]!, done: true }, ...lines.slice(1)])).toBe(false);
  });
});

it('the samples are whole jots', () => {
  expect([eggsJot, codeJot].map((jot) => jot.became)).toEqual(['list_item', 'code']);
});

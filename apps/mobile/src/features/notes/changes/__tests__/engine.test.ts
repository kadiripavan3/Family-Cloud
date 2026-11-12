import { ApiError } from '@/api/fetcher';
import type { LateBlockChange, LateLineChange } from '@/api/generated/homeport';

import { ChangesEngine, MOST_TRIES, STUCK_AFTER } from '../engine';
import { MOST_AT_ONCE } from '../send';
import type { Answer, Change, ChangeInput, ChangeStore, Sent, Target } from '../types';

let mockNext = 0;
jest.mock('@/lib/ids', () => ({ newClientId: () => `k${(mockNext += 1)}` }));

const groceries: Target = { kind: 'checklist', id: 'groceries' };
const packing: Target = { kind: 'checklist', id: 'packing' };
const wifi: Target = { kind: 'page', id: 'wifi' };

const tick = (itemId: string, done = true, target: Target = groceries): ChangeInput => ({ target, body: { op: 'change', itemId, change: { done } } });
const line = (clientId: string, text: string, target: Target = groceries): ChangeInput => ({ target, body: { op: 'add', add: { clientId, text } } });
const gone = (itemId: string, target: Target = groceries): ChangeInput => ({ target, body: { op: 'remove', itemId } });

const done = (id: string | null = null): Answer => ({ outcome: 'done', id, said: null });
const unreachable = () => new ApiError(0, 'unreachable', "Can't reach Homeport right now.");
const notNow = () => new ApiError(503, 'busy', 'Homeport is being updated. Try again in a moment.');

/** A store that lives in memory, like the phone's but without the phone. */
function memory(initial: Change[] = []) {
  const rows = new Map(initial.map((row) => [row.key, row]));
  const store: ChangeStore = {
    load: async (owner) => [...rows.values()].filter((row) => row.owner === owner).sort((a, b) => a.seq - b.seq),
    save: async (row) => void rows.set(row.key, row),
    remove: async (keys) => keys.forEach((key) => rows.delete(key)),
    removeAll: async (owner) => {
      for (const row of [...rows.values()]) if (row.owner === owner) rows.delete(row.key);
    },
  };
  return { rows, store };
}

/** Lets everything that is ready to happen, happen: promises that have their answer, and what follows from them. */
async function settle() {
  for (let turn = 0; turn < 20; turn += 1) await Promise.resolve();
}

/** What was sent, as short words: "tick:bananas", "add:c1", "remove:x". */
const said = (part: readonly Change[]) =>
  part.map((change) => {
    const body = change.body as LateLineChange & LateBlockChange;
    if (body.op === 'add') return `add:${body.add?.clientId}`;
    if (body.op === 'remove') return `remove:${body.itemId ?? body.blockId}`;
    return `${body.change?.done === false ? 'untick' : body.change?.done ? 'tick' : 'change'}:${body.itemId ?? body.blockId}`;
  });

type Send = jest.Mock<Promise<Sent>, [target: Target, part: readonly Change[]]>;
/** An API of the test's own making. */
const api = (answer: (target: Target, part: readonly Change[]) => Promise<Sent>): Send => jest.fn(answer);

/** An engine with a store in memory and an API that says "done" to everything, unless the test says otherwise. */
function make(options: { kept?: Change[]; send?: Send; answeredAt?: () => number; owner?: string } = {}) {
  const { rows, store } = memory(options.kept);
  const send: Send = options.send ?? jest.fn(async (target: Target, part: readonly Change[]) => ({ answers: part.map(() => done()), now: { id: target.id, sent: said(part) } }));
  const onSent = jest.fn();
  const engine = new ChangesEngine({ store, owner: options.owner ?? 'nora', onSent, send, answeredAt: options.answeredAt ?? (() => 0) });
  return { engine, rows, store, send, onSent };
}

/** A request that waits until the test answers it. */
function held() {
  let answer!: (sent: Sent) => void;
  let fail!: (error: unknown) => void;
  const promise = new Promise<Sent>((resolve, reject) => {
    answer = resolve;
    fail = reject;
  });
  return { promise, answer, fail };
}

describe('the queue of changes', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-11-12T10:00:00Z'));
    mockNext = 0;
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  describe('online', () => {
    it('shows a change at once, sends it, and hands the screen the list as the API has it afterwards', async () => {
      const { engine, send, onSent, rows } = make();
      engine.start();
      await settle();
      const heard = jest.fn();
      engine.subscribe(heard);
      engine.add(tick('bananas'));
      // On the screen from this moment, and on the phone.
      expect(engine.viewOf(groceries).changes.map((change) => change.body)).toEqual([{ op: 'change', itemId: 'bananas', change: { done: true } }]);
      expect(engine.viewOf(groceries).sending).toBe(true);
      expect(heard).toHaveBeenCalled();
      await settle();
      expect(send).toHaveBeenCalledTimes(1);
      expect(said(send.mock.calls[0]![1])).toEqual(['tick:bananas']);
      expect(onSent).toHaveBeenCalledWith(groceries, { id: 'groceries', sent: ['tick:bananas'] });
      expect(engine.viewOf(groceries).changes).toEqual([]);
      expect(engine.viewOf(groceries).sending).toBe(false);
      expect(engine.viewOf(groceries).held).toBe(false);
      expect(rows.size).toBe(0);
      expect(engine.waiting()).toBe(0);
    });

    it('sends what was made while a part was on its way in the next part, in the order it was made', async () => {
      const first = held();
      const send: Send = jest.fn();
      send.mockReturnValueOnce(first.promise);
      send.mockImplementation(async (_target, part) => ({ answers: part.map(() => done()), now: undefined }));
      const { engine } = make({ send });
      engine.start();
      engine.add(tick('bananas'));
      await settle();
      engine.add(tick('milk'));
      engine.add(tick('bananas', false));
      engine.add(gone('butter'));
      await settle();
      // One request at a time for a list: the three wait for the first to come back.
      expect(send).toHaveBeenCalledTimes(1);
      expect(engine.viewOf(groceries).changes).toHaveLength(4);
      first.answer({ answers: [done()], now: undefined });
      await settle();
      expect(send).toHaveBeenCalledTimes(2);
      expect(said(send.mock.calls[1]![1])).toEqual(['tick:milk', 'untick:bananas', 'remove:butter']);
      expect(engine.viewOf(groceries).changes).toEqual([]);
    });

    it('keeps the same view until something about that queue changes, and an empty one for a list nothing waits for', async () => {
      const { engine } = make();
      engine.start();
      const nothing = engine.viewOf(groceries);
      expect(nothing).toEqual({ changes: [], sending: false, held: false, stuck: null, aliases: {}, notices: [] });
      expect(engine.viewOf(packing)).toBe(nothing);
      engine.setOnline(false);
      engine.add(tick('bananas'));
      const waiting = engine.viewOf(groceries);
      expect(engine.viewOf(groceries)).toBe(waiting);
      // Another list's change is not this list's news.
      engine.add(tick('socks', true, packing));
      expect(engine.viewOf(groceries)).toBe(waiting);
      engine.add(tick('milk'));
      expect(engine.viewOf(groceries)).not.toBe(waiting);
    });
  });

  describe('offline', () => {
    it('keeps ticks, new lines and changed lines on the phone, marks them as waiting, and sends nothing', async () => {
      const { engine, send, rows } = make();
      engine.start();
      engine.setOnline(false);
      engine.add(tick('bananas'));
      engine.add(line('c1', 'Oat milk'));
      engine.add({ target: groceries, body: { op: 'change', itemId: 'milk', change: { text: 'Milk, 3 litres' } } });
      await settle();
      jest.advanceTimersByTime(10 * 60_000);
      await settle();
      expect(send).not.toHaveBeenCalled();
      const view = engine.viewOf(groceries);
      expect(view.held).toBe(true);
      expect(view.sending).toBe(false);
      expect(said(view.changes)).toEqual(['tick:bananas', 'add:c1', 'change:milk']);
      expect(rows.size).toBe(3);
      expect(engine.waiting()).toBe(3);
    });

    it('sends everything in the order it was made as soon as the connection is back, and the marks go', async () => {
      const { engine, send, onSent } = make();
      engine.start();
      engine.setOnline(false);
      engine.add(tick('bananas'));
      engine.add(tick('strawberries'));
      engine.add(line('c1', 'Oat milk'));
      engine.add(tick('bananas', false));
      await settle();
      engine.setOnline(true);
      await settle();
      expect(send).toHaveBeenCalledTimes(1);
      expect(send.mock.calls[0]![0]).toEqual(groceries);
      expect(said(send.mock.calls[0]![1])).toEqual(['tick:bananas', 'tick:strawberries', 'add:c1', 'untick:bananas']);
      expect(onSent).toHaveBeenCalledTimes(1);
      expect(engine.viewOf(groceries)).toMatchObject({ changes: [], held: false, sending: false });
    });

    it('names a line that was added and ticked offline by the clientId it was added with', async () => {
      const { engine, send } = make();
      engine.start();
      engine.setOnline(false);
      engine.add(line('c1', 'Oat milk'));
      engine.add(tick('c1'));
      engine.add({ target: groceries, body: { op: 'change', itemId: 'bananas', change: { before: 'c1' } } });
      engine.setOnline(true);
      await settle();
      expect(send.mock.calls[0]![1].map((change) => change.body)).toEqual([
        { op: 'add', add: { clientId: 'c1', text: 'Oat milk' } },
        { op: 'change', itemId: 'c1', change: { done: true } },
        { op: 'change', itemId: 'bananas', change: { before: 'c1' } },
      ]);
    });

    it('goes on calling an added line by its real id once the API has given it one', async () => {
      const first = held();
      const send: Send = jest.fn();
      send.mockReturnValueOnce(first.promise);
      send.mockImplementation(async (_target, part) => ({ answers: part.map(() => done()), now: undefined }));
      const { engine, rows } = make({ send });
      engine.start();
      engine.add(line('c1', 'Oat milk'));
      await settle();
      // While the new line is on its way, the person ticks it and moves another one before it.
      engine.add(tick('c1'));
      engine.add({ target: groceries, body: { op: 'change', itemId: 'bananas', change: { before: 'c1' } } });
      await settle();
      first.answer({ answers: [done('item-77')], now: undefined });
      await settle();
      expect(engine.viewOf(groceries).aliases).toEqual({ c1: 'item-77' });
      expect(send.mock.calls[1]![1].map((change) => change.body)).toEqual([
        { op: 'change', itemId: 'item-77', change: { done: true } },
        { op: 'change', itemId: 'bananas', change: { before: 'item-77' } },
      ]);
      // And what is made after that, with the old name the screen may still hold, is renamed on the way in.
      engine.setOnline(false);
      engine.add(tick('c1', false));
      expect(engine.viewOf(groceries).changes[0]!.body).toEqual({ op: 'change', itemId: 'item-77', change: { done: false } });
      expect([...rows.values()].map((row) => row.body)).toEqual([{ op: 'change', itemId: 'item-77', change: { done: false } }]);
    });

    it('renames what waits on the phone too, so it is found after a restart', async () => {
      const first = held();
      const second = held();
      const send: Send = jest.fn();
      send.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
      const { engine, rows } = make({ send });
      engine.start();
      engine.add({ target: wifi, body: { op: 'add', add: { clientId: 'b1', kind: 'paragraph', text: 'The heating app' } } });
      await settle();
      engine.add({ target: wifi, body: { op: 'change', blockId: 'b1', change: { text: 'The heating app is on the tablet.' } } });
      engine.add({ target: wifi, body: { op: 'add', add: { clientId: 'b2', kind: 'bullet', text: 'Boiler code', after: 'b1' } } });
      engine.add({ target: wifi, body: { op: 'change', blockId: 'top', change: { after: 'b1' } } });
      await settle();
      first.answer({ answers: [done('block-9')], now: undefined });
      await settle();
      expect([...rows.values()].sort((a, b) => a.seq - b.seq).map((row) => row.body)).toEqual([
        { op: 'change', blockId: 'block-9', change: { text: 'The heating app is on the tablet.' } },
        { op: 'add', add: { clientId: 'b2', kind: 'bullet', text: 'Boiler code', after: 'block-9' } },
        { op: 'change', blockId: 'top', change: { after: 'block-9' } },
      ]);
    });
  });

  describe('what the API says to each change', () => {
    it('tells the person about a change to something that has gone, and lets the rest go in', async () => {
      const send = api(async () => ({
        answers: [done(), { outcome: 'gone', id: 'butter', said: 'That line was removed while you were away, so there was nothing to change.' }, done('item-5')],
        now: { id: 'groceries' },
      }));
      const { engine, onSent, rows } = make({ send });
      engine.start();
      engine.setOnline(false);
      engine.add(tick('bananas'));
      engine.add(tick('butter'));
      engine.add(line('c1', 'Oat milk'));
      engine.setOnline(true);
      await settle();
      const view = engine.viewOf(groceries);
      expect(view.changes).toEqual([]);
      expect(view.notices).toEqual([{ key: 'k2', outcome: 'gone', said: 'That line was removed while you were away, so there was nothing to change.' }]);
      expect(view.aliases).toEqual({ c1: 'item-5' });
      expect(onSent).toHaveBeenCalledWith(groceries, { id: 'groceries' });
      expect(rows.size).toBe(0);
      // Read, and it goes.
      engine.dismiss(groceries);
      expect(engine.viewOf(groceries).notices).toEqual([]);
    });

    it('tells the person why a change was refused, in the words of the API, and does not send it again', async () => {
      const send = api(async () => ({ answers: [{ outcome: 'refused', id: 'milk', said: 'Keep a line to 300 characters or fewer.' }], now: undefined }));
      const { engine } = make({ send });
      engine.start();
      engine.add({ target: groceries, body: { op: 'change', itemId: 'milk', change: { text: 'x'.repeat(400) } } });
      await settle();
      jest.advanceTimersByTime(60 * 60_000);
      await settle();
      expect(send).toHaveBeenCalledTimes(1);
      expect(engine.viewOf(groceries).changes).toEqual([]);
      expect(engine.viewOf(groceries).notices).toEqual([{ key: 'k1', outcome: 'refused', said: 'Keep a line to 300 characters or fewer.' }]);
    });

    it('has its own sentence for an answer that came without one', async () => {
      const send = api(async () => ({ answers: [{ outcome: 'gone', id: null, said: null }], now: undefined }));
      const { engine } = make({ send });
      engine.start();
      engine.add(tick('butter'));
      await settle();
      expect(engine.viewOf(groceries).notices[0]!.said).toBe('Something you changed here was removed while you were away, so there was nothing left to change.');
    });

    it('drops the whole queue of a list that is gone itself, and says so once', async () => {
      const send = api(async () => {
        throw new ApiError(404, 'not_found', "That isn't there any more, or it isn't shared with you.");
      });
      const { engine, rows, onSent } = make({ send });
      engine.start();
      engine.setOnline(false);
      engine.add(tick('bananas'));
      engine.add(tick('milk'));
      engine.add(line('c1', 'Oat milk'));
      engine.setOnline(true);
      await settle();
      jest.advanceTimersByTime(60 * 60_000);
      await settle();
      expect(send).toHaveBeenCalledTimes(1);
      expect(onSent).not.toHaveBeenCalled();
      const view = engine.viewOf(groceries);
      expect(view.changes).toEqual([]);
      expect(view.held).toBe(false);
      expect(view.notices).toEqual([{ key: 'k4', outcome: 'gone', said: "That isn't there any more, or it isn't shared with you." }]);
      expect(rows.size).toBe(0);
    });

    it('does the same for a list the person may only look at now', async () => {
      const send = api(async () => {
        throw new ApiError(403, 'view_only', 'You can look at this, but not change it.');
      });
      const { engine } = make({ send });
      engine.start();
      engine.add(tick('bananas'));
      await settle();
      expect(engine.viewOf(groceries).changes).toEqual([]);
      expect(engine.viewOf(groceries).notices[0]).toMatchObject({ outcome: 'gone', said: 'You can look at this, but not change it.' });
    });

    it('sends the changes of a part the API would not take one by one, so only the wrong one is lost', async () => {
      const send = api(async (_target, part) => {
        // The API checks a request as a whole before it does any of it.
        if (part.some((change) => (change.body as LateLineChange).add?.text === '')) throw new ApiError(400, 'invalid_input', 'Write what to add.');
        return { answers: part.map(() => done()), now: undefined };
      });
      const { engine } = make({ send });
      engine.start();
      engine.setOnline(false);
      engine.add(tick('bananas'));
      engine.add(line('c1', ''));
      engine.add(tick('milk'));
      engine.setOnline(true);
      await settle();
      expect(send.mock.calls.map((call) => said(call[1]))).toEqual([['tick:bananas', 'add:c1', 'tick:milk'], ['tick:bananas'], ['add:c1'], ['tick:milk']]);
      expect(engine.viewOf(groceries).changes).toEqual([]);
      expect(engine.viewOf(groceries).notices).toEqual([{ key: 'k2', outcome: 'refused', said: 'Write what to add.' }]);
      // The queue is empty: the next changes go together again.
      engine.setOnline(false);
      engine.add(tick('eggs'));
      engine.add(tick('bread'));
      engine.setOnline(true);
      await settle();
      expect(said(send.mock.calls.at(-1)![1])).toEqual(['tick:eggs', 'tick:bread']);
    });
  });

  describe('when a try fails', () => {
    it('keeps everything in its place when nothing answered, rests, and tries again by itself', async () => {
      const send: Send = jest.fn();
      send.mockRejectedValueOnce(unreachable());
      send.mockImplementation(async (_target, part) => ({ answers: part.map(() => done()), now: undefined }));
      const { engine, rows } = make({ send });
      engine.start();
      engine.add(tick('bananas'));
      engine.add(tick('milk'));
      await settle();
      expect(send).toHaveBeenCalledTimes(1);
      // The phone says it is online, but nothing answered: the lines show that they wait.
      expect(engine.viewOf(groceries)).toMatchObject({ held: true, sending: false, stuck: null });
      expect(said(engine.viewOf(groceries).changes)).toEqual(['tick:bananas', 'tick:milk']);
      expect(rows.size).toBe(2);
      jest.advanceTimersByTime(14_000);
      await settle();
      expect(send).toHaveBeenCalledTimes(1);
      jest.advanceTimersByTime(1_000);
      await settle();
      expect(send).toHaveBeenCalledTimes(2);
      expect(said(send.mock.calls[1]![1])).toEqual(['tick:bananas', 'tick:milk']);
      expect(engine.viewOf(groceries)).toMatchObject({ changes: [], held: false });
    });

    it('rests longer each time nothing answers, up to two minutes', async () => {
      const send = api(async () => {
        throw unreachable();
      });
      const { engine } = make({ send });
      engine.start();
      engine.add(tick('bananas'));
      await settle();
      for (const [rest, calls] of [
        [15_000, 2],
        [30_000, 3],
        [60_000, 4],
        [120_000, 5],
        [120_000, 6],
      ] as const) {
        jest.advanceTimersByTime(rest - 1);
        await settle();
        expect(send).toHaveBeenCalledTimes(calls - 1);
        jest.advanceTimersByTime(1);
        await settle();
        expect(send).toHaveBeenCalledTimes(calls);
      }
      // For as long as the API answers nobody, this is the connection: it is never given up on.
      expect(engine.viewOf(groceries).stuck).toBeNull();
    });

    it('tries at once when the connection comes back, whatever rest was left', async () => {
      const send: Send = jest.fn();
      send.mockRejectedValueOnce(unreachable());
      send.mockImplementation(async (_target, part) => ({ answers: part.map(() => done()), now: undefined }));
      const { engine } = make({ send });
      engine.start();
      engine.add(tick('bananas'));
      await settle();
      engine.setOnline(false);
      jest.advanceTimersByTime(60_000);
      await settle();
      expect(send).toHaveBeenCalledTimes(1);
      engine.setOnline(true);
      await settle();
      expect(send).toHaveBeenCalledTimes(2);
      expect(engine.viewOf(groceries).changes).toEqual([]);
    });

    it('waits and tries again after "not now", longer each time, and stops after six with the API\'s sentence', async () => {
      const send = api(async () => {
        throw notNow();
      });
      const { engine, rows } = make({ send });
      engine.start();
      engine.add(tick('bananas'));
      await settle();
      const waits = [10_000, 20_000, 40_000, 80_000, 160_000];
      for (const [index, wait] of waits.entries()) {
        expect(engine.viewOf(groceries)).toMatchObject({ held: true, stuck: null });
        jest.advanceTimersByTime(wait - 1);
        await settle();
        expect(send).toHaveBeenCalledTimes(index + 1);
        jest.advanceTimersByTime(1);
        await settle();
        expect(send).toHaveBeenCalledTimes(index + 2);
      }
      expect(send).toHaveBeenCalledTimes(MOST_TRIES);
      expect(engine.viewOf(groceries)).toMatchObject({ held: true, stuck: 'Homeport is being updated. Try again in a moment.' });
      // It doesn't go on by itself; the change is still there, on the screen and on the phone.
      jest.advanceTimersByTime(24 * 60 * 60_000);
      await settle();
      expect(send).toHaveBeenCalledTimes(MOST_TRIES);
      expect(said(engine.viewOf(groceries).changes)).toEqual(['tick:bananas']);
      expect(rows.size).toBe(1);
    });

    it('goes again when the person says "try again", and lets go when they say so', async () => {
      const send = api(async () => {
        throw notNow();
      });
      const { engine, rows } = make({ send });
      engine.start();
      engine.add(tick('bananas'));
      await settle();
      for (let tries = 1; tries < MOST_TRIES; tries += 1) {
        jest.advanceTimersByTime(300_000);
        await settle();
      }
      expect(engine.viewOf(groceries).stuck).not.toBeNull();
      send.mockImplementation(async (_target, part) => ({ answers: part.map(() => done()), now: undefined }));
      engine.retry(groceries);
      await settle();
      expect(engine.viewOf(groceries)).toMatchObject({ changes: [], stuck: null, held: false });

      send.mockImplementation(async () => {
        throw notNow();
      });
      engine.add(tick('milk'));
      await settle();
      engine.discard(groceries);
      expect(engine.viewOf(groceries)).toMatchObject({ changes: [], stuck: null, held: false });
      expect(rows.size).toBe(0);
    });

    it('stops a queue that gets no answer again and again while the API answers everything else', async () => {
      let answered = 0;
      const send = api(async () => {
        throw unreachable();
      });
      const { engine } = make({ send, answeredAt: () => answered });
      engine.start();
      engine.add(tick('bananas'));
      await settle();
      // The API said yes to something else since this queue first got no answer.
      answered = Date.now() + 1;
      for (let tries = 1; tries < STUCK_AFTER; tries += 1) {
        jest.advanceTimersByTime(120_000);
        await settle();
      }
      expect(send).toHaveBeenCalledTimes(STUCK_AFTER);
      expect(engine.viewOf(groceries).stuck).toBe("These changes can't get through. Try again, or let them go.");
      jest.advanceTimersByTime(60 * 60_000);
      await settle();
      expect(send).toHaveBeenCalledTimes(STUCK_AFTER);
    });
  });

  describe('two queues for two lists', () => {
    it('sends each list its own changes, in each list\'s own order', async () => {
      const { engine, send } = make();
      engine.start();
      engine.setOnline(false);
      engine.add(tick('bananas'));
      engine.add(tick('socks', true, packing));
      engine.add(line('c1', 'Oat milk'));
      engine.add({ target: wifi, body: { op: 'remove', blockId: 'old' } });
      engine.add(tick('passports', true, packing));
      expect(engine.waiting()).toBe(5);
      engine.setOnline(true);
      await settle();
      const sent = Object.fromEntries(send.mock.calls.map(([target, part]) => [`${target.kind}:${target.id}`, said(part)]));
      expect(sent).toEqual({ 'checklist:groceries': ['tick:bananas', 'add:c1'], 'checklist:packing': ['tick:socks', 'tick:passports'], 'page:wifi': ['remove:old'] });
      expect(engine.waiting()).toBe(0);
    });

    it('does not hold one list up because another one cannot get through', async () => {
      const send = api(async (target, part) => {
        if (target.id === 'groceries') throw notNow();
        return { answers: part.map(() => done()), now: undefined };
      });
      const { engine } = make({ send });
      engine.start();
      engine.add(tick('bananas'));
      engine.add(tick('socks', true, packing));
      await settle();
      expect(engine.viewOf(packing)).toMatchObject({ changes: [], held: false });
      expect(engine.viewOf(groceries)).toMatchObject({ held: true });
      // And while the one waits its turn, the other goes on working.
      engine.add(tick('passports', true, packing));
      await settle();
      expect(engine.viewOf(packing).changes).toEqual([]);
      expect(send.mock.calls.filter(([target]) => target.id === 'packing')).toHaveLength(2);
      expect(send.mock.calls.filter(([target]) => target.id === 'groceries')).toHaveLength(1);
    });

    it('lets every queue rest when nothing answers, and wakes them all when something does', async () => {
      const send: Send = jest.fn();
      send.mockRejectedValueOnce(unreachable());
      send.mockImplementation(async (_target, part) => ({ answers: part.map(() => done()), now: undefined }));
      const { engine } = make({ send });
      engine.start();
      engine.add(tick('bananas'));
      await settle();
      // Nothing answered the first list; the second doesn't knock on the same closed door.
      engine.add(tick('socks', true, packing));
      await settle();
      expect(send).toHaveBeenCalledTimes(1);
      jest.advanceTimersByTime(15_000);
      await settle();
      expect(send).toHaveBeenCalledTimes(3);
      expect(engine.waiting()).toBe(0);
    });
  });

  describe('a long queue', () => {
    it('goes in parts the API takes, each after the one before it', async () => {
      const { engine, send } = make();
      engine.start();
      engine.setOnline(false);
      for (let index = 0; index < 250; index += 1) engine.add(tick(`item-${index}`));
      engine.setOnline(true);
      await settle();
      await settle();
      expect(send.mock.calls.map((call) => call[1].length)).toEqual([MOST_AT_ONCE, MOST_AT_ONCE, 50]);
      expect((send.mock.calls[1]![1][0]!.body as LateLineChange).itemId).toBe('item-100');
      expect(engine.waiting()).toBe(0);
    });

    it('keeps each part well under what the API takes in one request', async () => {
      const { engine, send } = make();
      engine.start();
      engine.setOnline(false);
      // Thirty long paragraphs with letters that take more room on the way than on the screen.
      for (let index = 0; index < 30; index += 1) engine.add({ target: wifi, body: { op: 'add', add: { clientId: `b${index}`, kind: 'paragraph', text: 'é'.repeat(2000) } } });
      engine.setOnline(true);
      await settle();
      await settle();
      const sizes = send.mock.calls.map((call) => new TextEncoder().encode(JSON.stringify({ changes: call[1].map((change) => change.body) })).length);
      expect(sizes.length).toBeGreaterThan(1);
      for (const size of sizes) expect(size).toBeLessThan(64 * 1024);
      expect(send.mock.calls.flatMap((call) => call[1]).map((change) => (change.body as LateBlockChange).add?.clientId)).toEqual(Array.from({ length: 30 }, (_, index) => `b${index}`));
    });
  });

  describe('a restart', () => {
    it('finds what was waiting when the app was closed, and sends it in the order it was made', async () => {
      const phone = memory();
      const before = new ChangesEngine({ store: phone.store, owner: 'nora', onSent: jest.fn(), send: jest.fn(), answeredAt: () => 0 });
      before.start();
      before.setOnline(false);
      before.add(tick('bananas'));
      before.add(line('c1', 'Oat milk'));
      before.add(tick('c1'));
      before.add(tick('socks', true, packing));
      await settle();
      before.stop();
      expect(phone.rows.size).toBe(4);

      // The app is opened again, later, with a connection.
      jest.setSystemTime(new Date('2026-11-12T18:00:00Z'));
      const send: Send = jest.fn(async (_target, part) => ({ answers: part.map(() => done()), now: undefined }));
      const after = new ChangesEngine({ store: phone.store, owner: 'nora', onSent: jest.fn(), send, answeredAt: () => 0 });
      after.start();
      await settle();
      const sent = Object.fromEntries(send.mock.calls.map(([target, part]) => [target.id, said(part)]));
      expect(sent).toEqual({ groceries: ['tick:bananas', 'add:c1', 'tick:c1'], packing: ['tick:socks'] });
      expect(phone.rows.size).toBe(0);
    });

    it('shows what waits as soon as it is found, and puts what is made meanwhile after it', async () => {
      const kept: Change[] = [
        { key: 'old-1', owner: 'nora', target: groceries, seq: 100, at: '2026-11-11T08:00:00.000Z', body: { op: 'change', itemId: 'bananas', change: { done: true } } },
        { key: 'old-2', owner: 'nora', target: groceries, seq: 101, at: '2026-11-11T08:00:01.000Z', body: { op: 'change', itemId: 'milk', change: { done: true } } },
      ];
      const { engine, send } = make({ kept });
      engine.setOnline(false);
      engine.start();
      // Made before the phone has answered what it kept.
      engine.add(tick('eggs'));
      await settle();
      expect(said(engine.viewOf(groceries).changes)).toEqual(['tick:bananas', 'tick:milk', 'tick:eggs']);
      expect(engine.viewOf(groceries).held).toBe(true);
      engine.setOnline(true);
      await settle();
      expect(said(send.mock.calls[0]![1])).toEqual(['tick:bananas', 'tick:milk', 'tick:eggs']);
    });

    it('sends again what was on its way when the app closed: the API takes a change twice without doing it twice', async () => {
      const phone = memory();
      const never = held();
      const before = new ChangesEngine({ store: phone.store, owner: 'nora', onSent: jest.fn(), send: jest.fn(() => never.promise), answeredAt: () => 0 });
      before.start();
      before.add(line('c1', 'Oat milk'));
      await settle();
      before.stop();
      expect(phone.rows.size).toBe(1);
      const send: Send = jest.fn(async (_target, part) => ({ answers: part.map(() => done('item-1')), now: undefined }));
      const after = new ChangesEngine({ store: phone.store, owner: 'nora', onSent: jest.fn(), send, answeredAt: () => 0 });
      after.start();
      await settle();
      expect(send.mock.calls[0]![1].map((change) => change.body)).toEqual([{ op: 'add', add: { clientId: 'c1', text: 'Oat milk' } }]);
      expect(phone.rows.size).toBe(0);
    });

    it("leaves another person's changes alone", async () => {
      const kept: Change[] = [{ key: 'alex-1', owner: 'alex', target: groceries, seq: 5, at: '2026-11-11T08:00:00.000Z', body: { op: 'change', itemId: 'bananas', change: { done: true } } }];
      const { engine, send, rows } = make({ kept });
      engine.start();
      await settle();
      expect(send).not.toHaveBeenCalled();
      expect(engine.viewOf(groceries).changes).toEqual([]);
      expect(rows.size).toBe(1);
    });
  });

  describe('letting go', () => {
    it('forgets what waited for a list that was deleted, and says nothing about it', async () => {
      const { engine, rows, send } = make();
      engine.start();
      engine.setOnline(false);
      engine.add(tick('bananas'));
      engine.add(tick('socks', true, packing));
      engine.forget('groceries');
      expect(engine.viewOf(groceries)).toMatchObject({ changes: [], notices: [] });
      engine.setOnline(true);
      await settle();
      expect(send).toHaveBeenCalledTimes(1);
      expect(send.mock.calls[0]![0]).toEqual(packing);
      expect(rows.size).toBe(0);
    });

    it('removes everything of an account that was deleted', async () => {
      const { engine, rows } = make();
      engine.start();
      engine.setOnline(false);
      engine.add(tick('bananas'));
      engine.add(tick('socks', true, packing));
      await settle();
      await engine.discardEverything();
      expect(engine.waiting()).toBe(0);
      expect(rows.size).toBe(0);
    });

    it('starts nothing new once it is stopped, and goes on when it is started again', async () => {
      const { engine, send } = make();
      engine.start();
      engine.setOnline(false);
      engine.add(tick('bananas'));
      engine.stop();
      engine.setOnline(true);
      await settle();
      expect(send).not.toHaveBeenCalled();
      engine.start();
      await settle();
      expect(send).toHaveBeenCalledTimes(1);
    });
  });
});

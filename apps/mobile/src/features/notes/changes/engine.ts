import { lastAnswerAt, messageFor } from '@/api/fetcher';
import type { LateBlockChange, LateLineChange } from '@/api/generated/homeport';
import { newClientId } from '@/lib/ids';
import { words } from '@/words';

import { howItFailed, MOST_AT_ONCE, nextPart, sendChanges } from './send';
import { type Change, type ChangeInput, type ChangeStore, type Notice, type QueueView, type Sent, type Target, targetKey } from './types';

/** After nothing answered: how long every queue rests before the next try. Longer each time, up to two minutes. */
const restFor = (fails: number) => Math.min(15_000 * 2 ** Math.max(fails - 1, 0), 120_000);
/** After "not now": how long that one queue waits before its next try. Longer each time, up to five minutes. */
const waitFor = (tries: number) => Math.min(10_000 * 2 ** Math.max(tries - 1, 0), 300_000);
/** "Not now" this many times in a row, and a queue stops trying by itself: the person decides. */
export const MOST_TRIES = 6;
/** Nothing answered this many times for one queue while the API did answer others: it is the queue, not the connection. */
export const STUCK_AFTER = 4;

type Timer = ReturnType<typeof setTimeout>;

type Queue = {
  target: Target;
  changes: Change[];
  sending: boolean;
  /** "Not now" in a row. */
  tries: number;
  /** No answer in a row, and since when. */
  silent: number;
  since: number;
  notBefore: number;
  stuck: string | null;
  /** A part was refused as a whole: its changes go one by one until the queue is empty, so the wrong one is found. */
  oneAtATime: boolean;
  aliases: Record<string, string>;
  notices: Notice[];
  view: QueueView;
  wake: Timer | null;
};

type Options = {
  store: ChangeStore;
  /** Whose changes these are. */
  owner: string;
  /** A part of a queue went in: the list or the page as the API has it now, to show instead of what was loaded. */
  onSent: (target: Target, now: unknown) => void;
  /** Sends one part of a queue. The API's `changes` routes, unless a test stands in. */
  send?: (target: Target, part: readonly Change[]) => Promise<Sent>;
  /** When the API last said yes to anything. */
  answeredAt?: () => number;
};

const NOTHING: QueueView = { changes: [], sending: false, held: false, stuck: null, aliases: {}, notices: [] };

/**
 * The changes to lists and pages that haven't reached the API yet, for one person, and the work of sending
 * them. A tick, a new line, a changed block is put in line here and shown on the screen at once; the engine
 * sends each list's or page's line of changes in the order they were made, a part at a time, and hands the
 * screen what the API has afterwards. Without a connection they wait on the phone, also over a restart, and
 * go by themselves when it is back. It knows nothing about screens; `ChangesProvider` shows what it holds.
 *
 * Every list and every page has a queue of its own, so one that can't get through never holds up another.
 *
 * What the API says to each change:
 *  - `done`: it is in (also when it was in already), and it leaves the queue. A line or block that was
 *    added gets its id; whatever still waits for it is renamed from its `clientId` to that id.
 *  - `gone`: what it was about was removed meanwhile. It leaves the queue, and the person is told.
 *  - `refused`: it can't be done as it was made. It leaves the queue, and the person is told why.
 *
 * What happens when a whole try fails depends on how it failed (`howItFailed`):
 *  - nothing answered: that is the connection. Everything keeps its place and all queues rest a while.
 *  - "not now": that queue waits, longer each time; after `MOST_TRIES` it stops and the person decides.
 *  - the list or page is gone: its queue is dropped, and the person is told.
 *  - a plain no to the request: its changes go one at a time, so the wrong one gets its own answer.
 */
export class ChangesEngine {
  private readonly queues = new Map<string, Queue>();
  private readonly heard = new Set<() => void>();
  private online = true;
  private running = false;
  private fails = 0;
  private restUntil = 0;
  private lastSeq = 0;

  constructor(private readonly options: Options) {}

  /** Brings back what was waiting from the last time the app was open, and starts sending. */
  start(): void {
    this.running = true;
    this.options.store
      .load(this.options.owner)
      .then((kept) => {
        for (const change of [...kept].sort((a, b) => a.seq - b.seq)) {
          const queue = this.queueOf(change.target);
          // Anything made while the phone was answering stays; what it kept came before it.
          if (queue.changes.some((one) => one.key === change.key)) continue;
          queue.changes = [...queue.changes, change].sort((a, b) => a.seq - b.seq);
          this.lastSeq = Math.max(this.lastSeq, change.seq);
        }
        for (const queue of this.queues.values()) this.changed(queue);
      })
      .catch(() => undefined);
    for (const queue of this.queues.values()) this.pump(queue);
  }

  /** Stops starting new work. What is on its way right now finishes and is remembered. */
  stop(): void {
    this.running = false;
    for (const queue of this.queues.values()) {
      if (queue.wake) clearTimeout(queue.wake);
      queue.wake = null;
    }
  }

  /** The phone says whether it has a connection. Back online, everything that was waiting is tried at once. */
  setOnline(online: boolean): void {
    if (online === this.online) return;
    this.online = online;
    if (online) {
      this.fails = 0;
      this.restUntil = 0;
      for (const queue of this.queues.values()) queue.notBefore = 0;
    }
    for (const queue of this.queues.values()) this.changed(queue);
  }

  /** For screens: hears when anything about any queue changes. */
  readonly subscribe = (listener: () => void): (() => void) => {
    this.heard.add(listener);
    return () => {
      this.heard.delete(listener);
    };
  };

  /** What a screen is shown of one list's or page's queue. The same object until something about it changes. */
  readonly viewOf = (target: Target): QueueView => this.queues.get(targetKey(target))?.view ?? NOTHING;

  /** How many changes are waiting, on every list and page together. */
  readonly waiting = (): number => {
    let count = 0;
    for (const queue of this.queues.values()) count += queue.changes.length;
    return count;
  };

  /**
   * Puts a change in line: it is on the screen from this moment, kept on the phone, and sent as soon as it
   * can be. Returns it as it is kept.
   */
  add(input: ChangeInput): Change {
    const queue = this.queueOf(input.target);
    // Later than everything before it, also after a restart and when the phone's clock was set back.
    this.lastSeq = Math.max(Date.now(), this.lastSeq + 1);
    const change: Change = { key: newClientId(), owner: this.options.owner, seq: this.lastSeq, at: new Date().toISOString(), ...input, body: this.named(queue, input.body) };
    queue.changes = [...queue.changes, change];
    void this.options.store.save(change).catch(() => undefined);
    this.changed(queue);
    return change;
  }

  /** Tries a queue again now: after it stopped by itself, or because the person asked. */
  retry(target: Target): void {
    const queue = this.queues.get(targetKey(target));
    if (!queue) return;
    this.fails = 0;
    this.restUntil = 0;
    queue.stuck = null;
    queue.tries = 0;
    queue.silent = 0;
    queue.since = 0;
    queue.notBefore = 0;
    this.changed(queue);
  }

  /** Lets go of what waits for one list or page: the person gave up on it. What is on its way right now still arrives. */
  discard(target: Target): void {
    const queue = this.queues.get(targetKey(target));
    if (!queue) return;
    this.drop(queue, queue.changes);
    queue.stuck = null;
    this.changed(queue);
  }

  /** The list or page was deleted: what was waiting for it goes with it, and nothing is said. */
  forget(id: string): void {
    for (const queue of this.queues.values()) {
      if (queue.target.id !== id) continue;
      this.drop(queue, queue.changes);
      queue.stuck = null;
      queue.notices = [];
      this.changed(queue);
    }
  }

  /** The person has read what came back as "gone" or "refused". */
  dismiss(target: Target): void {
    const queue = this.queues.get(targetKey(target));
    if (!queue || queue.notices.length === 0) return;
    queue.notices = [];
    this.changed(queue);
  }

  /** The account was deleted: nothing of it stays on the phone. */
  async discardEverything(): Promise<void> {
    for (const queue of this.queues.values()) {
      queue.changes = [];
      queue.stuck = null;
      queue.notices = [];
      this.changed(queue);
    }
    await this.options.store.removeAll(this.options.owner).catch(() => undefined);
  }

  private queueOf(target: Target): Queue {
    const key = targetKey(target);
    let queue = this.queues.get(key);
    if (!queue) {
      queue = { target, changes: [], sending: false, tries: 0, silent: 0, since: 0, notBefore: 0, stuck: null, oneAtATime: false, aliases: {}, notices: [], view: NOTHING, wake: null };
      this.queues.set(key, queue);
    }
    return queue;
  }

  /** Takes changes out of a queue and off the phone. */
  private drop(queue: Queue, changes: readonly Change[]): void {
    if (changes.length === 0) return;
    const keys = new Set(changes.map((change) => change.key));
    queue.changes = queue.changes.filter((change) => !keys.has(change.key));
    if (queue.changes.length === 0) queue.oneAtATime = false;
    void this.options.store.remove([...keys]).catch(() => undefined);
  }

  /** Shows a queue's new state, and sends its next part if that can go now. */
  private changed(queue: Queue): void {
    const resting = queue.tries > 0 || queue.silent > 0;
    queue.view = { changes: queue.changes, sending: queue.sending, held: queue.changes.length > 0 && (!this.online || resting || queue.stuck !== null), stuck: queue.stuck, aliases: queue.aliases, notices: queue.notices };
    this.heard.forEach((listener) => listener());
    this.pump(queue);
  }

  /** If the phone is online and nothing of this queue is on its way, its next part goes; otherwise this waits for its time. */
  private pump(queue: Queue): void {
    if (queue.wake) clearTimeout(queue.wake);
    queue.wake = null;
    if (!this.running || !this.online || queue.sending || queue.stuck !== null || queue.changes.length === 0) return;
    const now = Date.now();
    const due = Math.max(this.restUntil, queue.notBefore);
    if (due > now) {
      queue.wake = setTimeout(() => this.pump(queue), due - now);
      return;
    }
    void this.run(queue);
  }

  private async run(queue: Queue): Promise<void> {
    const part = nextPart(queue.changes, queue.oneAtATime ? 1 : MOST_AT_ONCE);
    queue.sending = true;
    this.changed(queue);
    let sent: Sent | null = null;
    let failure: unknown = null;
    try {
      sent = await (this.options.send ?? sendChanges)(queue.target, part);
    } catch (error) {
      failure = error;
    }
    queue.sending = false;
    if (sent) this.afterSent(queue, part, sent);
    else this.afterFailure(queue, part, failure);
    this.changed(queue);
  }

  /** A part went in: each of its changes has its answer and leaves the queue. */
  private afterSent(queue: Queue, part: readonly Change[], sent: Sent): void {
    queue.tries = 0;
    queue.silent = 0;
    queue.since = 0;
    queue.notBefore = 0;
    part.forEach((change, index) => {
      const answer = sent.answers[index];
      if (!answer || answer.outcome === 'done') {
        // What was added has an id now. Until the API has answered for everything that names it by the
        // `clientId` it was added with, both names mean the same line.
        const clientId = change.body.op === 'add' ? change.body.add?.clientId : undefined;
        if (clientId && answer?.id) queue.aliases = { ...queue.aliases, [clientId]: answer.id };
        return;
      }
      const said = answer.said ?? (answer.outcome === 'gone' ? words.notes.waiting.gone : words.states.unknown);
      queue.notices = [...queue.notices, { key: change.key, outcome: answer.outcome, said }];
    });
    this.drop(queue, part);
    // What still waits and names something by its `clientId` is renamed, so it is found after a restart too.
    queue.changes = queue.changes.map((change) => {
      const body = this.named(queue, change.body);
      if (body === change.body) return change;
      const renamed = { ...change, body };
      void this.options.store.save(renamed).catch(() => undefined);
      return renamed;
    });
    // The API answers: whatever rested because nothing did can go again.
    const rested = this.restUntil > 0;
    this.fails = 0;
    this.restUntil = 0;
    this.options.onSent(queue.target, sent.now);
    if (rested) for (const other of this.queues.values()) if (other !== queue) this.pump(other);
  }

  /** A try failed: what becomes of the queue depends on how. */
  private afterFailure(queue: Queue, part: readonly Change[], error: unknown): void {
    const now = Date.now();
    const how = howItFailed(error);
    if (how === 'unreachable') {
      queue.silent += 1;
      queue.since ||= now;
      // Usually the connection: everything rests a while. But when the API answered other requests since
      // this queue first got no answer, it is this queue that can't get through.
      if (queue.silent >= STUCK_AFTER && (this.options.answeredAt ?? lastAnswerAt)() > queue.since) {
        queue.stuck = words.notes.waiting.stuck;
        return;
      }
      this.fails += 1;
      this.restUntil = now + restFor(this.fails);
      // The others rest as well: each wakes when the rest is over.
      for (const other of this.queues.values()) if (other !== queue) this.pump(other);
      return;
    }
    queue.silent = 0;
    queue.since = 0;
    if (how === 'later') {
      queue.tries += 1;
      if (queue.tries >= MOST_TRIES) queue.stuck = messageFor(error);
      else queue.notBefore = now + waitFor(queue.tries);
      return;
    }
    queue.tries = 0;
    if (how === 'gone') {
      // The list or the page itself isn't there any more (or isn't this person's to change): nothing that
      // waits for it can go in. It is said once, not once for each change.
      this.drop(queue, queue.changes);
      queue.notices = [...queue.notices, { key: newClientId(), outcome: 'gone', said: messageFor(error) }];
      return;
    }
    if (part.length > 1) {
      queue.oneAtATime = true;
      return;
    }
    this.drop(queue, part);
    queue.notices = [...queue.notices, ...part.map((change) => ({ key: change.key, outcome: 'refused' as const, said: messageFor(error) }))];
  }

  /**
   * A change with every `clientId` it names replaced by the id the API gave that line or block, where it has
   * one. The same object when there is nothing to replace.
   */
  private named<T extends LateLineChange | LateBlockChange>(queue: Queue, body: T): T {
    const real = (id: string | null | undefined) => (id ? queue.aliases[id] : undefined);
    // The same few names in both kinds of change: the line or block it is about, and the one it goes before or after.
    const loose = body as { itemId?: string | null; blockId?: string | null; add?: { after?: string | null }; change?: { before?: string; after?: string | null } };
    let next = loose;
    if (real(loose.itemId)) next = { ...next, itemId: real(loose.itemId) };
    if (real(loose.blockId)) next = { ...next, blockId: real(loose.blockId) };
    if (real(loose.change?.before)) next = { ...next, change: { ...next.change, before: real(loose.change?.before) } };
    if (real(loose.change?.after)) next = { ...next, change: { ...next.change, after: real(loose.change?.after) } };
    if (real(loose.add?.after)) next = { ...next, add: { ...next.add, after: real(loose.add?.after) } };
    return next as T;
  }
}

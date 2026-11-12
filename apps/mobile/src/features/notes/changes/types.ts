import type { LateBlockChange, LateLineChange, MediaResponse, ThingBrief } from '@/api/generated/homeport';

/** What a queue of changes belongs to: one list, or one page. */
export type Target = { kind: 'checklist' | 'page'; id: string };

/** One name for a target, to keep its queue under. */
export const targetKey = (target: Target): string => `${target.kind}:${target.id}`;

/**
 * What the screen needs to draw something that was added before the API has seen it: the thing a live block
 * shows (picked from a list that was loaded), or the photo or file that has just gone up.
 */
export type Shown = { thing?: ThingBrief; media?: MediaResponse };

/**
 * A change to a list or a page that hasn't reached the API yet, kept on the phone. `body` is exactly what the
 * API's `changes` route takes for it: add a line or a block (with the `clientId` it is known by until the API
 * gives it an id), change one, or remove one.
 */
export type Change = {
  /** Its own name on the phone. */
  key: string;
  /** Whose change it is. Another person signing in on the same phone doesn't get it. */
  owner: string;
  target: Target;
  /** The order it was made in. Changes of one target are sent in this order. */
  seq: number;
  body: LateLineChange | LateBlockChange;
  shown?: Shown;
  /** When it was made. */
  at: string;
};

/** What a screen hands over: everything but who owns it, its order and its name. */
export type ChangeInput = { target: Target; body: LateLineChange | LateBlockChange; shown?: Shown };

/** What the API said to one change that was sent. */
export type Answer = { outcome: 'done' | 'gone' | 'refused'; id: string | null; said: string | null };

/** What sending one part of a queue brings back: an answer for each change, and the list or page as it stands now. */
export type Sent<T = unknown> = { answers: Answer[]; now: T | undefined };

/** A change that didn't go in as it was made, for the person to read: its line was removed meanwhile, or the API said no. */
export type Notice = {
  key: string;
  outcome: 'gone' | 'refused';
  /** What happened, in a sentence: the API's own where it sent one. */
  said: string;
};

/**
 * What a screen is shown of one target's queue. The same object until something about it changes.
 *  - `changes`: what is still waiting, oldest first
 *  - `sending`: a part of it is on its way right now
 *  - `held`: it can't go for now (no connection, or the last try failed): the lines show their "waiting" mark
 *  - `stuck`: it was tried often enough; the sentence says why, and the person decides (try again, or let go)
 *  - `aliases`: lines and blocks that were added here and have an id from the API since, by their `clientId`
 *  - `notices`: what came back as "gone" or "refused"
 */
export type QueueView = {
  changes: readonly Change[];
  sending: boolean;
  held: boolean;
  stuck: string | null;
  aliases: Readonly<Record<string, string>>;
  notices: readonly Notice[];
};

/** Where waiting changes are kept. The phone uses SQLite; a browser, and the tests, something simpler. */
export type ChangeStore = {
  /** This person's changes, in the order they were made. */
  load(owner: string): Promise<Change[]>;
  save(change: Change): Promise<void>;
  remove(keys: readonly string[]): Promise<void>;
  /** Forgets every change of this person: the account is gone. */
  removeAll(owner: string): Promise<void>;
};

/** The line or block a change is about: its id, or the `clientId` it was added with. */
export function refOf(change: Pick<Change, 'target' | 'body'>): string | null {
  const body = change.body;
  if (body.op === 'add') return body.add?.clientId ?? null;
  return (change.target.kind === 'checklist' ? (body as LateLineChange).itemId : (body as LateBlockChange).blockId) ?? null;
}

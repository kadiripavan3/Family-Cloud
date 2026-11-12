import type { BlockResponse, ChecklistResponse, ItemResponse, LateBlockChange, LateLineChange, ListSection, PageResponse, PersonBrief } from '@/api/generated/homeport';

import type { QueueView } from './types';

/** The people a change can name, as the API would send them back: the person using the phone, and anyone of the circle by their id. */
export type People = { me: PersonBrief | null; of: (memberId: string | null | undefined) => PersonBrief | null };

/** Nobody is known: for a list drawn where the circle isn't. */
export const NOBODY: People = { me: null, of: () => null };

type Waiting = Pick<QueueView, 'changes' | 'aliases'>;

const NONE: ReadonlySet<string> = new Set<string>();

/**
 * A name for a line or a block that stays the same from the moment it is added on the phone: the `clientId`
 * it was added with, also after the API has given it an id. A screen draws its rows under these names, so
 * a row that has just been sent is the same row afterwards, not a new one in its place.
 */
export function steadyKeys(aliases: Readonly<Record<string, string>>): (id: string) => string {
  const first = new Map(Object.entries(aliases).map(([clientId, id]) => [id, clientId]));
  return (id) => first.get(id) ?? id;
}

/** A line's words as the API keeps them: no space at either end, one space between words. */
const clean = (text: string) => text.trim().replace(/\s+/g, ' ');

/**
 * Where a line added on the phone stands until the API has filed it: under the heading it had the last time
 * (the list's "add again" knows it), or where the same words stand now. The API may still file a line of a
 * shopping list under its aisle; until it answers, the line stands under no heading.
 */
function headingFor(list: ChecklistResponse, items: readonly ItemResponse[], text: string): string {
  const key = clean(text).toLowerCase();
  const usual = list.suggestions.find((one) => (one.text ?? '').toLowerCase() === key);
  if (usual) return usual.section ?? '';
  return items.find((one) => one.text.toLowerCase() === key)?.section ?? '';
}

/** The amounts of these lines added up, or of the ticked ones only. Null when none of them has an amount. */
function sum(items: readonly ItemResponse[], onlyDone: boolean): number | null {
  if (!items.some((item) => item.amountCents !== null)) return null;
  return items.reduce((total, item) => total + (item.amountCents !== null && (!onlyDone || item.done) ? item.amountCents : 0), 0);
}

/** The headings with their counts and sums, in the order the API gave them; a heading that is new on the phone comes last. */
function sectionsOf(before: readonly ListSection[], items: readonly ItemResponse[]): ListSection[] {
  const names = before.map((section) => section.name ?? '');
  for (const item of items) if (!names.includes(item.section)) names.push(item.section);
  return names.flatMap((name) => {
    const under = items.filter((item) => item.section === name);
    if (under.length === 0) return [];
    const done = under.filter((item) => item.done).length;
    return [{ name, left: under.length - done, done, sumCents: sum(under, false) }];
  });
}

/**
 * A list as the person sees it: what the API last sent, with the changes that are still waiting on the
 * phone laid over it in the order they were made. A tick is ticked, a new line is there (known by its
 * `clientId` until the API gives it an id), a removed one is gone, and the counts, sums and headings are
 * worked out again. `waiting` holds the ids of the lines that have a change waiting.
 *
 * A change to a line that isn't in the list any more is left out: someone removed it meanwhile, and the API
 * will say so when the change arrives.
 */
export function listWithWaiting(list: ChecklistResponse, waiting: Waiting, people: People = NOBODY): { list: ChecklistResponse; waiting: ReadonlySet<string> } {
  if (waiting.changes.length === 0) return { list, waiting: NONE };
  const real = (id: string) => waiting.aliases[id] ?? id;
  const marked = new Set<string>();
  let items: ItemResponse[] = list.items;

  for (const change of waiting.changes) {
    const body = change.body as LateLineChange;
    if (body.op === 'add') {
      const add = body.add;
      // Sent and answered, and the list that came back has it under its own id.
      if (!add || items.some((item) => item.id === real(add.clientId))) continue;
      items = [
        ...items,
        {
          id: add.clientId,
          text: clean(add.text),
          note: add.note?.trim() ?? '',
          section: add.section?.trim() ?? headingFor(list, items, add.text),
          amountCents: add.amountCents ?? null,
          done: false,
          doneAt: null,
          doneBy: null,
          assignedTo: people.of(add.assignedTo),
          addedBy: people.me,
          addedAt: change.at,
          repeats: add.repeats ?? null,
          hiddenFrom: (add.hideFrom ?? []).flatMap((memberId) => people.of(memberId)?.name ?? []),
        },
      ];
      marked.add(add.clientId);
      continue;
    }
    const id = body.itemId ? real(body.itemId) : null;
    const at = items.findIndex((item) => item.id === id);
    if (id === null || at < 0) continue;
    if (body.op === 'remove') {
      items = items.filter((item) => item.id !== id);
      marked.delete(id);
      continue;
    }
    const to = body.change;
    if (!to) continue;
    const old = items[at]!;
    const next: ItemResponse = {
      ...old,
      text: to.text === undefined ? old.text : clean(to.text),
      note: to.note === undefined ? old.note : to.note.trim(),
      section: to.section === undefined ? old.section : to.section.trim(),
      amountCents: to.removeAmount ? null : (to.amountCents ?? old.amountCents),
      assignedTo: to.unassign ? null : to.assignedTo === undefined ? old.assignedTo : people.of(to.assignedTo),
      repeats: to.stopRepeating ? null : (to.repeats ?? old.repeats),
      hiddenFrom: to.hideFrom === undefined ? old.hiddenFrom : to.hideFrom.flatMap((memberId) => people.of(memberId)?.name ?? []),
    };
    if (to.done !== undefined && to.done !== old.done) {
      next.done = to.done;
      next.doneAt = to.done ? change.at : null;
      next.doneBy = to.done ? people.me : null;
    }
    items = items.map((item, index) => (index === at ? next : item));
    const before = to.before ? real(to.before) : null;
    if (before && before !== id && items.some((item) => item.id === before)) {
      const rest = items.filter((item) => item.id !== id);
      rest.splice(rest.findIndex((item) => item.id === before), 0, next);
      items = rest;
    } else if (to.toEnd) {
      items = [...items.filter((item) => item.id !== id), next];
    }
    marked.add(id);
  }

  const done = items.filter((item) => item.done).length;
  return {
    list: { ...list, items, left: items.length - done, done, sumCents: sum(items, false), sumDoneCents: sum(items, true), sections: sectionsOf(list.sections, items) },
    waiting: marked,
  };
}

/**
 * A page as the person sees it: what the API last sent, with the block changes that are still waiting laid
 * over it. A block added on the phone is known by its `clientId` and shows what the phone knows of it (its
 * words, the thing that was picked, the photo that went up); a list started in a page offline has no lines
 * to tick until the API has made it.
 */
export function pageWithWaiting(page: PageResponse, waiting: Waiting): { page: PageResponse; waiting: ReadonlySet<string> } {
  if (waiting.changes.length === 0) return { page, waiting: NONE };
  const real = (id: string) => waiting.aliases[id] ?? id;
  const marked = new Set<string>();
  let blocks: BlockResponse[] = page.blocks;

  /** Puts a block first, just after another one, or (also when that one is gone) last. */
  const place = (rest: BlockResponse[], block: BlockResponse, after: string | null | undefined, atStart: boolean | undefined): BlockResponse[] => {
    if (atStart) return [block, ...rest];
    const at = after ? rest.findIndex((one) => one.id === real(after)) : -1;
    if (at < 0) return [...rest, block];
    return [...rest.slice(0, at + 1), block, ...rest.slice(at + 1)];
  };

  for (const change of waiting.changes) {
    const body = change.body as LateBlockChange;
    if (body.op === 'add') {
      const add = body.add;
      if (!add || blocks.some((block) => block.id === real(add.clientId))) continue;
      const words = add.kind === 'checklist' ? (add.title ?? '') : add.kind === 'live' ? '' : (add.text ?? '');
      const block: BlockResponse = {
        id: add.clientId,
        kind: add.kind,
        text: words,
        marks: add.marks ?? [],
        thing: change.shown?.thing ?? null,
        checklist: null,
        unseen: false,
        media: change.shown?.media ?? null,
        lat: add.lat ?? null,
        lng: add.lng ?? null,
        updatedAt: change.at,
      };
      blocks = place(blocks, block, add.after, add.atStart);
      marked.add(add.clientId);
      continue;
    }
    const id = body.blockId ? real(body.blockId) : null;
    const at = blocks.findIndex((block) => block.id === id);
    if (id === null || at < 0) continue;
    if (body.op === 'remove') {
      blocks = blocks.filter((block) => block.id !== id);
      marked.delete(id);
      continue;
    }
    const to = body.change;
    if (!to) continue;
    const old = blocks[at]!;
    const next: BlockResponse = {
      ...old,
      kind: to.kind ?? old.kind,
      text: to.text ?? old.text,
      // Marks belong to the words they were made for: new words without new marks have none.
      marks: to.marks ?? (to.text === undefined ? old.marks : []),
      lat: to.removePoint ? null : (to.lat ?? old.lat),
      lng: to.removePoint ? null : (to.lng ?? old.lng),
      updatedAt: change.at,
    };
    blocks = to.after || to.atStart ? place(blocks.filter((block) => block.id !== id), next, to.after, to.atStart) : blocks.map((block, index) => (index === at ? next : block));
    marked.add(id);
  }

  return { page: { ...page, blocks }, waiting: marked };
}

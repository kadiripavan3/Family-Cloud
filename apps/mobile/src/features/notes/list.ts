import { useMemo } from 'react';

import type { ChecklistResponse, ItemChangeRequest, ItemResponse, NewItemRequest } from '@/api/generated/homeport';
import { newClientId } from '@/lib/ids';

import { listWithWaiting } from './changes/apply';
import { useChanges, useWaiting } from './changes/outbox';
import type { QueueView, Target } from './changes/types';
import { usePeople } from './people';

/** A list's lines under their headings, in the order the list gives its headings: the lines under no heading first. */
export function underHeadings(list: Pick<ChecklistResponse, 'items' | 'sections'>, showTicked = true): { heading: string; items: ItemResponse[] }[] {
  const names = list.sections.map((section) => section.name ?? '');
  for (const item of list.items) if (!names.includes(item.section)) names.push(item.section);
  return names
    .sort((a, b) => Number(a !== '') - Number(b !== ''))
    .map((heading) => ({ heading, items: list.items.filter((item) => item.section === heading && (showTicked || !item.done)) }))
    .filter((group) => group.items.length > 0);
}

/**
 * A list as the person sees it right now: what the API last sent with the changes that are still waiting
 * on the phone laid over it, which lines those are, and how to change it. Every change goes into the queue
 * (`changes/`): it shows at once, goes up when it can, and waits on the phone when it can't. The list's own
 * screen and a list drawn inside a page both use this.
 */
export function useList(loaded: ChecklistResponse): {
  list: ChecklistResponse;
  /** The lines that have a change waiting, by id. */
  marked: ReadonlySet<string>;
  /** What waits for this list, and whether it is held back for now. */
  waiting: QueueView;
  target: Target;
  tick: (item: ItemResponse) => void;
  add: (text: string, more?: Partial<NewItemRequest>) => void;
  change: (item: ItemResponse, change: ItemChangeRequest) => void;
  remove: (item: ItemResponse) => void;
} {
  const changes = useChanges();
  const target = useMemo<Target>(() => ({ kind: 'checklist', id: loaded.id }), [loaded.id]);
  const waiting = useWaiting(target);
  const people = usePeople(loaded.circleId);
  const shown = useMemo(() => listWithWaiting(loaded, waiting, people), [loaded, waiting, people]);
  return {
    list: shown.list,
    marked: shown.waiting,
    waiting,
    target,
    tick: (item) => void changes.add({ target, body: { op: 'change', itemId: item.id, change: { done: !item.done } } }),
    add: (text, more) => void changes.add({ target, body: { op: 'add', add: { ...more, clientId: newClientId(), text } } }),
    change: (item, change) => void changes.add({ target, body: { op: 'change', itemId: item.id, change } }),
    remove: (item) => void changes.add({ target, body: { op: 'remove', itemId: item.id } }),
  };
}

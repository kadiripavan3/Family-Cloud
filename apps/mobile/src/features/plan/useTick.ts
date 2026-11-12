import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';

import { useCache } from '@/api/cache';
import { messageFor } from '@/api/fetcher';
import { type ReminderResponse, tickReminder } from '@/api/generated/homeport';
import { today } from '@/lib/dates';

/** One tick: which reminder, ticked or not, and the due day the person was looking at when the line has one. */
export type TickAsk = { id: string; done: boolean; dueOn?: string | null };

/** Ticks a reminder, or takes its tick away, for the due day the person was looking at. */
async function send({ id, done, dueOn }: TickAsk): Promise<ReminderResponse> {
  const day = today();
  const first = await tickReminder(id, { done, dueOn: dueOn ?? undefined, day });
  // One without a day shows under the day it was ticked on, which is not a day its tick was for: the API
  // then changes nothing. Its last tick is the only one it has, so that is the one to take away.
  if (!done && dueOn && first.done && first.tickedDueOn === null) return tickReminder(id, { done: false, day });
  return first;
}

/** The same line in two days' lists is two lines: a job that repeats shows once for each day it comes round. */
const keyOf = (id: string, dueOn?: string | null) => `${id} ${dueOn ?? ''}`;

/**
 * Ticking a reminder from any list (the day's list, the month, Today, Reminders, its own page):
 *
 *     const ticks = useTick();
 *     <Tick done={ticks.shown(entry.thingId, entry.day, entry.done)} onChange={(done) => ticks.tick({ id, done, dueOn: entry.day })} />
 *
 * The tick shows at once and the API is told; its answer (whose turn it is next, the next day it is due)
 * goes to every list through `cache.reminderSaved`. A tick that didn't arrive is taken back, and `problem`
 * says why.
 */
export function useTick() {
  const cache = useCache();
  /** What was pressed and hasn't been answered yet, by line: shown before the list itself has caught up. */
  const [pressed, setPressed] = useState<Record<string, boolean>>({});
  const forget = (ask: TickAsk) =>
    setPressed((old) => {
      const next = { ...old };
      delete next[keyOf(ask.id, ask.dueOn)];
      return next;
    });
  const change = useMutation({
    mutationFn: send,
    onMutate: (ask) => setPressed((old) => ({ ...old, [keyOf(ask.id, ask.dueOn)]: ask.done })),
    // The lists have been asked again by the time the pressed tick is forgotten, so it doesn't flick back in between.
    onSuccess: async (reminder, ask) => {
      await cache.reminderSaved(reminder);
      forget(ask);
    },
    onError: (_error, ask) => forget(ask),
  });
  return {
    tick: (ask: TickAsk) => change.mutate(ask),
    /** Whether a line shows as ticked right now: what was just pressed, else what the list says. */
    shown: (id: string | null | undefined, dueOn: string | null | undefined, done: boolean | null | undefined) => (id ? pressed[keyOf(id, dueOn)] : undefined) ?? done === true,
    /** Why the last tick didn't arrive, in a sentence. Null while all is well. */
    problem: change.isError ? messageFor(change.error) : null,
  };
}

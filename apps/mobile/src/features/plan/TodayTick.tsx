import type { TodayItem } from '@/api/generated/homeport';

import { Tick } from './Tick';
import { useTick } from './useTick';

/**
 * The tick of a reminder on Today: pressing it ticks the reminder for the day it is due (a job that repeats
 * moves on to its next day, one that takes turns to the next person), pressing again takes that tick away.
 * Today draws it for the lines whose kind is `reminder`; what follows the tick (Today itself, the day's
 * list, the month) is asked for again by `cache.reminderSaved`.
 */
export function TodayTick({ item }: { item: TodayItem }) {
  const ticks = useTick();
  const id = item.thingId;
  if (!id) return null;
  // A line that is still to do says which day it is due (`due.on`): the tick is for that day. A ticked line
  // doesn't say, so for taking a tick away `useTick` asks the reminder itself before it changes anything.
  const dueOn = item.due?.on ?? null;
  return <Tick label={item.title ?? ''} done={ticks.shown(id, dueOn, item.done)} onChange={(done) => ticks.tick({ id, done, dueOn })} />;
}

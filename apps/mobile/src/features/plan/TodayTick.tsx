import type { TodayItem } from '@/api/generated/homeport';

import { Tick } from './Tick';
import { useTick } from './useTick';

/**
 * The tick of a reminder on Today: pressing it ticks the reminder for the time it is due now (a job that
 * repeats moves on to its next day, one that takes turns to the next person), pressing again takes the
 * tick away. Today draws it for the lines whose kind is `reminder`; what follows the tick (Today itself,
 * the day's list, the month) is asked for again by `cache.reminderSaved`.
 */
export function TodayTick({ item }: { item: TodayItem }) {
  const ticks = useTick();
  const id = item.thingId;
  if (!id) return null;
  // Today doesn't say which due day a line is for, so the tick is for whatever is due now.
  return <Tick label={item.title ?? ''} done={ticks.shown(id, null, item.done)} onChange={(done) => ticks.tick({ id, done })} />;
}

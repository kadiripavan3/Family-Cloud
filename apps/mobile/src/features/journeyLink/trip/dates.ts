import { type FolderResponse, useGetTrips } from '@/api/generated/homeport';
import { daysBetween, formatMonthAbbr, fromISODate, today } from '@/lib/dates';
import { words } from '@/words';

/** "3 to 17 Apr", "28 Mar to 3 Apr": the days of a trip, as short as they go. */
export function tripDates(startsOn: string, endsOn: string): string {
  return words.together.trip.range(fromISODate(startsOn).getDate(), formatMonthAbbr(startsOn), fromISODate(endsOn).getDate(), formatMonthAbbr(endsOn));
}

/** What stands under each of a trip's three stages, by the stage it is in: "now", its dates, "after", "done". */
export function stageLines(stage: 'plan' | 'go' | 'keep', startsOn: string, endsOn: string): { plan: string; go: string; keep: string } {
  const says = words.together.trip;
  return {
    plan: stage === 'plan' ? says.now : says.done,
    go: stage === 'plan' ? tripDates(startsOn, endsOn) : stage === 'go' ? says.now : says.done,
    keep: stage === 'keep' ? says.now : says.after,
  };
}

/** The line over "this becomes a journey": by how far off the trip's first day is. */
export function becomesTitle(on: string, from: string = today()): string {
  const says = words.together.trip.becomes;
  const away = daysBetween(from, on);
  return away > 0 ? says.title(words.dates.dayLong(fromISODate(on).getDate(), fromISODate(on).getMonth())) : away === 0 ? says.today : says.late;
}

/** What a folder is, for the screen that draws it: a trip, a plain folder, or not known yet. */
export type TripOrFolder = 'trip' | 'folder' | 'asking';

/**
 * Whether a folder is a trip (10.7): asked of the trips of the folder's circle, which are its folders that
 * were given dates. `plain` is for "Open as a folder": then it is a folder, without asking. When the trips
 * can't be asked (no connection, or it failed), the folder is shown as the folder it is.
 */
export function useTripOf(folder: Pick<FolderResponse, 'id' | 'circleId'> | undefined, plain = false): TripOrFolder {
  const trips = useGetTrips(folder?.circleId ?? '', { day: today() }, { query: { enabled: !!folder && !plain } });
  if (plain || !folder) return 'folder';
  if (trips.data) return trips.data.some((trip) => trip.id === folder.id) ? 'trip' : 'folder';
  return trips.isError || trips.isPaused ? 'folder' : 'asking';
}

/**
 * Which folders of a circle are trips, by their ids: for a list of folders in which a trip opens on its own
 * page instead of unfolding in place. Empty until the trips have been asked for.
 */
export function useTripIds(circleId: string | undefined): ReadonlySet<string> {
  const trips = useGetTrips(circleId ?? '', { day: today() }, { query: { enabled: !!circleId } }).data;
  return new Set((trips ?? []).flatMap((trip) => (trip.id ? [trip.id] : [])));
}

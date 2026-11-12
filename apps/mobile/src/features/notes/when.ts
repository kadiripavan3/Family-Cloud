import { words } from '@/words';

/** How long ago, as short as it gets, for the end of a row: "5m", "2h", "3d". */
export function shortAgo(instant: string, now: Date = new Date()): string {
  const minutes = Math.floor((now.getTime() - new Date(instant).getTime()) / 60_000);
  if (minutes < 60) return words.notes.space.agoMinutes(minutes);
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return words.notes.space.agoHours(hours);
  return words.notes.space.agoDays(Math.floor(hours / 24));
}

/** True for something that happened in the last while: worth saying who did it. */
export function isRecent(instant: string | null | undefined, withinMs: number, now: Date = new Date()): boolean {
  return !!instant && now.getTime() - new Date(instant).getTime() < withinMs;
}

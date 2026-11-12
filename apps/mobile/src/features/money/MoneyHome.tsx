import { NotBuiltYet } from '@/features/states/NotBuiltYet';
import { words } from '@/words';

/**
 * Money on Home, still to be built: what stands under the row of six places when Money is chosen. Home's
 * shell (`app/(app)/(tabs)/index.tsx`) draws the search pill and the row above it and gives this the rest
 * of the screen; it reads the current circle with `useCircle()` and scrolls by itself, leaving
 * `TAB_BAR_ROOM` under its last row.
 */
export function MoneyHome() {
  return <NotBuiltYet part title={words.common.places.money} />;
}

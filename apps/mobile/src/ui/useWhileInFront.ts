import { useIsFocused } from 'expo-router';
import { useState } from 'react';

/**
 * What a list shows, held as it was while another screen lies over it, and let go when its own screen is in
 * front again. A row can go while the list is covered (a sheet deleted from its own screen leaves the list
 * underneath at that moment); in a browser the list then trips over rows it can't measure ("index out of
 * bounds, not enough layouts"). So a covered list keeps the rows it had, and takes the new ones when it is
 * looked at again. `List` does this for every list: nothing outside it has to.
 *
 * Give it something that stays the same from one drawing to the next unless it changed: what a component
 * was handed (`List` gives it its `data`), or a query's `data`. Not a list made on the spot.
 */
export function useWhileInFront<T>(value: T): T {
  const inFront = useIsFocused();
  const [held, setHeld] = useState(value);
  if (inFront && held !== value) setHeld(value);
  return inFront ? value : held;
}

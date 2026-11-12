import { useIsFocused } from 'expo-router';
import { useState } from 'react';

/**
 * What a list shows, held as it was while another screen lies over it, and let go when its own screen is in
 * front again. A sheet deleted from its own screen leaves the list underneath at that moment; in a browser
 * the list then trips over rows it can't measure ("not enough layouts"), so it is told when it is looked at.
 * Give it something that stays the same between drawings (a query's `data`), not a list made on the spot.
 */
export function useWhileInFront<T>(value: T): T {
  const inFront = useIsFocused();
  const [held, setHeld] = useState(value);
  if (inFront && held !== value) setHeld(value);
  return inFront ? value : held;
}

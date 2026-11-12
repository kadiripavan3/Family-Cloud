import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import type { Audience, CircleResponse } from '@/api/generated/homeport';

/**
 * Who a thing that is being made starts as seen by: what the + sheet handed over in the address
 * (`?audience=me`), else what the circle's kind says. A form that makes a thing shows it with
 * `StartsAsPill` and sends `audience` with its request.
 */
export function useStartsAs(circle: CircleResponse): [audience: Audience, set: (next: Audience) => void] {
  const { audience: asked } = useLocalSearchParams<{ audience?: string }>();
  const [chosen, setChosen] = useState<Audience | null>(null);
  const fromAddress = asked === 'me' || asked === 'circle' ? asked : null;
  return [chosen ?? fromAddress ?? circle.startsAs, setChosen];
}

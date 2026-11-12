import { focusManager, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect, usePathname } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';

import { type CircleResponse, getGetCirclesQueryKey, useGetCircles } from '@/api/generated/homeport';

import { useFinishSetup } from './useFinishSetup';

/** The first setup step, where someone who is in no circle waits. */
const START = '/setup';

/**
 * For the setup screens. Someone who is in no circle can get into one elsewhere while these screens are
 * open: they accept an invitation in a browser or on another phone, or the circle's owner lets them in. The
 * app would go on remembering "no circles" and keep them on "Who is it for?". So the circles are asked for
 * again each time the setup screens come to the front (the screens themselves, and the app or the browser
 * tab they are in), and when the answer holds a circle, Home opens on it.
 *
 * Only for someone who is in none and stands on the first step: a circle made or joined right here is
 * written into what the app has loaded by the step that made it, which then leads on by itself.
 */
export function useJoinedElsewhere(): void {
  const client = useQueryClient();
  const finish = useFinishSetup();
  const { refetch } = useGetCircles();
  const pathname = usePathname();
  const here = useRef(pathname);
  useEffect(() => {
    here.current = pathname;
  }, [pathname]);

  const look = useCallback(async () => {
    const inNone = () => client.getQueryData<CircleResponse[]>(getGetCirclesQueryKey())?.length === 0;
    if (!inNone() || here.current !== START || client.isMutating() > 0) return;
    const asked = await refetch();
    // A step of these screens may have made a circle while the answer was on its way: then it leads on itself.
    if ((asked.data?.length ?? 0) > 0 && here.current === START && client.isMutating() === 0) finish();
  }, [client, refetch, finish]);

  // The setup screens come to the front in the app…
  useFocusEffect(
    useCallback(() => {
      void look();
    }, [look]),
  );
  // …and the app comes to the front on the phone (or its tab does, in a browser).
  useEffect(() => focusManager.subscribe((inFront) => void (inFront && look())), [look]);
}

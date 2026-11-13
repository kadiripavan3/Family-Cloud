import { Redirect, useLocalSearchParams } from 'expo-router';

import { NotFound } from '@/features/states/NotFound';
import { looksLikeId } from '@/features/things/open';

/**
 * `homeport://keep?journey=<id>`: the link behind "Keep in Homeport" on Journey's recap (10.2, which is
 * Journey's own screen). It lands on "What to keep" for that journey (10.3). Without a journey it leads to
 * the list of your journeys, to choose one.
 */
export default function KeepLink() {
  const { journey } = useLocalSearchParams<{ journey?: string }>();
  if (journey === undefined) return <Redirect href="/journey/keep" />;
  if (!looksLikeId(journey)) return <NotFound />;
  return <Redirect href={{ pathname: '/journey/keep/[journeyId]', params: { journeyId: journey } }} />;
}

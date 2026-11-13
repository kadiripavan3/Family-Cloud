import { useGetUnreadActivity } from '@/api/generated/homeport';
import { useCircleIfAny } from '@/features/circles/current';

/**
 * Whether something in the current circle is new since the person last opened Activity there: the dot on
 * the tab. One small question a minute while the app is in front; it never builds the list.
 */
export function useActivityNews(): boolean {
  const circle = useCircleIfAny();
  const unread = useGetUnreadActivity(circle?.id ?? '', { query: { enabled: !!circle, refetchInterval: 60_000 } });
  return (unread.data?.fresh ?? 0) > 0;
}

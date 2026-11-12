import { useRouter } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';

import { type CircleResponse, type KittyViewResponse, useGetBoards } from '@/api/generated/homeport';
import { thingHref } from '@/features/things/open';
import { useBoard, useBoardChanges } from '@/features/templates/useBoard';
import { layout, useTheme } from '@/theme';
import { Tap } from '@/ui/Motion';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

import { LowChips } from './LowChips';

/**
 * "Running low" on a flat's Today (`flat-today`): the kitty's usual things as chips, ticked when one is
 * running low. A tap marks a thing as running low, or as not any more: the same verb the kitty's own page
 * uses, so the two never disagree. The title leads to the kitty. Today mounts it for a flat; it draws its
 * own title, and nothing at all in a circle without a kitty (or with one that has no usual things).
 */
export function RunningLow({ circle }: { circle: CircleResponse }) {
  const kitties = useGetBoards(circle.id, { template: 'kitty' });
  // A flat has one kitty. Should it have started a second, the one that was used last is the one Today shows.
  const kitty = kitties.data?.items?.[0];
  if (!kitty?.id) return null;
  return <Chips id={kitty.id} circleId={circle.id} canEdit={kitty.canEdit !== false} />;
}

function Chips({ id, circleId, canEdit }: { id: string; circleId: string; canEdit: boolean }) {
  const { colors } = useTheme();
  const router = useRouter();
  const asked = useBoard(id);
  const changes = useBoardChanges({ id, circleId });
  // The board was found by its template, so its view is a kitty's.
  const view = asked.data?.view as KittyViewResponse | undefined;
  if (!view || view.items.length === 0) return null;
  return (
    <>
      <Tap
        accessibilityRole="button"
        accessibilityLabel={words.flat.low.open}
        onPress={() => router.navigate(thingHref({ kind: 'board', id }))}
        style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 4, marginTop: 26, marginBottom: 12, marginHorizontal: layout.barGutter }}>
        <Txt variant="subtitle">{words.flat.low.title}</Txt>
        <ChevronRight size={18} color={colors.text} strokeWidth={2.6} />
      </Tap>
      <LowChips items={view.items} onToggle={canEdit ? (item) => void changes.act('low', { itemId: item.id, low: !item.low }) : undefined} />
      {changes.problem ? (
        <Txt variant="caption" color="danger" accessibilityLiveRegion="polite" style={{ marginTop: 8, marginHorizontal: layout.barGutter }}>
          {changes.problem}
        </Txt>
      ) : null}
    </>
  );
}

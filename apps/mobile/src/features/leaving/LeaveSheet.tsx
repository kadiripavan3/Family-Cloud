import { useMutation } from '@tanstack/react-query';
import { Check, Copy, KeyRound, type LucideIcon } from 'lucide-react-native';
import { View } from 'react-native';

import { useCache } from '@/api/cache';
import { messageFor } from '@/api/fetcher';
import { type CircleResponse, removeMember, useGetLeaving } from '@/api/generated/homeport';
import { layout, useTheme } from '@/theme';
import { Button } from '@/ui/Button';
import { Loading } from '@/ui/Loading';
import { Sheet } from '@/ui/Sheet';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

const says = words.you.leaving.leaveSheet;

type Props = {
  visible: boolean;
  onClose: () => void;
  circle: CircleResponse;
  /** The person has left: the circle is out of their list already. */
  onLeft: () => void;
};

/**
 * Asks before leaving a circle, with the numbers: how many things only this person can see (they are
 * deleted), how many they shared (those stay for the others), and how many shared passwords stop working.
 * It also says who becomes the owner, that the circle goes when they are the last one in it, and why an
 * owner can't leave while no other adult can take over.
 */
export function LeaveSheet({ visible, onClose, circle, onLeft }: Props) {
  const cache = useCache();
  const asked = useGetLeaving(circle.id, { query: { enabled: visible, refetchOnMount: 'always' } });
  const numbers = asked.data;
  const leave = useMutation({
    mutationFn: () => removeMember(circle.myMemberId),
    onSuccess: () => {
      onClose();
      // Out of the list first, so the app is on another circle (or on setting one up) before anything is asked again.
      void cache.circleLeft(circle);
      onLeft();
    },
  });

  return (
    <Sheet visible={visible} onClose={onClose} title={says.title(circle.name)}>
      {!numbers ? (
        asked.isError ? (
          <Txt variant="caption" color="danger" accessibilityLiveRegion="polite" style={{ paddingHorizontal: layout.gutter, paddingBottom: 8 }}>
            {messageFor(asked.error)}
          </Txt>
        ) : (
          <View style={{ minHeight: 140 }}>
            <Loading offline={asked.isPaused} />
          </View>
        )
      ) : (
        <>
          <View style={{ gap: 12, marginTop: 6, marginBottom: 16, marginHorizontal: layout.rowGutter }}>
            <Line icon={Check} text={says.onlyYours(numbers.onlyYours)} />
            <Line icon={Copy} text={says.shared(numbers.shared)} />
            <Line icon={KeyRound} text={says.passwords(numbers.passwords)} />
          </View>
          {numbers.lastOne || numbers.nextOwner || numbers.ownerNeeded ? (
            <Txt variant="callout" color="muted" style={{ paddingHorizontal: layout.gutter, paddingBottom: 12 }}>
              {numbers.ownerNeeded ? says.ownerNeeded : numbers.lastOne ? says.lastOne(circle.name) : says.nextOwner(numbers.nextOwner ?? '')}
            </Txt>
          ) : null}
        </>
      )}
      {leave.isError ? (
        <Txt variant="caption" color="danger" accessibilityLiveRegion="polite" style={{ paddingHorizontal: layout.gutter, paddingBottom: 8 }}>
          {messageFor(leave.error)}
        </Txt>
      ) : null}
      <View style={{ gap: 10, paddingTop: 6, paddingHorizontal: layout.rowGutter }}>
        <Button label={says.confirm(circle.name)} variant="danger" size="lg" block disabled={!numbers || numbers.ownerNeeded} loading={leave.isPending} onPress={() => leave.mutate()} />
        <Button label={says.stay} variant="soft" size="lg" block onPress={onClose} />
      </View>
    </Sheet>
  );
}

/** One thing that happens, with its number: an icon and a sentence. */
function Line({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
      <Icon size={20} color={colors.muted} />
      <Txt variant="item" weight={600} style={{ flex: 1 }}>
        {text}
      </Txt>
    </View>
  );
}

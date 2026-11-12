import { useRouter } from 'expo-router';
import { Bell, BellOff, ChevronRight, Newspaper } from 'lucide-react-native';
import { View } from 'react-native';

import { useCache } from '@/api/cache';
import { messageFor } from '@/api/fetcher';
import { type CircleResponse, useMuteCircle } from '@/api/generated/homeport';
import { addDays, mondayOf, today } from '@/lib/dates';
import { layout, useTheme } from '@/theme';
import { Sheet, SheetRow } from '@/ui/Sheet';
import { Toggle } from '@/ui/Toggle';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

const says = words.activity.sheet;

/**
 * The sheet behind Activity's gear: muting this circle (nothing that happens in it is pushed; Activity
 * still shows it all), the way to last week's Sunday summary, and to what the phone tells you about.
 */
export function ActivitySheet({ visible, onClose, circle, muted }: { visible: boolean; onClose: () => void; circle: CircleResponse; muted: boolean }) {
  const { colors } = useTheme();
  const router = useRouter();
  const cache = useCache();
  const mute = useMuteCircle({
    mutation: {
      // The switch moves at once, and goes back when the API said no.
      onMutate: ({ data }) => cache.circleMuted(circle.id, data.muted),
      onError: (_error, { data }) => cache.circleMuted(circle.id, !data.muted),
    },
  });
  const go = (to: () => void) => {
    onClose();
    to();
  };
  return (
    <Sheet visible={visible} onClose={onClose} title={says.title(circle.name)}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 13, paddingHorizontal: layout.gutter }}>
        <BellOff size={22} color={colors.text} />
        <View style={{ flex: 1, gap: 1 }}>
          <Txt variant="headline" weight={600}>
            {says.mute.label(circle.name)}
          </Txt>
          <Txt variant="footnote" color="muted">
            {says.mute.note}
          </Txt>
        </View>
        <Toggle label={says.mute.label(circle.name)} value={muted} onChange={(next) => mute.mutate({ id: circle.id, data: { muted: next } })} />
      </View>
      {mute.isError ? (
        <Txt variant="caption" color="danger" accessibilityLiveRegion="polite" style={{ paddingHorizontal: layout.gutter, paddingBottom: 8 }}>
          {messageFor(mute.error)}
        </Txt>
      ) : null}
      <SheetRow
        icon={(c) => <Newspaper size={22} color={c} />}
        label={says.summary.label}
        note={says.summary.note}
        trailing={<ChevronRight size={18} color={colors.muted} />}
        // The summary is of a week that has ended: the last one.
        onPress={() => go(() => router.push({ pathname: '/summary/[circleId]', params: { circleId: circle.id, week: addDays(mondayOf(today()), -7) } }))}
      />
      <SheetRow icon={(c) => <Bell size={22} color={c} />} label={says.notifications.label} note={says.notifications.note} trailing={<ChevronRight size={18} color={colors.muted} />} onPress={() => go(() => router.push('/settings/notifications'))} />
    </Sheet>
  );
}

import { Check, Route, Trash2, Upload } from 'lucide-react-native';
import { ScrollView, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useGetLenses, useGetStorage } from '@/api/generated/homeport';
import { useCircle } from '@/features/circles/current';
import { formatBytes } from '@/features/library/sizes';
import { useToast } from '@/features/library/Toast';
import { PageProblem } from '@/features/states/PageProblem';
import { loadState } from '@/lib/loading';
import { firstName } from '@/lib/names';
import { layout, radius, useTheme } from '@/theme';
import { AppBar } from '@/ui/AppBar';
import { Avatar } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { GroupLabel } from '@/ui/Heading';
import { Loading } from '@/ui/Loading';
import { Row, RowGroup } from '@/ui/Rows';
import { Sk } from '@/ui/Skeleton';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

const says = words.library.storage;

/**
 * 12.2 Storage and backup: what the current circle keeps, by what and by whom. Photos and videos are what
 * takes the room, so the page is plain about it. The three rows under "This phone" are a phone's work
 * (backing up the camera roll by itself, freeing up space): they are drawn, and say so when pressed.
 */
export default function Storage() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const circle = useCircle();
  const { say, toast } = useToast(insets.bottom + 32);
  const asked = useGetStorage(circle.id);
  const lenses = useGetLenses(circle.id);
  const load = loadState(asked);
  const data = asked.data;
  const fromJourney = lenses.data?.albums.fromJourney ?? 0;

  const kinds = data
    ? [
        { name: says.kinds.photos, bytes: data.photoBytes, color: colors.accent },
        { name: says.kinds.videos, bytes: data.videoBytes, color: colors.tint2 },
        { name: says.kinds.files, bytes: data.documentBytes, color: colors.tint3 },
        { name: says.kinds.other, bytes: data.otherBytes, color: colors.tint4 },
      ]
    : [];
  const most = Math.max(1, ...(data?.people ?? []).map((one) => one.bytes ?? 0));

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar title={says.title} trailing={<View style={{ width: 40 }} />} />
      {load.error ? (
        <PageProblem error={load.error} onRetry={load.retry} retrying={load.retrying} />
      ) : !data ? (
        load.offline ? (
          <Loading offline />
        ) : (
          <View accessibilityLabel={words.states.loading} style={{ gap: 12, marginTop: 4, marginHorizontal: layout.rowGutter }}>
            <Sk width={150} height={40} />
            <Sk width={240} height={14} />
            <Sk height={14} radius="chip" />
          </View>
        )
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 48 }} showsVerticalScrollIndicator={false}>
          <View style={{ marginTop: 4, marginHorizontal: layout.rowGutter }}>
            <Txt variant="hero" accessibilityRole="header">
              {formatBytes(data.usedBytes)}
            </Txt>
            <Txt variant="note" weight={600} color="muted">
              {says.of(formatBytes(data.quotaBytes), circle.kind === 'solo' ? null : circle.name)}
            </Txt>
            {/* Each kind's share of what the circle may keep. One that is there at all is drawn wide enough to see. */}
            <View style={{ flexDirection: 'row', gap: 3, height: 14, marginTop: 14, marginBottom: 10, borderRadius: radius.chip, overflow: 'hidden', backgroundColor: colors.fill2 }}>
              {kinds.map((kind) => (kind.bytes > 0 ? <View key={kind.name} style={{ width: `${Math.min(100, (kind.bytes / Math.max(1, data.quotaBytes)) * 100)}%`, minWidth: 4, backgroundColor: kind.color }} /> : null))}
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 6 }}>
              {kinds.map((kind) => (
                <View key={kind.name} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={{ width: 9, height: 9, borderRadius: radius.pill, backgroundColor: kind.color }} />
                  <Txt variant="footnote" weight={600}>
                    {says.kind(kind.name, formatBytes(kind.bytes))}
                  </Txt>
                </View>
              ))}
            </View>
          </View>

          <GroupLabel style={{ marginHorizontal: layout.gutter }}>{says.byPerson}</GroupLabel>
          {data.people.map((one, index) => {
            const name = one.you ? says.you : one.person?.name ? firstName(one.person.name) : says.whoLeft;
            const size = formatBytes(one.bytes ?? 0);
            return (
              <View key={one.person?.memberId ?? index} accessible accessibilityLabel={says.person(name, size)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 7, paddingHorizontal: layout.rowGutter }}>
                <Avatar uri={one.person?.avatarUrl} name={one.person?.name ?? name} size={34} />
                <Txt variant="control" numberOfLines={1}>
                  {name}
                </Txt>
                <View style={{ flex: 1, height: 6, borderRadius: radius.pill, overflow: 'hidden', backgroundColor: colors.fill2 }}>
                  <View style={{ width: `${Math.max(2, ((one.bytes ?? 0) / most) * 100)}%`, height: 6, borderRadius: radius.pill, backgroundColor: colors.accent }} />
                </View>
                <Txt variant="footnote" weight={600} color="muted" style={{ minWidth: 46, textAlign: 'right' }}>
                  {size}
                </Txt>
              </View>
            );
          })}

          <GroupLabel style={{ marginHorizontal: layout.gutter }}>{says.thisPhone}</GroupLabel>
          <RowGroup>
            <Row first icon={(c) => <Upload size={18} color={c} />} label={says.backup.title} note={says.backup.note} onPress={() => say(says.backup.why)} />
            <Row icon={(c) => <Route size={18} color={c} />} label={says.journey.title} note={fromJourney > 0 ? says.journey.some(fromJourney) : says.journey.none} trailing={fromJourney > 0 ? <Check size={20} color={colors.ok} strokeWidth={2.6} /> : undefined} />
            <Row icon={(c) => <Trash2 size={18} color={c} />} label={says.freeUp.title} note={says.freeUp.note} trailing={<Button label={says.freeUp.button} size="sm" variant="soft" inline onPress={() => say(says.freeUp.why)} />} />
          </RowGroup>
        </ScrollView>
      )}
      {toast}
    </SafeAreaView>
  );
}

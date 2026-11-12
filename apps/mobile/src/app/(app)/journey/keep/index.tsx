import { useRouter } from 'expo-router';
import { ChevronRight, Info } from 'lucide-react-native';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { type JourneyBrief, useGetJourneySwitch, useGetKeptJourneysInfinite, useGetMyJourneysInfinite } from '@/api/generated/homeport';
import { more, paged, rows, useEveryPage } from '@/api/pages';
import { useCircle } from '@/features/circles/current';
import { JourneyCover } from '@/features/journeyLink/parts';
import { PageProblem } from '@/features/states/PageProblem';
import { loadState } from '@/lib/loading';
import { layout, radius, useTheme } from '@/theme';
import { AppBar } from '@/ui/AppBar';
import { EmptyState } from '@/ui/EmptyState';
import { Lead } from '@/ui/Heading';
import { List } from '@/ui/List';
import { Loading } from '@/ui/Loading';
import { Tap } from '@/ui/Motion';
import { NoteBox } from '@/ui/NoteBox';
import { RowGroup, ToggleRow } from '@/ui/Rows';
import { ListSkeleton } from '@/ui/Skeleton';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

/**
 * Keep a journey: your own journeys in Journey, newest first, to choose one to bring home (10.3). The ones
 * kept in this circle already say so; choosing one again brings home what was added since. Not drawn: it is
 * the way to "What to keep" from inside this app, where Journey's recap is the way from the other one.
 */
export default function KeepList() {
  const { colors } = useTheme();
  const router = useRouter();
  const circle = useCircle();
  const says = words.together.keep.list;
  const asked = useGetMyJourneysInfinite(undefined, { query: paged });
  const kept = useGetKeptJourneysInfinite(circle.id, undefined, { query: paged });
  useEveryPage(kept);
  const sample = useGetJourneySwitch().data?.mode === 'local';
  const load = loadState(asked);
  const journeys = rows(asked.data);
  const keptIds = new Set((rows(kept.data) ?? []).map((one) => one.journeyId));

  const none = (
    <View style={{ paddingTop: 40, paddingBottom: 24 }}>
      <EmptyState emoji="🌍" title={says.none.title} body={says.none.body} />
    </View>
  );

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar title={says.title} />
      {load.error ? (
        <PageProblem error={load.error} onRetry={load.retry} retrying={load.retrying} />
      ) : !journeys ? (
        load.offline ? (
          <Loading offline />
        ) : (
          <ListSkeleton count={3} />
        )
      ) : (
        <List<JourneyBrief>
          data={journeys}
          keyOf={(journey, index) => journey.id ?? String(index)}
          header={
            <View style={{ marginBottom: 14 }}>
              <Lead style={{ marginTop: 2, marginHorizontal: layout.rowGutter }}>{says.lead}</Lead>
              {sample ? (
                <NoteBox icon={(c) => <Info size={20} color={c} />} style={{ marginTop: 14, marginHorizontal: layout.barGutter }}>
                  {says.sample}
                </NoteBox>
              ) : null}
            </View>
          }
          row={(journey) => (
            <Tap
              accessibilityRole="button"
              accessibilityLabel={words.common.spoken([journey.title, says.line(journey.days ?? 0, journey.entries ?? 0), says.status(journey.status), keptIds.has(journey.id ?? '') ? says.kept : null])}
              onPress={() => router.push({ pathname: '/journey/keep/[journeyId]', params: { journeyId: journey.id ?? '' } })}
              scaleTo={0.985}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8, marginHorizontal: layout.barGutter, padding: 10, borderRadius: radius.card, backgroundColor: colors.fill }}>
              <JourneyCover uri={journey.coverUrl} size={56} />
              <View style={{ flex: 1, gap: 1 }}>
                <Txt variant="item" weight={800} numberOfLines={1}>
                  {journey.title}
                </Txt>
                <Txt variant="footnote" color="muted" numberOfLines={1}>
                  {words.common.join([says.line(journey.days ?? 0, journey.entries ?? 0), says.status(journey.status)])}
                </Txt>
              </View>
              {keptIds.has(journey.id ?? '') ? (
                <View style={{ paddingVertical: 4, paddingHorizontal: 9, borderRadius: radius.pill, backgroundColor: colors.accentSoft }}>
                  <Txt variant="small" weight={700} color="accentText">
                    {says.kept}
                  </Txt>
                </View>
              ) : null}
              <ChevronRight size={18} color={colors.muted} />
            </Tap>
          )}
          empty={none}
          footer={
            // Drawn in the proposal, not built: the switch says so instead of pretending.
            <View style={{ marginTop: 10 }}>
              <RowGroup>
                <ToggleRow first locked label={says.every.title} note={says.every.note} value={false} />
              </RowGroup>
            </View>
          }
          loadingMore={asked.isFetchingNextPage}
          {...more(asked)}
        />
      )}
    </SafeAreaView>
  );
}

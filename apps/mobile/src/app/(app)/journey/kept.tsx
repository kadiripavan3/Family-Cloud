import { useRouter } from 'expo-router';
import { ChevronRight, House, Plus } from 'lucide-react-native';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { type KeptResponse, useGetKeptJourneysInfinite } from '@/api/generated/homeport';
import { more, paged, rows } from '@/api/pages';
import { useCircle } from '@/features/circles/current';
import { JourneyCover } from '@/features/journeyLink/parts';
import { PageProblem } from '@/features/states/PageProblem';
import { thingHref } from '@/features/things/open';
import { formatDay, toISODate } from '@/lib/dates';
import { loadState } from '@/lib/loading';
import { layout, radius, useTheme } from '@/theme';
import { AppBar } from '@/ui/AppBar';
import { JourneyMark } from '@/ui/Brand';
import { Button } from '@/ui/Button';
import { EmptyState } from '@/ui/EmptyState';
import { List } from '@/ui/List';
import { Loading } from '@/ui/Loading';
import { Tap } from '@/ui/Motion';
import { RoundButton } from '@/ui/RoundButton';
import { Row, RowGroup } from '@/ui/Rows';
import { ListSkeleton } from '@/ui/Skeleton';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

/**
 * Kept from Journey: the journeys kept in the current circle that you may see, the last kept first. Each
 * opens its book (a page in Notes, 10.4), or its album where no book was kept. The + keeps another. Not
 * drawn: it is the list the Library's and Today's ways to kept journeys lead to.
 */
export default function KeptJourneys() {
  const { colors } = useTheme();
  const router = useRouter();
  const circle = useCircle();
  const says = words.together.kept;
  const asked = useGetKeptJourneysInfinite(circle.id, undefined, { query: paged });
  const load = loadState(asked);
  const kept = rows(asked.data);
  const keepOne = () => router.push('/journey/keep');
  const open = (one: KeptResponse) => {
    if (one.pageId) router.push(thingHref({ kind: 'page', id: one.pageId }));
    else if (one.albumId) router.push(thingHref({ kind: 'album', id: one.albumId }));
  };

  const none = (
    <View style={{ paddingTop: 48, paddingBottom: 24 }}>
      <EmptyState emoji="📖" title={says.none.title} body={says.none.body} action={<Button label={says.add} onPress={keepOne} />} />
    </View>
  );

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar title={says.title} trailing={<RoundButton label={says.add} onPress={keepOne} icon={(c) => <Plus size={20} color={c} />} />} />
      {load.error ? (
        <PageProblem error={load.error} onRetry={load.retry} retrying={load.retrying} />
      ) : !kept ? (
        load.offline ? (
          <Loading offline />
        ) : (
          <ListSkeleton count={3} />
        )
      ) : (
        <List<KeptResponse>
          data={kept}
          keyOf={(one) => one.id}
          top={8}
          row={(one) => (
            <Tap
              accessibilityRole="button"
              accessibilityLabel={words.common.spoken([one.title, says.by(one.byline), says.line(one.stats.photos ?? 0, formatDay(toISODate(new Date(one.keptAt))))])}
              disabled={!one.pageId && !one.albumId}
              onPress={() => open(one)}
              scaleTo={0.985}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8, marginHorizontal: layout.barGutter, padding: 10, borderRadius: radius.card, backgroundColor: colors.fill }}>
              <JourneyCover uri={one.coverUrl} size={64} />
              <View style={{ flex: 1, gap: 1 }}>
                <Txt variant="item" weight={800} numberOfLines={1}>
                  {one.title}
                </Txt>
                <Txt variant="footnote" color="muted" numberOfLines={1}>
                  {says.by(one.byline)}
                </Txt>
                <Txt variant="footnote" color="muted" numberOfLines={1}>
                  {says.line(one.stats.photos ?? 0, formatDay(toISODate(new Date(one.keptAt))))}
                </Txt>
              </View>
              <JourneyMark size={28} />
              <ChevronRight size={18} color={colors.muted} />
            </Tap>
          )}
          empty={none}
          footer={
            <View style={{ marginTop: 10 }}>
              <RowGroup>
                <Row first icon={(c) => <House size={18} color={c} />} label={says.atHome} onPress={() => router.push('/journey/at-home')} />
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

import { useMutation } from '@tanstack/react-query';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Settings } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useCache } from '@/api/cache';
import { type ActivityButton, ActivityFilter, type ActivityLine, type CircleResponse, markBillPaid, useGetActivityInfinite, useMarkActivitySeen } from '@/api/generated/homeport';
import { changeNotSent } from '@/api/online';
import { more, paged } from '@/api/pages';
import { ActivityLineRow } from '@/features/activity/ActivityLineRow';
import { ActivitySheet } from '@/features/activity/ActivitySheet';
import { questionOf, useAnswerAsk } from '@/features/activity/AnswerAsk';
import { type ActivityRow, freshIds, rowsOf } from '@/features/activity/rows';
import { useCircle } from '@/features/circles/current';
import { placeHref, TAB_BAR_ROOM } from '@/features/home/places';
import { useNotice } from '@/features/plan/Notice';
import { PageProblem } from '@/features/states/PageProblem';
import { useOpenThing } from '@/features/things/open';
import { phoneTimeZone, today } from '@/lib/dates';
import { loadState } from '@/lib/loading';
import { layout, useTheme } from '@/theme';
import { Chip } from '@/ui/Chip';
import { EmptyState } from '@/ui/EmptyState';
import { GroupLabel } from '@/ui/Heading';
import { List } from '@/ui/List';
import { Loading } from '@/ui/Loading';
import { RoundButton } from '@/ui/RoundButton';
import { ListSkeleton } from '@/ui/Skeleton';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

const says = words.activity;
/** The chips, in the order they are drawn. */
const FILTERS = [ActivityFilter.all, ActivityFilter.asks, ActivityFilter.photos, ActivityFilter.money, ActivityFilter.plan] as const;
const isFilter = (value: unknown): value is ActivityFilter => typeof value === 'string' && (FILTERS as readonly string[]).includes(value);

/**
 * 11.1 Activity: what changed in the current circle, what is due and who is asking, newest first. The API
 * only sends what this person may see, so a hidden plan stays hidden. A request to see a password is
 * answered right here, a bill is paid from the line that says it is due, and opening the tab is what marks
 * everything as seen. It is drawn afresh for another circle.
 */
export default function Activity() {
  const circle = useCircle();
  return <ActivityOf key={circle.id} circle={circle} />;
}

function ActivityOf({ circle }: { circle: CircleResponse }) {
  const { colors } = useTheme();
  const router = useRouter();
  const cache = useCache();
  const open = useOpenThing();
  const [say, notice] = useNotice();
  // A notification can name the chip to open on ("/activity?filter=asks"); the tab follows each one.
  const { filter: named } = useLocalSearchParams<{ filter?: string }>();
  const [filter, setFilter] = useState<ActivityFilter>(isFilter(named) ? named : 'all');
  const [followed, setFollowed] = useState(named);
  if (named !== followed) {
    setFollowed(named);
    if (isFilter(named)) setFilter(named);
  }
  const [settings, setSettings] = useState(false);
  const [pulling, setPulling] = useState(false);

  const asked = useGetActivityInfinite(circle.id, { filter, zone: phoneTimeZone(), day: today() }, { query: paged });
  const load = loadState(asked);
  const first = asked.data?.pages[0];

  // Opening the tab is what marks everything as seen. What was new then keeps its highlight while the tab
  // is in front, and the API is told, so the dot on the tab goes.
  const [stillFresh, setStillFresh] = useState<ReadonlySet<string>>(new Set());
  const { mutate: seen } = useMarkActivitySeen();
  const newIds = freshIds(asked.data);
  useFocusEffect(
    useCallback(() => {
      if (!newIds) return;
      setStillFresh((now) => new Set([...now, ...newIds.split(',')]));
      seen({ id: circle.id }, { onSuccess: () => cache.activitySeen(circle.id) });
    }, [newIds, seen, cache, circle.id]),
  );
  // Leaving the tab forgets them; coming back asks again, for what others did meanwhile.
  const { refetch } = asked;
  const again = useRef(refetch);
  useEffect(() => {
    again.current = refetch;
  });
  const visits = useRef(0);
  useFocusEffect(
    useCallback(() => {
      visits.current += 1;
      if (visits.current > 1) void again.current();
      return () => setStillFresh(new Set());
    }, []),
  );

  const rows = useMemo(() => rowsOf(asked.data, stillFresh), [asked.data, stillFresh]);

  // Paying a bill from the line that says it is due: the person's own share of that time.
  const pay = useMutation({
    mutationFn: ({ button }: { line: ActivityLine; button: ActivityButton }) => markBillPaid(button.thingId ?? '', { dueOn: button.dueOn ?? '' }),
    onSuccess: (bill) => cache.billSaved(bill),
    // The strip across the top says that it didn't go through.
    onError: () => changeNotSent(),
  });
  const answer = useAnswerAsk(say);

  const press = (line: ActivityLine): (() => void) | undefined => {
    const question = questionOf(line);
    if (question) return () => answer.choose(question);
    if (line.kind === 'export') return () => router.push('/settings/leaving');
    if (line.thingId && line.thingKind) return () => open({ kind: line.thingKind, id: line.thingId });
    if (line.kind === 'photos') return () => router.navigate(placeHref('library'));
    // A line about nothing this app can open (a guest who opened their pass, a journey told in the sister
    // app and kept from there with no thing of its own): it is plain, and pressing it opens nothing.
    return undefined;
  };
  const act = (line: ActivityLine, button: ActivityButton) => {
    const question = questionOf(line);
    if (button.act === 'allow_ask' && question) answer.allow(question);
    else if (button.act === 'pay' && button.thingId && button.dueOn) pay.mutate({ line, button });
    else if (button.act === 'open_exports') router.push('/settings/leaving');
    else if (button.thingId ?? line.thingId) open({ kind: line.thingKind ?? (button.act === 'pay' ? 'bill' : undefined), id: button.thingId ?? line.thingId });
  };
  const busy = (line: ActivityLine) => (pay.isPending && pay.variables.line.id === line.id ? 'pay' : answer.busyLine === line.id ? 'allow_ask' : null);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 6, paddingBottom: 12, paddingLeft: layout.rowGutter, paddingRight: layout.barGutter }}>
        <Txt variant="heading" accessibilityRole="header">
          {words.common.tabs.activity}
        </Txt>
        <RoundButton label={says.sheet.open} icon={(c) => <Settings size={20} color={c} />} onPress={() => setSettings(true)} />
      </View>
      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: layout.barGutter }}>
          {FILTERS.map((one) => (
            <Chip key={one} tone="filter" label={says.filters[one]} selected={one === filter} count={one === 'asks' && first?.asks ? first.asks : undefined} onPress={() => setFilter(one)} />
          ))}
        </ScrollView>
      </View>

      {load.error ? (
        <PageProblem error={load.error} onRetry={load.retry} retrying={load.retrying} />
      ) : !asked.data ? (
        load.offline ? (
          <Loading offline />
        ) : (
          <ListSkeleton />
        )
      ) : (
        <List<ActivityRow>
          data={rows}
          keyOf={(row) => row.key}
          typeOf={(row) => row.type}
          row={(row) =>
            row.type === 'label' ? (
              <GroupLabel style={{ marginHorizontal: layout.gutter }}>{says.groups[row.group]}</GroupLabel>
            ) : (
              <ActivityLineRow line={row.line} fresh={row.fresh} onPress={press(row.line)} onButton={(button) => act(row.line, button)} busy={busy(row.line)} />
            )
          }
          empty={
            <View style={{ paddingTop: 70 }}>
              <EmptyState emoji={says.empty[filter].emoji} title={says.empty[filter].title} body={says.empty[filter].body(circle.name)} />
            </View>
          }
          {...more(asked)}
          loadingMore={asked.isFetchingNextPage}
          refreshing={pulling}
          onRefresh={() => {
            setPulling(true);
            void refetch().finally(() => setPulling(false));
          }}
          bottom={TAB_BAR_ROOM}
        />
      )}
      {notice}
      {answer.sheet}
      <ActivitySheet visible={settings} onClose={() => setSettings(false)} circle={circle} muted={first?.muted ?? false} />
    </SafeAreaView>
  );
}

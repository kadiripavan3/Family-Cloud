import { useRouter } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { useState } from 'react';
import { Platform, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { type DoneResponse, type RemindersResponse, useGetDoneRemindersInfinite, useGetReminders } from '@/api/generated/homeport';
import { more, paged, rows } from '@/api/pages';
import { useCircle } from '@/features/circles/current';
import { useNotice } from '@/features/plan/Notice';
import { ReminderRow } from '@/features/plan/ReminderRow';
import { Tick } from '@/features/plan/Tick';
import { useNudge } from '@/features/plan/useNudge';
import { useTick } from '@/features/plan/useTick';
import { PageProblem } from '@/features/states/PageProblem';
import { useOpenThing } from '@/features/things/open';
import { formatClock, formatDay, formatTime, formatWeekdayDay, nearName, toISODate, today } from '@/lib/dates';
import { loadState } from '@/lib/loading';
import { layout, useTheme } from '@/theme';
import { AppBar } from '@/ui/AppBar';
import { EmptyState } from '@/ui/EmptyState';
import { GroupLabel } from '@/ui/Heading';
import { List } from '@/ui/List';
import { Loading } from '@/ui/Loading';
import { Tap } from '@/ui/Motion';
import { RoundButton } from '@/ui/RoundButton';
import { ListSkeleton } from '@/ui/Skeleton';
import { Txt } from '@/ui/Txt';
import { WordTabs } from '@/ui/WordTabs';
import { words } from '@/words';

type Tab = 'yours' | 'asked' | 'done';

/**
 * 7.5 Reminders. Yours, by day, with a tick; what you asked of someone else, with whether it is done and a
 * gentle Nudge; and the ones that wait for a place instead of a time. "You asked" shows only what you gave
 * to others, "Done" what was ticked. The + makes a new one.
 */
export default function Reminders() {
  const { colors } = useTheme();
  const router = useRouter();
  const circle = useCircle();
  const says = words.plan.reminders;
  const [tab, setTab] = useState<Tab>('yours');
  const [say, notice] = useNotice();
  const asked = useGetReminders(circle.id, { day: today() });
  const load = loadState(asked);
  const data = asked.data;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar title={says.title} trailing={<RoundButton label={says.add} icon={(c) => <Plus size={20} color={c} />} onPress={() => router.push('/new/reminder')} />} />
      <WordTabs
        tabs={[
          { id: 'yours', label: says.tabs.yours, count: data?.yoursCount || undefined },
          { id: 'asked', label: says.tabs.asked, count: data?.askedCount || undefined },
          { id: 'done', label: says.tabs.done },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'done' ? (
        <Done circleId={circle.id} />
      ) : load.error ? (
        <PageProblem error={load.error} onRetry={load.retry} retrying={load.retrying} inset={false} />
      ) : !data ? (
        load.offline ? (
          <Loading offline />
        ) : (
          <ListSkeleton count={5} />
        )
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1, paddingBottom: 40 }} refreshControl={<RefreshControl refreshing={asked.isRefetching} onRefresh={() => void asked.refetch()} tintColor={colors.muted} />}>
          <Open data={data} only={tab} say={say} />
        </ScrollView>
      )}
      {notice}
    </SafeAreaView>
  );
}

/** What is still to do: yours by day, what you asked of others, and the ones that wait for a place. */
function Open({ data, only, say }: { data: RemindersResponse; only: 'yours' | 'asked'; say: (text: string) => void }) {
  const says = words.plan.reminders;
  const ticks = useTick();
  const { nudge, nudgingId } = useNudge(say);
  const label = { marginHorizontal: layout.gutter } as const;
  const dayName = (day: string | null | undefined) => (day ? (nearName(day) ?? formatWeekdayDay(day)) : says.someTime);

  if (only === 'asked') {
    if (data.asked.length === 0) return <Nothing tab="asked" />;
    return (
      <View style={{ paddingTop: 10 }}>
        {data.asked.map((reminder) => (
          <ReminderRow key={reminder.id} reminder={reminder} look="asked" ticked={reminder.done} onTick={ticks.tick} onNudge={nudge} nudging={nudgingId === reminder.id} />
        ))}
      </View>
    );
  }
  if (data.yours.length === 0 && data.asked.length === 0 && data.places.length === 0) return <Nothing tab="yours" />;
  return (
    <>
      {ticks.problem ? (
        <Txt variant="caption" color="danger" accessibilityLiveRegion="polite" style={{ marginTop: 12, marginHorizontal: layout.gutter }}>
          {ticks.problem}
        </Txt>
      ) : null}
      {data.yours.map((group) => (
        <View key={group.day ?? 'some-time'}>
          <GroupLabel style={label}>{dayName(group.day)}</GroupLabel>
          {group.reminders.map((reminder) => (
            <ReminderRow key={reminder.id} reminder={reminder} look="yours" ticked={ticks.shown(reminder.id, reminder.done ? (reminder.tickedDueOn ?? reminder.dueOn) : reminder.dueOn, reminder.done)} onTick={ticks.tick} />
          ))}
        </View>
      ))}
      {data.asked.length ? (
        <>
          <GroupLabel style={label}>{says.askedSomeone}</GroupLabel>
          {data.asked.map((reminder) => (
            <ReminderRow key={reminder.id} reminder={reminder} look="asked" ticked={reminder.done} onTick={ticks.tick} onNudge={nudge} nudging={nudgingId === reminder.id} />
          ))}
        </>
      ) : null}
      {data.places.length ? (
        <>
          <GroupLabel style={label}>{says.atAPlace}</GroupLabel>
          {data.places.map((reminder) => (
            <ReminderRow key={reminder.id} reminder={reminder} look="place" ticked={reminder.done} onTick={ticks.tick} />
          ))}
          <Txt variant="footnote" color="muted" style={{ marginTop: 6, marginHorizontal: layout.gutter }}>
            {Platform.OS === 'web' ? says.placeNote.browser : says.placeNote.phone}
          </Txt>
        </>
      ) : null}
    </>
  );
}

/** What was ticked, last ticked first: a long list, read a page at a time. A tick can be taken away again. */
function Done({ circleId }: { circleId: string }) {
  const { colors } = useTheme();
  const open = useOpenThing();
  const ticks = useTick();
  const says = words.plan.reminders;
  const asked = useGetDoneRemindersInfinite(circleId, undefined, { query: paged });
  const load = loadState(asked);
  const done = rows(asked.data);

  if (load.error) return <PageProblem error={load.error} onRetry={load.retry} retrying={load.retrying} inset={false} />;
  if (!done) return load.offline ? <Loading offline /> : <ListSkeleton count={5} />;
  const line = (one: DoneResponse) => {
    const at = new Date(one.doneAt);
    return words.common.join([says.doneOn(formatDay(toISODate(at)), formatClock(formatTime(at))), one.doneBy?.name ? says.doneBy(one.doneBy.name, one.doneFor?.name ?? null) : null, one.stars > 0 ? says.stars(one.stars) : null]);
  };
  return (
    <List
      data={done}
      keyOf={(one) => one.tickId}
      top={10}
      empty={<Nothing tab="done" />}
      refreshing={asked.isRefetching && !asked.isFetchingNextPage}
      onRefresh={() => void asked.refetch()}
      loadingMore={asked.isFetchingNextPage}
      {...more(asked)}
      row={(one) => {
        // Until the list has caught up, a tick that was just taken away shows as taken away.
        const ticked = ticks.shown(one.reminderId, one.dueOn, true);
        return (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 58, paddingVertical: 10, paddingHorizontal: layout.rowGutter }}>
            <Tick label={says.untickSpoken(one.title)} done={ticked} onChange={one.canEdit ? (next) => ticks.tick({ id: one.reminderId, done: next, dueOn: one.dueOn }) : undefined} />
            <Tap accessibilityRole="button" accessibilityLabel={words.common.spoken([one.title, line(one)])} onPress={() => open({ kind: 'reminder', id: one.reminderId })} scaleTo={0.985} style={{ flex: 1 }}>
              <Txt variant="lead" weight={600} numberOfLines={2} style={{ color: colors.muted, textDecorationLine: ticked ? 'line-through' : 'none' }}>
                {one.title}
              </Txt>
              <Txt variant="footnote" color="muted" numberOfLines={2} style={{ marginTop: 1 }}>
                {line(one)}
              </Txt>
            </Tap>
          </View>
        );
      }}
    />
  );
}

/** Nothing under a tab: what will appear there. */
function Nothing({ tab }: { tab: Tab }) {
  const says = words.plan.reminders.empty[tab];
  return (
    <View style={{ flex: 1, justifyContent: 'center', paddingVertical: 48 }}>
      <EmptyState emoji="🔔" title={says.title} body={says.body} />
    </View>
  );
}

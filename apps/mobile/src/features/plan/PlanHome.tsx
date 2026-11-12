import { keepPreviousData } from '@tanstack/react-query';
import { type Href, useRouter } from 'expo-router';
import { Bell, CalendarDays, type LucideIcon, Target } from 'lucide-react-native';
import { useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';

import { messageFor } from '@/api/fetcher';
import { type PlanResponse, useGetPlan } from '@/api/generated/homeport';
import { useCircle } from '@/features/circles/current';
import { TAB_BAR_ROOM } from '@/features/home/places';
import { formatWeekdayDay, nearName, today } from '@/lib/dates';
import { loadState } from '@/lib/loading';
import { layout, radius, useTheme } from '@/theme';
import { Chip } from '@/ui/Chip';
import { EmptyState } from '@/ui/EmptyState';
import { Loading } from '@/ui/Loading';
import { Problem } from '@/ui/Problem';
import { Sk } from '@/ui/Skeleton';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

import { DayHeader, PlanEntry } from './PlanEntry';
import { useTick } from './useTick';
import { WeekStrip } from './WeekStrip';

/** How many days the list runs on from the day that is chosen. */
const DAYS = 7;

/** The three screens Plan leads to, as chips under the row of places. */
const DOORS: readonly { id: 'month' | 'reminders' | 'goals'; href: Href; icon: LucideIcon }[] = [
  { id: 'month', href: '/plan/month', icon: CalendarDays },
  { id: 'reminders', href: '/plan/reminders', icon: Bell },
  { id: 'goals', href: '/plan/goals', icon: Target },
];

/**
 * 7.1 Plan, under Home's row of six: one list for the day. The strip shows the week with a dot per person;
 * under it, each day from the chosen one on has its lines in order of time: events with a time, jobs with a
 * tick, and what other places bring (a bill that is due). What was due before today and is still open
 * stands on top. The month, the reminders and the goals are one press away.
 */
export function PlanHome() {
  const { colors } = useTheme();
  const router = useRouter();
  const circle = useCircle();
  const now = today();
  const [day, setDay] = useState(now);
  // While another day's list is on its way the one that was showing stays, so the strip doesn't jump.
  const asked = useGetPlan(circle.id, { day, days: DAYS }, { query: { placeholderData: keepPreviousData } });
  const load = loadState(asked);
  const plan = asked.data;

  return (
    <ScrollView
      contentContainerStyle={{ flexGrow: 1, paddingBottom: TAB_BAR_ROOM }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={asked.isRefetching} onRefresh={() => void asked.refetch()} tintColor={colors.muted} />}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingTop: 12, paddingHorizontal: layout.barGutter }}>
        {DOORS.map(({ id, href, icon: Icon }) => (
          <Chip key={id} tone="filter" label={words.plan.home.doors[id]} icon={<Icon size={15} color={colors.text} />} onPress={() => router.push(href)} />
        ))}
      </ScrollView>
      {load.error ? (
        <Problem message={messageFor(load.error)} onRetry={load.retry} retrying={load.retrying} />
      ) : !plan ? (
        load.offline ? (
          <Loading offline />
        ) : (
          <PlanSkeleton />
        )
      ) : (
        <Days plan={plan} chosen={day} today={now} onChoose={setDay} />
      )}
    </ScrollView>
  );
}

/** The strip and the list, once the API has said what is on. */
function Days({ plan, chosen, today: now, onChoose }: { plan: PlanResponse; chosen: string; today: string; onChoose: (day: string) => void }) {
  const ticks = useTick();
  // What is still open from before belongs on top of today, and nowhere else.
  const overdue = plan.day === now ? plan.overdue : [];
  // A day with nothing on it is left out, except the one that was asked for: that one says so.
  const days = plan.days.filter((one) => one.entries.length > 0 || one.day === plan.day);
  const nothing = overdue.length === 0 && plan.days.every((one) => one.entries.length === 0);

  return (
    <>
      <WeekStrip week={plan.week} chosen={chosen} today={now} onChoose={onChoose} />
      {ticks.problem ? (
        <Txt variant="caption" color="danger" accessibilityLiveRegion="polite" style={{ marginTop: 12, marginHorizontal: layout.rowGutter }}>
          {ticks.problem}
        </Txt>
      ) : null}
      {nothing && plan.day === now ? (
        <View style={{ flex: 1, justifyContent: 'center', paddingVertical: 36 }}>
          <EmptyState emoji="📅" title={words.plan.home.empty.title} body={words.plan.home.empty.body} />
        </View>
      ) : (
        <>
          {overdue.length ? (
            <>
              <DayHeader title={words.plan.home.overdue.title} rest={words.plan.home.overdue.since} />
              {overdue.map((entry) => (
                <PlanEntry key={`late-${entry.thingId}-${entry.day}`} entry={entry} wasDue ticked={ticks.shown(entry.thingId, entry.day, entry.done)} onTick={ticks.tick} />
              ))}
            </>
          ) : null}
          {days.map((one) => {
            const near = nearName(one.day);
            return (
              <View key={one.day}>
                <DayHeader title={near ?? formatWeekdayDay(one.day)} rest={near ? formatWeekdayDay(one.day) : null} />
                {one.entries.length === 0 ? (
                  <Txt variant="callout" color="muted" style={{ marginTop: 4, marginHorizontal: layout.rowGutter }}>
                    {words.plan.home.nothingOn}
                  </Txt>
                ) : (
                  one.entries.map((entry, index) => (
                    <PlanEntry key={`${entry.thingId ?? index}-${entry.day}-${entry.done === true}`} entry={entry} ticked={ticks.shown(entry.thingId, entry.day, entry.done)} onTick={ticks.tick} />
                  ))
                )}
              </View>
            );
          })}
        </>
      )}
    </>
  );
}

/** Loading: the strip of seven and a few lines, in grey, where they will be. */
function PlanSkeleton() {
  return (
    <View accessibilityLabel={words.states.loading}>
      <View style={{ flexDirection: 'row', marginTop: 12, marginHorizontal: 10 }}>
        {Array.from({ length: 7 }, (_, index) => (
          <View key={index} style={{ flex: 1, alignItems: 'center', gap: 6, paddingTop: 19 }}>
            <Sk width={34} height={34} radius="pill" />
          </View>
        ))}
      </View>
      <Sk width={150} height={20} radius="chip" style={{ marginTop: 26, marginBottom: 10, marginHorizontal: 20 }} />
      {[0, 1, 2].map((row) => (
        <View key={row} style={{ flexDirection: 'row', gap: 10, paddingVertical: 4, paddingHorizontal: 16 }}>
          <Sk width={42} height={14} radius="chip" style={{ marginTop: 12 }} />
          <View style={{ flex: 1, height: 58, borderRadius: radius.photo, overflow: 'hidden' }}>
            <Sk height={58} radius="photo" />
          </View>
        </View>
      ))}
    </View>
  );
}

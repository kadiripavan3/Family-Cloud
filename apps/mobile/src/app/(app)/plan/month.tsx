import { keepPreviousData } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react-native';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useGetMonth, useGetPlan } from '@/api/generated/homeport';
import { useCircle } from '@/features/circles/current';
import { membersOf } from '@/features/circles/members';
import { MonthGrid } from '@/features/plan/MonthGrid';
import { PersonChip } from '@/features/plan/PersonChip';
import { DayHeader, PlanEntry } from '@/features/plan/PlanEntry';
import { useTick } from '@/features/plan/useTick';
import { PageProblem } from '@/features/states/PageProblem';
import { addMonths, formatMonth, formatWeekdayDay, monthOf, today } from '@/lib/dates';
import { loadState } from '@/lib/loading';
import { firstName } from '@/lib/names';
import { layout, useTheme } from '@/theme';
import { AppBar } from '@/ui/AppBar';
import { Loading } from '@/ui/Loading';
import { Tap } from '@/ui/Motion';
import { RoundButton } from '@/ui/RoundButton';
import { Sk } from '@/ui/Skeleton';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

/** True for a day as the address carries it: "2026-11-14". */
const isDay = (value: string | undefined): value is string => !!value && /^\d{4}-\d{2}-\d{2}$/.test(value);

/**
 * 7.2 Month: the month at a glance, with a dot per person, and under it the list of the day that is chosen.
 * A face at the top shows only that person's days. The arrows beside the month's name go to the months
 * before and after; the + adds an event on the chosen day.
 */
export default function Month() {
  const { colors } = useTheme();
  const router = useRouter();
  const circle = useCircle();
  const now = today();
  const { day: asked } = useLocalSearchParams<{ day?: string }>();
  const [chosen, setChosen] = useState(isDay(asked) ? asked : now);
  const [month, setMonth] = useState(monthOf(chosen));
  /** Whose days to show. Null: everyone's. */
  const [member, setMember] = useState<string | null>(null);
  const ticks = useTick();

  const filter = member ? { member } : {};
  const grid = useGetMonth(circle.id, { month, ...filter }, { query: { placeholderData: keepPreviousData } });
  const list = useGetPlan(circle.id, { day: chosen, days: 1, ...filter }, { query: { placeholderData: keepPreviousData } });
  const load = loadState(grid, list);
  const entries = list.data?.day === chosen ? (list.data.days[0]?.entries ?? []) : null;

  const choose = (day: string) => {
    setChosen(day);
    // A pale day of the month before or after takes the grid there with it.
    if (monthOf(day) !== month) setMonth(monthOf(day));
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar
        center={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Tap accessibilityRole="button" accessibilityLabel={words.dates.previousMonth} hitSlop={12} onPress={() => setMonth(addMonths(month, -1))} scaleTo={0.9}>
              <ChevronLeft size={18} color={colors.muted} />
            </Tap>
            <Txt variant="subheading" accessibilityRole="header" accessibilityLiveRegion="polite" numberOfLines={1}>
              {formatMonth(month)}
            </Txt>
            <Tap accessibilityRole="button" accessibilityLabel={words.dates.nextMonth} hitSlop={12} onPress={() => setMonth(addMonths(month, 1))} scaleTo={0.9}>
              <ChevronRight size={18} color={colors.muted} />
            </Tap>
          </View>
        }
        trailing={<RoundButton label={words.plan.month.newEvent} icon={(c) => <Plus size={20} color={c} />} onPress={() => router.push({ pathname: '/new/event', params: { day: chosen } })} />}
      />
      {load.error ? (
        <PageProblem error={load.error} onRetry={load.retry} retrying={load.retrying} inset={false} />
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: layout.barGutter }}>
            <PersonChip label={words.plan.month.everyone} on={member === null} onPress={() => setMember(null)} />
            {membersOf(circle).map((one) => (
              <PersonChip key={one.id} label={one.you ? words.plan.month.you : firstName(one.name)} person={one} on={member === one.id} onPress={() => setMember(one.id)} />
            ))}
          </ScrollView>
          {!grid.data ? (
            <View style={{ minHeight: 320 }}>{load.offline ? <Loading offline /> : <Sk height={292} radius="card" style={{ marginTop: 12, marginHorizontal: layout.barGutter }} />}</View>
          ) : (
            <MonthGrid days={grid.data.days} chosen={chosen} today={now} onChoose={choose} />
          )}
          <DayHeader title={formatWeekdayDay(chosen)} />
          {ticks.problem ? (
            <Txt variant="caption" color="danger" accessibilityLiveRegion="polite" style={{ marginBottom: 6, marginHorizontal: layout.rowGutter }}>
              {ticks.problem}
            </Txt>
          ) : null}
          {entries === null ? (
            <View style={{ height: 90 }}>
              <Loading offline={load.offline} />
            </View>
          ) : entries.length === 0 ? (
            <Txt variant="callout" color="muted" style={{ marginTop: 4, marginHorizontal: layout.rowGutter }}>
              {words.plan.month.nothingOn}
            </Txt>
          ) : (
            entries.map((entry, index) => (
              <PlanEntry key={`${entry.thingId ?? index}-${entry.done === true}`} entry={entry} ticked={ticks.shown(entry.thingId, entry.day, entry.done)} onTick={ticks.tick} />
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

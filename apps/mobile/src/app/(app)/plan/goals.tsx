import { useRouter } from 'expo-router';
import { Plus, Route } from 'lucide-react-native';
import { RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { type GoalRowResponse, useGetGoal, useGetGoals } from '@/api/generated/homeport';
import { useCircle } from '@/features/circles/current';
import { BigRing } from '@/features/plan/BigRing';
import { Faces } from '@/features/plan/Faces';
import { kindOfGoal } from '@/features/plan/goalDraft';
import { PageProblem } from '@/features/states/PageProblem';
import { useOpenThing } from '@/features/things/open';
import { today } from '@/lib/dates';
import { loadState } from '@/lib/loading';
import { layout, radius, useTheme } from '@/theme';
import { AppBar } from '@/ui/AppBar';
import { Button } from '@/ui/Button';
import { EmptyState } from '@/ui/EmptyState';
import { Loading } from '@/ui/Loading';
import { Tap } from '@/ui/Motion';
import { Ring } from '@/ui/Ring';
import { RoundButton } from '@/ui/RoundButton';
import { Sk } from '@/ui/Skeleton';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

/** The picture in the ring of a goal that was given none. */
const TARGET = '🎯';

/**
 * 7.6 Goals: what the circle is working towards, each with a ring. The first one is drawn large, with what
 * has been saved and who chips in; the others are two to a row. A goal that reads its number from the
 * sister app says so with a small route. The + starts a new one.
 */
export default function Goals() {
  const { colors } = useTheme();
  const router = useRouter();
  const circle = useCircle();
  const says = words.plan.goals;
  const asked = useGetGoals(circle.id, { day: today() });
  const load = loadState(asked);
  const goals = asked.data;
  const [big, ...rest] = goals ?? [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar title={says.title} trailing={<RoundButton label={says.add} icon={(c) => <Plus size={20} color={c} />} onPress={() => router.push('/new/goal')} />} />
      {load.error ? (
        <PageProblem error={load.error} onRetry={load.retry} retrying={load.retrying} inset={false} />
      ) : !goals ? (
        load.offline ? (
          <Loading offline />
        ) : (
          <View accessibilityLabel={words.states.loading} style={{ gap: 12, marginTop: 6, paddingHorizontal: layout.barGutter }}>
            <Sk height={148} radius="panel" />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Sk height={132} radius="cardLarge" style={{ flex: 1 }} />
              <Sk height={132} radius="cardLarge" style={{ flex: 1 }} />
            </View>
          </View>
        )
      ) : !big ? (
        <View style={{ flex: 1, justifyContent: 'center', paddingBottom: 60 }}>
          <EmptyState emoji={TARGET} title={says.empty.title} body={says.empty.body} action={<Button label={says.empty.action} onPress={() => router.push('/new/goal')} />} />
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }} refreshControl={<RefreshControl refreshing={asked.isRefetching} onRefresh={() => void asked.refetch()} tintColor={colors.muted} />}>
          <Big goal={big} />
          <View style={{ gap: 10, marginTop: 12, marginHorizontal: layout.barGutter }}>
            {/* Two to a row; an odd one out keeps its half. */}
            {rest.flatMap((goal, index) =>
              index % 2 === 0
                ? [
                    <View key={goal.id} style={{ flexDirection: 'row', alignItems: 'stretch', gap: 10 }}>
                      <Small goal={goal} />
                      {rest[index + 1] ? <Small goal={rest[index + 1]!} /> : <View style={{ flex: 1 }} />}
                    </View>,
                  ]
                : [],
            )}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

/** The first goal, large: its ring with the number in it, its name, where it stands, and who chips in. */
function Big({ goal }: { goal: GoalRowResponse }) {
  const { colors, shadow } = useTheme();
  const open = useOpenThing();
  // The word under the number says what is counted, which only the goal itself knows. It is the next screen's
  // answer too, so asking here costs nothing twice.
  const whole = useGetGoal(goal.id, { day: today() }).data;
  const counts = whole ? kindOfGoal(whole) : null;
  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel={words.plan.goals.spoken(goal.title, goal.percent, goal.line)}
      onPress={() => open({ kind: 'goal', id: goal.id })}
      scaleTo={0.985}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 18, marginTop: 6, marginHorizontal: layout.barGutter, padding: 18, borderRadius: radius.panel, backgroundColor: colors.surface, boxShadow: shadow.md }}>
      <BigRing percent={goal.percent} under={counts === 'money' ? words.plan.goals.ring.money : counts ? words.plan.goals.ring.count : null} />
      <View style={{ flex: 1 }}>
        <Txt variant="titleSmall" numberOfLines={2}>
          {goal.title}
        </Txt>
        <Txt variant="caption" weight={500} color="muted" numberOfLines={3} style={{ marginTop: 2 }}>
          {goal.line}
        </Txt>
        {goal.cheer ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 }}>
            <Faces people={goal.people} />
            <Txt variant="footnote" weight={700} numberOfLines={2} style={{ flexShrink: 1 }}>
              {goal.cheer}
            </Txt>
          </View>
        ) : null}
      </View>
    </Tap>
  );
}

/** One of the other goals: a ring around its picture, its name, and a line on where it stands. */
function Small({ goal }: { goal: GoalRowResponse }) {
  const { colors, shadow } = useTheme();
  const open = useOpenThing();
  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel={words.plan.goals.spoken(goal.title, goal.percent, goal.line)}
      onPress={() => open({ kind: 'goal', id: goal.id })}
      scaleTo={0.97}
      style={{ flex: 1, gap: 2, padding: 14, borderRadius: radius.cardLarge, backgroundColor: colors.surface, boxShadow: shadow.sm }}>
      <View style={{ marginBottom: 10 }}>
        <Ring progress={goal.percent / 100} emoji={goal.emoji || TARGET} />
      </View>
      <Txt variant="item" weight={800} numberOfLines={2}>
        {goal.title}
      </Txt>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 5 }}>
        {goal.source === 'journey' ? <Route size={13} color={colors.muted} style={{ marginTop: 2 }} /> : null}
        <Txt variant="footnote" color="muted" numberOfLines={2} style={{ flexShrink: 1 }}>
          {goal.line}
        </Txt>
      </View>
    </Tap>
  );
}

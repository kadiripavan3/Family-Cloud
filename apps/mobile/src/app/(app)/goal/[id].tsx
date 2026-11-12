import { useMutation } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams } from 'expo-router';
import { ArrowLeft, ChevronLeft, ChevronRight, Ellipsis, ListChecks, Pencil, Route, Share, Table, Trash2, Users } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCache } from '@/api/cache';
import { messageFor } from '@/api/fetcher';
import { addGoalEntry, deleteThing, type EntryResponse, type GoalResponse, removeGoalEntry, useGetGoal } from '@/api/generated/homeport';
import { useLeave } from '@/features/navigation/useLeave';
import { AddMoneySheet } from '@/features/plan/AddMoneySheet';
import { BigRing } from '@/features/plan/BigRing';
import { Faces } from '@/features/plan/Faces';
import { GoalChangeSheet } from '@/features/plan/GoalChangeSheet';
import { kindOfGoal } from '@/features/plan/goalDraft';
import { useNotice } from '@/features/plan/Notice';
import { AudienceChip } from '@/features/sharing/AudienceChip';
import { AudienceSheet } from '@/features/sharing/AudienceSheet';
import { PageProblem } from '@/features/states/PageProblem';
import { useOpenThing } from '@/features/things/open';
import { formatDay, fromISODate, today } from '@/lib/dates';
import { loadState } from '@/lib/loading';
import { newClientId } from '@/lib/ids';
import { shareText } from '@/lib/share';
import { darkTheme, layout, radius, useTheme, withAlpha } from '@/theme';
import { Avatar } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { ConfirmSheet } from '@/ui/ConfirmSheet';
import { Emoji } from '@/ui/Emoji';
import { GlassBar } from '@/ui/GlassBar';
import { LightStatusBar } from '@/ui/LightStatusBar';
import { Loading } from '@/ui/Loading';
import { Tap } from '@/ui/Motion';
import { Photo } from '@/ui/Photo';
import { RoundButton } from '@/ui/RoundButton';
import { Sheet, SheetRow } from '@/ui/Sheet';
import { HeroSkeleton } from '@/ui/Skeleton';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

/** How tall the picture at the top is. */
const HERO = 300;

/**
 * 7.7 A goal: its picture and name, the ring with the numbers and the API's sentence on the pace, who chips
 * in, what was put in during each month, the last few times something was put in, and where the number is
 * read from when it isn't typed. The bar at the bottom says what is left and adds to it: money, one more,
 * or the list of steps. The three dots change and delete it; Share hands its line to a message.
 */
export default function GoalPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const leave = useLeave();
  /** The year whose twelve months show. Null: this year. */
  const [year, setYear] = useState<number | null>(null);
  const asked = useGetGoal(id, { day: today(), ...(year ? { year } : {}) }, { query: { placeholderData: (old) => old } });
  const load = loadState(asked);
  const goal = asked.data;

  if (!goal || load.error) {
    // Not here yet, or not at all: the way back stays, on the page's own colours.
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        {load.error ? (
          <View style={{ flex: 1, paddingTop: insets.top + 56 }}>
            <PageProblem error={load.error} onRetry={load.retry} retrying={load.retrying} />
          </View>
        ) : load.offline ? (
          <Loading offline />
        ) : (
          <HeroSkeleton photo={HERO} />
        )}
        <View style={{ position: 'absolute', top: insets.top + 8, left: layout.barGutter }}>
          <RoundButton label={words.common.back} onPress={leave} icon={(c) => <ArrowLeft size={20} color={c} />} />
        </View>
      </View>
    );
  }
  return <Loaded goal={goal} onYear={setYear} />;
}

function Loaded({ goal, onYear }: { goal: GoalResponse; onYear: (year: number) => void }) {
  const { colors, shadow } = useTheme();
  const insets = useSafeAreaInsets();
  const leave = useLeave();
  const cache = useCache();
  const open = useOpenThing();
  const says = words.plan.goal;
  const [say, notice] = useNotice();
  const [sheet, setSheet] = useState<'menu' | 'change' | 'delete' | 'money' | 'audience' | null>(null);
  /** The line of what was put in that is about to be taken back. */
  const [taking, setTaking] = useState<EntryResponse | null>(null);
  const close = () => setSheet(null);
  const counts = kindOfGoal(goal);
  const title = goal.title.trim() || words.things.untitled;
  const clientId = useRef(newClientId());

  const remove = useMutation({
    mutationFn: () => deleteThing(goal.id),
    onSuccess: () => {
      close();
      leave();
      void cache.thingDeleted(goal);
    },
  });
  const addOne = useMutation({
    mutationFn: () => addGoalEntry(goal.id, { clientId: clientId.current, amount: 1, day: today() }),
    onSuccess: () => {
      // The next one is another one.
      clientId.current = newClientId();
      return cache.goalMoved(goal);
    },
    onError: (error) => say(messageFor(error)),
  });
  const takeBack = useMutation({
    mutationFn: (entry: EntryResponse) => removeGoalEntry(entry.id),
    onSuccess: () => {
      setTaking(null);
      void cache.goalMoved(goal);
    },
  });

  const share = async () => {
    const how = await shareText(words.plan.event.shared([title, goal.line]));
    if (how !== 'shared') say(how === 'copied' ? says.copied : says.notCopied);
  };
  const act = () => {
    if (counts === 'money') setSheet('money');
    else if (counts === 'steps') {
      if (goal.steps) open({ kind: 'checklist', id: goal.steps.listId });
    } else addOne.mutate();
  };

  const most = Math.max(...goal.months, 0);
  const thisYear = fromISODate(today()).getFullYear();
  const firstYear = fromISODate(goal.startDay).getFullYear();
  const Source = goal.source?.kind === 'journey' ? Route : Table;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <LightStatusBar />
      <ScrollView contentContainerStyle={{ paddingBottom: 130 + insets.bottom }} showsVerticalScrollIndicator={false}>
        <Photo uri={goal.coverUrl} radius="none" style={{ height: HERO, backgroundColor: darkTheme.colors.surface }} label={goal.coverUrl ? says.cover(title) : undefined}>
          {goal.coverUrl ? null : (
            <View style={{ position: 'absolute', top: insets.top + 64, right: 28, opacity: 0.9 }}>
              <Emoji char={goal.emoji || '🎯'} size={84} />
            </View>
          )}
          <LinearGradient
            colors={[withAlpha(colors.black, 0.4), withAlpha(colors.black, 0), withAlpha(colors.black, 0), withAlpha(colors.black, 0.74)]}
            locations={[0, 0.32, 0.42, 1]}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          />
          <View style={{ position: 'absolute', left: 20, right: 20, bottom: 54 }}>
            <View style={{ alignSelf: 'flex-start', paddingVertical: 4, paddingHorizontal: 10, borderRadius: radius.chip, backgroundColor: colors.accent }}>
              <Txt variant="label" numberOfLines={1} style={{ color: colors.onAccent }}>
                {says.label(goal.pace.reached ? null : goal.byLabel)}
              </Txt>
            </View>
            <Txt variant="heading" accessibilityRole="header" numberOfLines={2} style={{ marginTop: 8, marginBottom: 2, color: colors.onPhoto }}>
              {title}
            </Txt>
            {goal.blurb ? (
              <Txt variant="note" weight={600} numberOfLines={2} style={{ color: colors.onPhoto, opacity: 0.9 }}>
                {goal.blurb}
              </Txt>
            ) : null}
          </View>
        </Photo>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18, marginTop: -36, marginHorizontal: layout.barGutter, padding: 18, borderRadius: radius.panel, backgroundColor: colors.surface, boxShadow: shadow.md }}>
          <BigRing percent={goal.pace.percent} under={goal.currentLabel} />
          <View style={{ flex: 1 }}>
            <Txt variant="titleSmall">{goal.amountLine}</Txt>
            {goal.pace.paceLine ? (
              <Txt variant="caption" weight={500} color="muted" style={{ marginTop: 2 }}>
                {goal.pace.paceLine}
              </Txt>
            ) : null}
            {goal.cheer ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 }}>
                <Faces people={goal.people} most={4} />
                <Txt variant="footnote" weight={700} numberOfLines={2} style={{ flexShrink: 1 }}>
                  {goal.cheer}
                </Txt>
              </View>
            ) : null}
          </View>
        </View>

        <View style={{ marginTop: 18, marginHorizontal: layout.barGutter }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
            <Txt variant="subheading">{counts === 'money' ? says.months.money : says.months.count}</Txt>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {goal.year > firstYear ? (
                <Tap accessibilityRole="button" accessibilityLabel={words.dates.previousYear} hitSlop={12} onPress={() => onYear(goal.year - 1)}>
                  <ChevronLeft size={14} color={colors.muted} />
                </Tap>
              ) : null}
              <Txt variant="small" weight={500} color="muted">
                {goal.year}
              </Txt>
              {goal.year < thisYear ? (
                <Tap accessibilityRole="button" accessibilityLabel={words.dates.nextYear} hitSlop={12} onPress={() => onYear(goal.year + 1)}>
                  <ChevronRight size={14} color={colors.muted} />
                </Tap>
              ) : null}
            </View>
          </View>
          <View accessible accessibilityLabel={says.monthsSpoken(goal.year)} style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 64 }}>
            {goal.months.map((amount, month) => {
              // A month with nothing in it is a pale stub, so the row of twelve stays readable.
              const full = most > 0 && amount > 0;
              return <View key={month} style={{ flex: 1, height: full ? `${Math.max((amount / most) * 100, 8)}%` : '8%', borderTopLeftRadius: radius.chip, borderTopRightRadius: radius.chip, backgroundColor: full ? colors.accent : colors.fill2 }} />;
            })}
          </View>
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 5 }}>
            {says.monthLetters.map((letter, month) => (
              <Txt key={month} variant="micro" weight={700} color="muted" center accessible={false} style={{ flex: 1 }}>
                {letter}
              </Txt>
            ))}
          </View>
        </View>

        <View style={{ marginTop: 8 }}>
          {goal.recent.length === 0 && !goal.source && !goal.steps ? (
            <Txt variant="callout" color="muted" style={{ marginTop: 8, marginHorizontal: layout.rowGutter }}>
              {says.noRecent}
            </Txt>
          ) : null}
          {goal.recent.map((entry) => {
            const under = words.common.join([formatDay(entry.day), entry.note]);
            const content = (
              <>
                <Avatar uri={entry.by?.avatarUrl} name={entry.by?.name ?? ''} size={40} />
                <View style={{ flex: 1, gap: 3 }}>
                  <Txt variant="item" numberOfLines={1}>
                    {entry.line}
                  </Txt>
                  <Txt variant="footnote" color="muted" numberOfLines={1}>
                    {under}
                  </Txt>
                </View>
              </>
            );
            const frame = { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingVertical: 6, paddingHorizontal: layout.rowGutter } as const;
            return goal.canEdit ? (
              <Tap key={entry.id} accessibilityRole="button" accessibilityLabel={says.recentSpoken(entry.line, under)} onPress={() => setTaking(entry)} scaleTo={0.985} style={frame}>
                {content}
              </Tap>
            ) : (
              <View key={entry.id} style={frame}>
                {content}
              </View>
            );
          })}
          {goal.source ? (
            <Tap accessibilityRole="button" accessibilityLabel={words.common.spoken([goal.source.line, says.source.note])} onPress={() => say(goal.source?.kind === 'journey' ? says.source.journeySoon : says.source.sheetSoon)} scaleTo={0.985} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingVertical: 6, paddingHorizontal: layout.rowGutter }}>
              <View style={{ width: 40, height: 40, borderRadius: radius.thumb, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentSoft }}>
                <Source size={20} color={colors.accentText} />
              </View>
              <View style={{ flex: 1, gap: 3 }}>
                <Txt variant="item" numberOfLines={1}>
                  {goal.source.line}
                </Txt>
                <Txt variant="footnote" color="muted" numberOfLines={1}>
                  {says.source.note}
                </Txt>
              </View>
              <ChevronRight size={18} color={colors.muted} />
            </Tap>
          ) : null}
          {goal.steps ? (
            <Tap accessibilityRole="button" accessibilityLabel={words.common.spoken([goal.steps.title, says.steps.line(goal.steps.done, goal.steps.done + goal.steps.left)])} onPress={() => open({ kind: 'checklist', id: goal.steps?.listId })} scaleTo={0.985} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingVertical: 6, paddingHorizontal: layout.rowGutter }}>
              <View style={{ width: 40, height: 40, borderRadius: radius.thumb, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentSoft }}>
                <ListChecks size={20} color={colors.accentText} />
              </View>
              <View style={{ flex: 1, gap: 3 }}>
                <Txt variant="item" numberOfLines={1}>
                  {goal.steps.title}
                </Txt>
                <Txt variant="footnote" color="muted" numberOfLines={1}>
                  {says.steps.line(goal.steps.done, goal.steps.done + goal.steps.left)}
                </Txt>
              </View>
              <ChevronRight size={18} color={colors.muted} />
            </Tap>
          ) : null}
        </View>
      </ScrollView>

      <View style={{ position: 'absolute', top: insets.top + 8, left: layout.barGutter, right: layout.barGutter, flexDirection: 'row', justifyContent: 'space-between' }}>
        <RoundButton tone="photo" label={words.common.back} onPress={leave} icon={(c) => <ArrowLeft size={20} color={c} />} />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <RoundButton tone="photo" label={says.share} onPress={() => void share()} icon={(c) => <Share size={19} color={c} />} />
          <RoundButton tone="photo" label={says.more} onPress={() => setSheet('menu')} icon={(c) => <Ellipsis size={20} color={c} />} />
        </View>
      </View>

      <GlassBar radius="sheet" style={{ position: 'absolute', left: 12, right: 12, bottom: Math.max(insets.bottom, 12) + 8 }} contentStyle={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingLeft: 20, paddingRight: 10 }}>
        <View style={{ flex: 1 }}>
          <Txt variant="item" weight={800} numberOfLines={1}>
            {goal.pace.toGoLine}
          </Txt>
          {goal.pace.timeLine ? (
            <Txt variant="footnote" color="muted" numberOfLines={1}>
              {goal.pace.timeLine}
            </Txt>
          ) : null}
        </View>
        {goal.canEdit && (counts !== 'steps' || goal.steps) ? <Button label={says.add[counts]} inline loading={addOne.isPending} onPress={act} /> : null}
      </GlassBar>
      {notice}

      <Sheet visible={sheet === 'menu'} onClose={close} title={says.menu.title}>
        <SheetRow first icon={(c) => <Users size={20} color={c} />} label={says.menu.audience} trailing={<AudienceChip quiet thing={goal} />} onPress={() => setSheet('audience')} />
        {goal.canEdit ? <SheetRow icon={(c) => <Pencil size={20} color={c} />} label={says.menu.change} onPress={() => setSheet('change')} /> : null}
        {goal.mine ? <SheetRow danger icon={(c) => <Trash2 size={20} color={c} />} label={says.menu.delete} onPress={() => setSheet('delete')} /> : null}
      </Sheet>
      <AudienceSheet thingId={goal.id} visible={sheet === 'audience'} onClose={close} />
      <GoalChangeSheet goal={goal} visible={sheet === 'change'} onClose={close} />
      <AddMoneySheet goal={goal} visible={sheet === 'money'} onClose={close} />
      <ConfirmSheet visible={sheet === 'delete'} onClose={close} title={says.delete.title} body={says.delete.body} confirm={says.delete.confirm} onConfirm={() => remove.mutate()} busy={remove.isPending} problem={remove.isError ? messageFor(remove.error) : null} />
      <ConfirmSheet
        visible={!!taking}
        onClose={() => setTaking(null)}
        title={says.takeBack.title}
        body={taking ? says.takeBack.body(taking.line) : undefined}
        confirm={says.takeBack.confirm}
        onConfirm={() => (taking ? takeBack.mutate(taking) : undefined)}
        busy={takeBack.isPending}
        problem={takeBack.isError ? messageFor(takeBack.error) : null}
      />
    </View>
  );
}

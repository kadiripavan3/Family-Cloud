import { useMutation } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { Bell, Calendar, Ellipsis, MapPin, Paperclip, Pencil, Repeat, Star, Trash2, UserRound, Users } from 'lucide-react-native';
import { useState } from 'react';
import { Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useCache } from '@/api/cache';
import { messageFor } from '@/api/fetcher';
import { deleteThing, type ReminderResponse, useGetReminder } from '@/api/generated/homeport';
import { useLeave } from '@/features/navigation/useLeave';
import { useNotice } from '@/features/plan/Notice';
import { NoteMark } from '@/features/plan/PlanEntry';
import { ReminderChangeSheet } from '@/features/plan/ReminderChangeSheet';
import { dueLine } from '@/features/plan/reminderDraft';
import { Tick } from '@/features/plan/Tick';
import { useNudge } from '@/features/plan/useNudge';
import { useTick } from '@/features/plan/useTick';
import { AudienceChip } from '@/features/sharing/AudienceChip';
import { PageProblem } from '@/features/states/PageProblem';
import { formatWeekdayDay, today } from '@/lib/dates';
import { loadState } from '@/lib/loading';
import { layout, useTheme } from '@/theme';
import { AppBar } from '@/ui/AppBar';
import { Button } from '@/ui/Button';
import { ConfirmSheet } from '@/ui/ConfirmSheet';
import { GroupLabel } from '@/ui/Heading';
import { Loading } from '@/ui/Loading';
import { RoundButton } from '@/ui/RoundButton';
import { Row, RowGroup } from '@/ui/Rows';
import { Sheet, SheetRow } from '@/ui/Sheet';
import { ListSkeleton } from '@/ui/Skeleton';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

/**
 * A reminder, opened: what has to be done with its tick, when and how often, who has it (and whose turn it
 * is), who asked, the place it waits for, and what is attached. Whoever made it can nudge whoever has it,
 * change it and delete it. Not drawn as a screen of its own; it follows the event's and the list's.
 */
export default function ReminderPage() {
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const asked = useGetReminder(id, { day: today() });
  const load = loadState(asked);
  const reminder = asked.data;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      {load.error ? (
        <>
          <AppBar />
          <PageProblem error={load.error} onRetry={load.retry} retrying={load.retrying} inset={false} />
        </>
      ) : !reminder ? (
        <>
          <AppBar />
          {load.offline ? <Loading offline /> : <ListSkeleton count={4} />}
        </>
      ) : (
        <Loaded reminder={reminder} />
      )}
    </SafeAreaView>
  );
}

function Loaded({ reminder }: { reminder: ReminderResponse }) {
  const { colors } = useTheme();
  const cache = useCache();
  const leave = useLeave();
  const says = words.plan.reminder;
  const [say, notice] = useNotice();
  const ticks = useTick();
  const { nudge, nudgingId } = useNudge(say);
  const [sheet, setSheet] = useState<'menu' | 'change' | 'delete' | null>(null);
  const close = () => setSheet(null);
  const remove = useMutation({
    mutationFn: () => deleteThing(reminder.id),
    onSuccess: () => {
      close();
      leave();
      void cache.thingDeleted(reminder);
    },
  });

  // A tick is for the day it is due on; a tick that is there is taken away for the day it was given for.
  const tickDay = reminder.done ? (reminder.tickedDueOn ?? reminder.dueOn) : reminder.dueOn;
  const ticked = ticks.shown(reminder.id, tickDay, reminder.done);
  const nameOf = (person: { memberId?: string; name?: string } | null | undefined) => person?.name ?? '';
  const who = reminder.takesTurns && reminder.turn
    ? reminder.yours
      ? says.yourTurn(reminder.then ? nameOf(reminder.then) : null)
      : says.turn(nameOf(reminder.turn), reminder.then ? nameOf(reminder.then) : null)
    : reminder.givenTo.length
      ? words.common.join(reminder.givenTo.map(nameOf))
      : reminder.yours
        ? says.you
        : nameOf(reminder.askedBy);

  return (
    <>
      <AppBar
        trailing={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <AudienceChip thing={reminder} />
            {reminder.canEdit ? <RoundButton label={says.more} icon={(c) => <Ellipsis size={20} color={c} />} onPress={() => setSheet('menu')} /> : null}
          </View>
        }
      />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 14, marginTop: 6, paddingHorizontal: layout.rowGutter }}>
          <View style={{ marginTop: 5 }}>
            <Tick label={words.plan.entry.tick(reminder.title, reminder.dueOn ? formatWeekdayDay(reminder.dueOn) : words.plan.reminders.someTime)} done={ticked} onChange={reminder.canTick ? (next) => ticks.tick({ id: reminder.id, done: next, dueOn: tickDay }) : undefined} />
          </View>
          <View style={{ flex: 1 }}>
            <Txt variant="titleLarge" accessibilityRole="header" style={{ color: ticked ? colors.muted : colors.text, textDecorationLine: ticked ? 'line-through' : 'none' }}>
              {reminder.title}
            </Txt>
            {reminder.note ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 }}>
                <NoteMark icon={reminder.noteIcon} color={colors.muted} />
                <Txt variant="caption" weight={500} color="muted" style={{ flexShrink: 1 }}>
                  {reminder.note}
                </Txt>
              </View>
            ) : null}
          </View>
        </View>
        {ticks.problem ? (
          <Txt variant="caption" color="danger" accessibilityLiveRegion="polite" style={{ marginTop: 10, marginHorizontal: layout.gutter }}>
            {ticks.problem}
          </Txt>
        ) : null}

        <View style={{ marginTop: 20 }}>
          <RowGroup>
            <Row first icon={(c) => <Calendar size={18} color={c} />} label={says.when} note={dueLine(reminder.dueOn, reminder.dueTime)} />
            {reminder.repeat ? <Row icon={(c) => <Repeat size={18} color={c} />} label={says.repeats} note={reminder.repeat.label} /> : null}
            <Row icon={(c) => <Users size={18} color={c} />} label={says.who} note={words.common.join([who, reminder.takesTurns ? says.takesTurns : null])} />
            {reminder.askedBy && reminder.givenTo.length ? <Row icon={(c) => <UserRound size={18} color={c} />} label={says.askedBy} note={reminder.mine ? says.you : nameOf(reminder.askedBy)} /> : null}
            {reminder.place ? <Row icon={(c) => <MapPin size={18} color={c} />} label={says.near(reminder.place.words)} note={Platform.OS === 'web' ? says.placeNote.browser : says.placeNote.phone} /> : null}
            {reminder.dueOn ? <Row icon={(c) => <Bell size={18} color={c} />} label={says.remind} note={words.plan.remind.before(reminder.remindMinutes)} /> : null}
            {reminder.attached.length ? <Row icon={(c) => <Paperclip size={18} color={c} />} label={says.attached} note={words.common.join(reminder.attached)} /> : null}
            {reminder.stars > 0 ? <Row icon={(c) => <Star size={18} color={c} />} label={says.stars(reminder.stars)} /> : null}
          </RowGroup>
        </View>
        {reminder.notes ? (
          <View style={{ paddingHorizontal: layout.gutter }}>
            <GroupLabel style={{ marginHorizontal: 0 }}>{says.notes}</GroupLabel>
            <Txt variant="body">{reminder.notes}</Txt>
          </View>
        ) : null}
        {reminder.canNudge ? (
          <View style={{ marginTop: 20, paddingHorizontal: layout.barGutter }}>
            <Button label={says.nudge} spoken={words.plan.reminders.nudgeSpoken(words.common.join(reminder.givenTo.map(nameOf)), reminder.title)} variant="soft" size="lg" block icon={(c) => <Bell size={18} color={c} />} loading={nudgingId === reminder.id} onPress={() => nudge(reminder)} />
          </View>
        ) : null}
      </ScrollView>
      {notice}

      <Sheet visible={sheet === 'menu'} onClose={close} title={says.menu.title}>
        <SheetRow first icon={(c) => <Pencil size={20} color={c} />} label={says.menu.change} onPress={() => setSheet('change')} />
        {reminder.mine ? <SheetRow danger icon={(c) => <Trash2 size={20} color={c} />} label={says.menu.delete} onPress={() => setSheet('delete')} /> : null}
      </Sheet>
      <ReminderChangeSheet reminder={reminder} visible={sheet === 'change'} onClose={close} />
      <ConfirmSheet visible={sheet === 'delete'} onClose={close} title={says.delete.title} body={says.delete.body} confirm={says.delete.confirm} onConfirm={() => remove.mutate()} busy={remove.isPending} problem={remove.isError ? messageFor(remove.error) : null} />
    </>
  );
}

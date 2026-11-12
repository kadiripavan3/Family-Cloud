import { useMutation } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { Bell, Calendar, ChevronRight, Ellipsis, Eye, EyeOff, FileText, Lock, type LucideIcon, Pencil, TextCursorInput, Trash2, TriangleAlert, Users } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCache } from '@/api/cache';
import { messageFor } from '@/api/fetcher';
import { changeDocument, createReminder, deleteThing, type DocumentResponse, type Fact, linkThings, type ThingBrief, useGetDocument } from '@/api/generated/homeport';
import { useCircleIfAny, useCircles } from '@/features/circles/current';
import { keyDateWords } from '@/features/library/DocRow';
import { Paper } from '@/features/library/Paper';
import { openFile } from '@/features/library/save';
import { useToast } from '@/features/library/Toast';
import { useLeave } from '@/features/navigation/useLeave';
import { AudienceSheet } from '@/features/sharing/AudienceSheet';
import { NotFound } from '@/features/states/NotFound';
import { PageProblem } from '@/features/states/PageProblem';
import { kindOf } from '@/features/things/kinds';
import { looksLikeId, useOpenThing } from '@/features/things/open';
import { formatDayLong, today } from '@/lib/dates';
import { newClientId } from '@/lib/ids';
import { loadState } from '@/lib/loading';
import { firstName } from '@/lib/names';
import { layout, useTheme } from '@/theme';
import { AppBar } from '@/ui/AppBar';
import { Button } from '@/ui/Button';
import { ConfirmSheet } from '@/ui/ConfirmSheet';
import { Field } from '@/ui/Field';
import { GroupLabel } from '@/ui/Heading';
import { Loading } from '@/ui/Loading';
import { Tap } from '@/ui/Motion';
import { NoteBox } from '@/ui/NoteBox';
import { RoundButton } from '@/ui/RoundButton';
import { Row, RowGroup } from '@/ui/Rows';
import { Sheet, SheetRow } from '@/ui/Sheet';
import { Sk } from '@/ui/Skeleton';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

const says = words.library.document;
type Open = 'menu' | 'audience' | 'rename' | 'words' | 'delete' | null;

/** A fact kept out of sight until asked for, as it stands in its row: "•••••• 2C3". */
function masked(text: string): string {
  return `${'•'.repeat(6)} ${text.slice(-3)}`;
}

/**
 * 6.8 A document: the card its scan became. What was read from its words (a passport's number stays out of
 * sight until its eye is pressed), the day that matters and a day to be reminded on, and what it is linked
 * to. "Remind me" makes the reminder in Plan and links it, after which the page says a reminder is set.
 * The words themselves are read on a phone while it scans; here they are typed or pasted.
 */
export default function Document() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const leave = useLeave();
  const cache = useCache();
  const circles = useCircles();
  const current = useCircleIfAny();
  const isThing = looksLikeId(id);
  const [open, setOpen] = useState<Open>(null);
  // The labels of the facts that are being shown although they are kept out of sight.
  const [shown, setShown] = useState<string[]>([]);
  const { say, toast } = useToast(insets.bottom + 32);
  const draft = useRef(newClientId());

  const day = today();
  const asked = useGetDocument(id, { day }, { query: { enabled: isThing } });
  const load = loadState(asked);
  const data = asked.data;
  const document = data?.document;
  const kept = { id, circleId: document?.circleId ?? '' };

  const remind = useMutation({
    mutationFn: async (from: DocumentResponse) => {
      const reminder = await createReminder({
        clientId: draft.current,
        circleId: kept.circleId,
        title: says.reminderTitle(from.document.title ?? '', keyDateWords(from.document) ?? ''),
        dueOn: from.remindOn ?? undefined,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        about: (from.document.about ?? []).flatMap((person) => (person.memberId ? [person.memberId] : [])),
      });
      await linkThings(id, reminder.id);
      return from.remindOn;
    },
    onSuccess: async (on) => {
      draft.current = newClientId();
      if (on) say(says.reminded(formatDayLong(on)));
      await cache.documentReminded(kept);
    },
    onError: (error) => say(messageFor(error)),
  });
  const remove = useMutation({
    mutationFn: () => deleteThing(id),
    onSuccess: async () => {
      setOpen(null);
      leave();
      await cache.thingDeleted(kept);
    },
  });

  if (!isThing) return <NotFound />;
  const bar = <AppBar title={document?.title ?? ''} trailing={document ? <RoundButton label={words.library.more} onPress={() => setOpen('menu')} icon={(c) => <Ellipsis size={20} color={c} />} /> : <View style={{ width: 40 }} />} />;

  if (load.error || !data || !document) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
        {bar}
        {load.error ? (
          <PageProblem error={load.error} onRetry={load.retry} retrying={load.retrying} />
        ) : load.offline ? (
          <Loading offline />
        ) : (
          <View accessibilityLabel={words.states.loading} style={{ gap: 16, paddingTop: 4, paddingHorizontal: layout.barGutter }}>
            <Sk height={196} radius="field" style={{ marginHorizontal: 10 }} />
            <Sk height={72} radius="photo" />
            <Sk height={160} radius="card" />
          </View>
        )}
      </SafeAreaView>
    );
  }

  const key = document.keyDate;
  const clash = data.clash;
  const urgent = !!clash || !!key?.soon || (key?.daysLeft ?? 0) < 0;
  const reminder = data.linked.find((thing) => thing.kind === 'reminder');
  const others = data.linked.filter((thing) => thing.kind !== 'reminder');
  const about = keyDateWords(document);
  const circle = circles.find((one) => one.id === document.circleId) ?? current;
  const reminderWords = document.reminderSet ? (reminder?.glance ? says.reminderSetFor(reminder.glance) : says.reminderSet) : data.remindOn ? says.remindOn(formatDayLong(data.remindOn)) : null;
  const toggle = (label: string) => setShown((now) => (now.includes(label) ? now.filter((one) => one !== label) : [...now, label]));

  const fact = (one: Fact, index: number) => {
    const label = one.label ?? '';
    const text = one.text ?? '';
    const open = shown.includes(label);
    // The day that matters is drawn in the warning colour once it is time to act on it.
    const warn = urgent && !!one.date && one.date === key?.date;
    return (
      <Row
        key={label || index}
        first={index === 0}
        label={label}
        value={warn ? undefined : one.secret && !open ? masked(text) : text}
        trailing={
          warn ? (
            <Txt variant="callout" weight={700} style={{ color: colors.warn }}>
              {text}
            </Txt>
          ) : one.secret ? (
            <Tap accessibilityRole="button" accessibilityLabel={open ? says.hide(label) : says.show(label)} hitSlop={13} onPress={() => toggle(label)} scaleTo={0.9}>
              {open ? <EyeOff size={18} color={colors.muted} /> : <Eye size={18} color={colors.muted} />}
            </Tap>
          ) : undefined
        }
      />
    );
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      {bar}
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 48 }} showsVerticalScrollIndicator={false}>
        <Paper data={data} />

        {clash || about ? (
          <NoteBox
            tone={urgent ? 'warn' : 'plain'}
            icon={(c) => (urgent ? <TriangleAlert size={20} color={c} /> : <Bell size={20} color={c} />)}
            title={clash ? says.clash(clash.monthsLeftAfter ?? 0, clash.trip?.title ?? '') : (about ?? undefined)}
            trailing={
              !document.reminderSet && data.remindOn ? <Button label={says.remind} size="sm" variant="soft" inline loading={remind.isPending} onPress={() => remind.mutate(data)} style={{ backgroundColor: colors.bg }} /> : undefined
            }
            style={{ marginHorizontal: layout.barGutter }}>
            {says.note(!!clash, reminderWords)}
          </NoteBox>
        ) : null}

        <GroupLabel style={{ marginHorizontal: layout.gutter }}>{says.read}</GroupLabel>
        {data.facts.length > 0 ? (
          <RowGroup>{data.facts.map(fact)}</RowGroup>
        ) : (
          <View style={{ gap: 12, marginHorizontal: layout.gutter }}>
            <Txt variant="bodySmall" color="muted">
              {data.hasText ? says.nothingRead : says.noWords}
            </Txt>
            {document.canEdit ? <Button label={says.addWords} variant="line" size="sm" onPress={() => setOpen('words')} /> : null}
          </View>
        )}

        {others.length > 0 ? (
          <View style={{ marginTop: 16 }}>
            <RowGroup>
              {others.map((thing, index) => (
                <Linked key={thing.id ?? index} thing={thing} first={index === 0} everyone={circle ? words.kinds[circle.kind].everyone(circle.name) : ''} myMemberId={circle?.myMemberId} />
              ))}
            </RowGroup>
          </View>
        ) : null}
      </ScrollView>
      {toast}

      <Sheet visible={open === 'menu'} onClose={() => setOpen(null)} title={document.title ?? ''}>
        <SheetRow
          first
          icon={(c) => <FileText size={22} color={c} />}
          label={says.menu.open}
          onPress={() => {
            setOpen(null);
            void openFile(document.fileUrl ?? '');
          }}
        />
        <SheetRow icon={(c) => <Users size={22} color={c} />} label={says.menu.who} onPress={() => setOpen('audience')} />
        {document.canEdit ? <SheetRow icon={(c) => <Pencil size={22} color={c} />} label={says.menu.rename} onPress={() => setOpen('rename')} /> : null}
        {document.canEdit ? <SheetRow icon={(c) => <TextCursorInput size={22} color={c} />} label={says.menu.words} onPress={() => setOpen('words')} /> : null}
        {document.mine ? <SheetRow danger icon={(c) => <Trash2 size={22} color={c} />} label={says.menu.delete} onPress={() => setOpen('delete')} /> : null}
      </Sheet>
      <AudienceSheet thingId={id} visible={open === 'audience'} onClose={() => setOpen(null)} />
      <ChangeSheet kind="rename" document={kept} start={document.title ?? ''} visible={open === 'rename'} onClose={() => setOpen(null)} />
      <ChangeSheet kind="words" document={kept} start="" visible={open === 'words'} onClose={() => setOpen(null)} />
      <ConfirmSheet
        visible={open === 'delete'}
        onClose={() => setOpen(null)}
        title={says.deleteAsk.title}
        body={says.deleteAsk.body}
        confirm={says.deleteAsk.confirm}
        busy={remove.isPending}
        problem={remove.isError ? messageFor(remove.error) : null}
        onConfirm={() => remove.mutate()}
      />
    </SafeAreaView>
  );
}

/**
 * Something the document is linked to, as a row that opens it: its entry in the Vault with who may open
 * it, the trip it is needed for with its days, or anything else by its own name.
 */
function Linked({ thing, first, everyone, myMemberId }: { thing: ThingBrief; first: boolean; everyone: string; myMemberId?: string }) {
  const { colors } = useTheme();
  const open = useOpenThing();
  const vault = thing.kind === 'vault_item';
  const Icon: LucideIcon = vault ? Lock : thing.kind === 'event' ? Calendar : kindOf(thing.kind).icon;
  const title = thing.title?.trim() || words.things.untitled;
  const chip = thing.chip ?? {};
  const people = (chip.people ?? []).filter((person) => person.memberId !== myMemberId).map((person) => firstName(person.name));
  const label = vault ? says.inVault : thing.kind === 'event' ? says.neededFor(title) : title;
  const line = vault ? (chip.audience === 'circle' ? says.canOpen.circle(everyone) : chip.audience === 'some' && people.length ? says.canOpen.some(words.sharing.chip.some(people)) : says.canOpen.me) : (thing.glance ?? kindOf(thing.kind).name);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={words.common.spoken([label, line])}
      onPress={() => open(thing)}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 54, paddingVertical: 14, paddingHorizontal: 16, borderTopWidth: first ? 0 : 1, borderTopColor: colors.line, backgroundColor: pressed ? colors.fill : 'transparent' })}>
      <Icon size={22} color={colors.text} />
      <View style={{ flex: 1, gap: 1 }}>
        <Txt variant="item" weight={600} numberOfLines={1}>
          {label}
        </Txt>
        <Txt variant="footnote" color="muted" numberOfLines={2}>
          {line}
        </Txt>
      </View>
      <ChevronRight size={18} color={colors.muted} />
    </Pressable>
  );
}

type ChangeProps = { kind: 'rename' | 'words'; document: { id: string; circleId: string }; start: string; visible: boolean; onClose: () => void };

/** Renaming a document, or sending the words inside it: one box and Save. New words are read again for their dates. */
function ChangeSheet(props: ChangeProps) {
  // What is typed starts afresh each time the sheet opens.
  return <Changing key={`${props.kind}-${props.visible}`} {...props} />;
}

function Changing({ kind, document, start, visible, onClose }: ChangeProps) {
  const cache = useCache();
  const [text, setText] = useState(start);
  const said = kind === 'rename' ? says.rename : says.words;
  const save = useMutation({
    mutationFn: () => changeDocument(document.id, kind === 'rename' ? { title: text.trim() } : { text }, { day: today() }),
    onSuccess: async () => {
      await cache.documentChanged(document);
      onClose();
    },
  });
  return (
    <Sheet visible={visible} onClose={onClose} title={said.title}>
      <View style={{ gap: 12, paddingHorizontal: layout.rowGutter, paddingTop: 4 }}>
        <Field
          label={said.field}
          value={text}
          onChangeText={setText}
          maxLength={kind === 'rename' ? 200 : 200000}
          multiline={kind === 'words'}
          placeholder={kind === 'words' ? says.words.placeholder : undefined}
          autoFocus
          error={save.isError ? messageFor(save.error) : null}
        />
        <Button label={said.save} size="lg" block loading={save.isPending} disabled={!text.trim()} onPress={() => save.mutate()} />
      </View>
    </Sheet>
  );
}

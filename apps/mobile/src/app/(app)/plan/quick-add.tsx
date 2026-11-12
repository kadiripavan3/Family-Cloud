import { useMutation } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useCache } from '@/api/cache';
import { messageFor } from '@/api/fetcher';
import { useCircle } from '@/features/circles/current';
import { membersOf } from '@/features/circles/members';
import { useLeave } from '@/features/navigation/useLeave';
import { useUnsaved } from '@/features/navigation/useUnsaved';
import { fileLine } from '@/features/plan/fileLine';
import { PeopleSheet } from '@/features/plan/PeopleSheet';
import { PickRow } from '@/features/plan/PickRow';
import { type Fixes, fixOf, type Piece, readOf } from '@/features/plan/reading';
import { ReadingCard } from '@/features/plan/ReadingCard';
import { RemindSheet } from '@/features/plan/RemindSheet';
import { RepeatSheet } from '@/features/plan/RepeatSheet';
import { useReading } from '@/features/plan/useReading';
import { WhenSheet } from '@/features/plan/WhenSheet';
import { useStartsAs } from '@/features/sharing/useStartsAs';
import { newClientId } from '@/lib/ids';
import { layout, useTheme } from '@/theme';
import { AppBar } from '@/ui/AppBar';
import { AvoidKeyboard } from '@/ui/AvoidKeyboard';
import { Button } from '@/ui/Button';
import { ConfirmSheet } from '@/ui/ConfirmSheet';
import { Field } from '@/ui/Field';
import { GrowingInput } from '@/ui/GrowingInput';
import { Sheet } from '@/ui/Sheet';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

/** What something with a day can be read as: the two the person may switch between. */
const EITHER = ['event', 'reminder'] as const;

/**
 * 7.4 Type it: no form to fill in. Write it the way you'd say it; a moment after the last key the line is
 * read, and the reading shows under it piece by piece: what it is, the day and the time, who it is for, a
 * reminder ahead of it, how often it comes round, the place the last one like it was at. Each piece can be
 * corrected by pressing it. Add files it. The + sheet's "Type it" line opens this, and so does the line on
 * top of the forms for a new event and a new reminder.
 */
export default function QuickAdd() {
  const { colors } = useTheme();
  const cache = useCache();
  const leave = useLeave();
  const circle = useCircle();
  const says = words.plan.quick;
  const members = membersOf(circle);
  const [audience] = useStartsAs(circle);
  const [text, setText] = useState('');
  /** What the person corrected, by the part of the line it belongs to. */
  const [fixes, setFixes] = useState<Record<number, Fixes>>({});
  /** The piece whose correction is open. */
  const [fixing, setFixing] = useState<{ part: number; piece: Piece } | null>(null);
  const { reading, settled, error } = useReading(circle.id, text);
  const unsaved = useUnsaved(text.trim().length > 0);

  const items = reading?.letter ? [] : (reading?.items ?? []);
  const reads = items.map((item, index) => readOf(item, fixes[index]));
  const addable = !!reading && settled && (reading.letter || reads.some((read) => read.as !== 'code'));

  // One id for the line and one for each part, the same on a second try and new when the line changes.
  const ids = useRef(new Map<string, string>());
  const idOf = (part: number | 'line') => {
    const key = `${part} ${text.trim()} ${JSON.stringify(fixes)}`;
    if (!ids.current.has(key)) ids.current.set(key, newClientId());
    return ids.current.get(key)!;
  };
  const add = useMutation({
    mutationFn: () => fileLine({ circleId: circle.id, text, reading: reading!, reads, members, audience: audience === circle.startsAs ? undefined : audience, idOf }),
    onSuccess: () => {
      void cache.planLineFiled(circle.id);
      unsaved.release();
      leave();
    },
  });

  const part = fixing ? items[fixing.part] : undefined;
  const read = fixing ? reads[fixing.part] : undefined;
  const close = () => setFixing(null);
  const fix = <K extends Piece>(piece: K, now: NonNullable<Fixes[K]>['now']) => {
    if (!fixing || !part) return;
    setFixes((old) => ({ ...old, [fixing.part]: fixOf(part, old[fixing.part], piece, now) }));
  };
  const open = (piece: Piece) => (fixing?.piece === piece ? part && read : undefined);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <AvoidKeyboard style={{ flex: 1 }}>
        <AppBar leading="close" title={says.title} trailing={<Button label={says.add} size="sm" inline disabled={!addable} loading={add.isPending} onPress={() => add.mutate()} />} />
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 16, paddingTop: 6, paddingBottom: 32 }}>
          <GrowingInput label={says.field} variant="bodyLarge" value={text} onChangeText={setText} placeholder={says.placeholder} autoFocus maxLength={2000} minHeight={50} style={{ marginTop: 2, marginHorizontal: layout.barGutter }} />
          {text.trim().length === 0 ? (
            <Txt variant="callout" color="muted" style={{ marginHorizontal: layout.barGutter }}>
              {says.hint}
            </Txt>
          ) : error ? (
            <Txt variant="caption" color="danger" accessibilityLiveRegion="polite" style={{ marginHorizontal: layout.barGutter }}>
              {messageFor(error)}
            </Txt>
          ) : !reading ? (
            <Txt variant="footnote" weight={600} color="muted" accessibilityLiveRegion="polite" style={{ marginHorizontal: layout.barGutter }}>
              {says.reading}
            </Txt>
          ) : reading.letter ? (
            <Txt variant="callout" color="muted" style={{ marginHorizontal: layout.barGutter }}>
              {says.letter}
            </Txt>
          ) : (
            items.map((item, index) => <ReadingCard key={index} circle={circle} item={item} read={reads[index]!} onFix={(piece) => setFixing({ part: index, piece })} />)
          )}
          {add.isError ? (
            <Txt variant="caption" color="danger" accessibilityLiveRegion="polite" style={{ marginHorizontal: layout.barGutter }}>
              {messageFor(add.error)}
            </Txt>
          ) : null}
        </ScrollView>
      </AvoidKeyboard>

      <WhenSheet visible={!!open('when')} onClose={close} kind={read?.as === 'reminder' ? 'reminder' : 'event'} value={read?.when ?? { day: null, time: null, endTime: null }} onChange={(when) => fix('when', when)} />
      <PeopleSheet
        visible={!!open('person')}
        onClose={close}
        single
        title={says.whoTitle}
        // A job can't be given to a pet.
        members={read?.as === 'reminder' && read.personRole !== 'about' && read.personRole !== 'for' ? members.filter((one) => one.kind !== 'pet') : members}
        value={read?.personId ? [read.personId] : []}
        onChange={(picked) => fix('person', picked[0] ?? null)}
      />
      <RemindSheet visible={!!open('remind')} onClose={close} allowNone value={read?.remindMinutes ?? null} onChange={(minutes) => fix('remind', minutes)} />
      <RepeatSheet visible={!!open('repeat')} onClose={close} value={read?.repeat ?? null} day={read?.when.day} onChange={(repeat) => fix('repeat', repeat)} />
      <Sheet visible={!!open('place')} onClose={close} title={says.placeTitle}>
        <Where
          value={read?.place ?? ''}
          onDone={(place) => {
            fix('place', place);
            close();
          }}
        />
      </Sheet>
      <Sheet visible={!!open('as')} onClose={close} title={says.asTitle}>
        {EITHER.map((as, index) => (
          <PickRow
            key={as}
            first={index === 0}
            label={says.asChoices[as].label}
            note={says.asChoices[as].note}
            chosen={read?.as === as}
            onPress={() => {
              fix('as', as);
              close();
            }}
          />
        ))}
      </Sheet>
      <ConfirmSheet visible={unsaved.asking} onClose={unsaved.stay} title={says.discard.title} body={says.discard.body} confirm={says.discard.confirm} cancel={says.discard.keep} onConfirm={unsaved.leave} />
    </SafeAreaView>
  );
}

/** Where an event is: the place that was suggested, in a box to change it, and a way to say "nowhere in particular". */
function Where({ value, onDone }: { value: string; onDone: (place: string | null) => void }) {
  const says = words.plan.quick;
  const [typed, setTyped] = useState(value);
  return (
    <View style={{ gap: 12, paddingTop: 6, paddingHorizontal: layout.barGutter }}>
      <Field label={says.placeField} value={typed} onChangeText={setTyped} maxLength={200} autoFocus returnKeyType="done" onSubmitEditing={() => onDone(typed.trim() || null)} />
      <Button label={words.common.done} size="lg" block onPress={() => onDone(typed.trim() || null)} />
      <Button label={says.noPlace} variant="soft" size="lg" block onPress={() => onDone(null)} />
    </View>
  );
}

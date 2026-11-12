import { Bell, Calendar, Repeat, Users } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import type { CircleResponse } from '@/api/generated/homeport';
import { membersOf } from '@/features/circles/members';
import { firstName } from '@/lib/names';
import { layout } from '@/theme';
import { Field } from '@/ui/Field';
import { Row, RowGroup, ToggleRow } from '@/ui/Rows';
import { words } from '@/words';

import { PeopleSheet } from './PeopleSheet';
import { canTakeTurns, dueLine, type ReminderDraft } from './reminderDraft';
import { RemindSheet } from './RemindSheet';
import { RepeatSheet } from './RepeatSheet';
import { WhenSheet } from './WhenSheet';

type Props = {
  circle: CircleResponse;
  draft: ReminderDraft;
  onChange: (change: (old: ReminderDraft) => ReminderDraft) => void;
  /** What the API said about a field, by its name. */
  problems?: Record<string, string>;
  autoFocus?: boolean;
};

/**
 * What a reminder is made of: what has to be done, when (or some time), how often, who it is given to and
 * whether they take turns, a place it waits for instead of a time, and notes. The same for a new reminder
 * and for changing one.
 */
export function ReminderFields({ circle, draft, onChange, problems = {}, autoFocus }: Props) {
  const says = words.plan.reminderForm;
  const [picking, setPicking] = useState<'when' | 'who' | 'remind' | 'repeat' | null>(null);
  const close = () => setPicking(null);
  // A job is for a person: a pet can't be given one, and it is the person's own unless it is given to someone else.
  const others = membersOf(circle).filter((member) => member.kind !== 'pet');
  const given = draft.givenTo.flatMap((id) => {
    const member = others.find((one) => one.id === id);
    return member ? [member.you ? words.plan.people.you : firstName(member.name)] : [];
  });

  return (
    <View style={{ gap: 12 }}>
      <View style={{ paddingHorizontal: layout.rowGutter }}>
        <Field label={says.title} value={draft.title} onChangeText={(title) => onChange((old) => ({ ...old, title }))} maxLength={200} autoFocus={autoFocus} placeholder={says.titlePlaceholder} error={problems.title} />
      </View>
      <RowGroup>
        <Row first icon={(c) => <Calendar size={18} color={c} />} label={says.when} note={dueLine(draft.day, draft.time)} onPress={() => setPicking('when')} />
        {draft.day ? (
          <>
            <Row icon={(c) => <Repeat size={18} color={c} />} label={says.repeat} note={draft.repeat ? words.plan.repeat.label(draft.repeat) : words.plan.repeat.none} onPress={() => setPicking('repeat')} />
            <Row icon={(c) => <Bell size={18} color={c} />} label={says.remind} note={words.plan.remind.before(draft.remindMinutes)} onPress={() => setPicking('remind')} />
          </>
        ) : null}
        <Row icon={(c) => <Users size={18} color={c} />} label={says.giveTo} note={given.length ? words.common.join(given) : says.mine} onPress={() => setPicking('who')} />
        {canTakeTurns(draft) ? <ToggleRow label={says.takesTurns.label} note={says.takesTurns.note} value={draft.takesTurns} onChange={(takesTurns) => onChange((old) => ({ ...old, takesTurns }))} /> : null}
      </RowGroup>
      <View style={{ gap: 12, paddingHorizontal: layout.rowGutter }}>
        <Field label={says.place} value={draft.place} onChangeText={(place) => onChange((old) => ({ ...old, place }))} maxLength={200} autoCapitalize="none" placeholder={says.placePlaceholder} note={says.placeNote} error={problems.place} />
        <Field label={says.notes} value={draft.notes} onChangeText={(notes) => onChange((old) => ({ ...old, notes }))} maxLength={4000} multiline placeholder={says.notesPlaceholder} error={problems.notes} />
      </View>

      <WhenSheet visible={picking === 'when'} onClose={close} kind="reminder" value={{ day: draft.day, time: draft.time, endTime: null }} onChange={(when) => onChange((old) => ({ ...old, day: when.day, time: when.time }))} />
      <PeopleSheet visible={picking === 'who'} onClose={close} title={says.giveTo} subtitle={says.giveNote} members={others} value={draft.givenTo} onChange={(givenTo) => onChange((old) => ({ ...old, givenTo }))} />
      <RemindSheet visible={picking === 'remind'} onClose={close} value={draft.remindMinutes} onChange={(minutes) => onChange((old) => ({ ...old, remindMinutes: minutes ?? 0 }))} />
      <RepeatSheet visible={picking === 'repeat'} onClose={close} value={draft.repeat} day={draft.day} onChange={(repeat) => onChange((old) => ({ ...old, repeat }))} />
    </View>
  );
}

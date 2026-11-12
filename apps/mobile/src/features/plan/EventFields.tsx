import { Bell, Calendar, Repeat, Users } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import type { CircleResponse } from '@/api/generated/homeport';
import { membersOf } from '@/features/circles/members';
import { firstName } from '@/lib/names';
import { layout } from '@/theme';
import { Field } from '@/ui/Field';
import { Row, RowGroup } from '@/ui/Rows';
import { words } from '@/words';

import { type EventDraft, whenLine } from './eventDraft';
import { PeopleSheet } from './PeopleSheet';
import { RemindSheet } from './RemindSheet';
import { RepeatSheet } from './RepeatSheet';
import { WhenSheet } from './WhenSheet';

type Props = {
  circle: CircleResponse;
  draft: EventDraft;
  onChange: (change: (old: EventDraft) => EventDraft) => void;
  /** Who is coming is picked here for a new event. On one that exists, people are put on and taken off the event itself. */
  withGuests?: boolean;
  /** What the API said about a field, by its name. */
  problems?: Record<string, string>;
  autoFocus?: boolean;
};

/**
 * What an event is made of, as boxes and rows: its name, when, where, who is coming, a reminder ahead of
 * it, how often it comes round, and notes. The same for a new event and for changing one.
 */
export function EventFields({ circle, draft, onChange, withGuests, problems = {}, autoFocus }: Props) {
  const says = words.plan.eventForm;
  const [picking, setPicking] = useState<'when' | 'who' | 'remind' | 'repeat' | null>(null);
  const close = () => setPicking(null);
  const members = membersOf(circle);
  const coming = draft.guests.flatMap((id) => {
    const member = members.find((one) => one.id === id);
    return member ? [member.you ? words.plan.people.you : firstName(member.name)] : [];
  });

  return (
    <View style={{ gap: 12 }}>
      <View style={{ paddingHorizontal: layout.rowGutter }}>
        <Field label={says.title} value={draft.title} onChangeText={(title) => onChange((old) => ({ ...old, title }))} maxLength={200} autoFocus={autoFocus} placeholder={says.titlePlaceholder} error={problems.title} />
      </View>
      <RowGroup>
        <Row first icon={(c) => <Calendar size={18} color={c} />} label={says.when} note={whenLine(draft.day, draft.time, draft.endTime)} onPress={() => setPicking('when')} />
        {withGuests ? <Row icon={(c) => <Users size={18} color={c} />} label={says.who} note={coming.length ? words.common.join(coming) : says.nobody} onPress={() => setPicking('who')} /> : null}
        <Row icon={(c) => <Bell size={18} color={c} />} label={says.remind} note={draft.remindMinutes === null ? words.plan.remind.none : words.plan.remind.before(draft.remindMinutes)} onPress={() => setPicking('remind')} />
        <Row icon={(c) => <Repeat size={18} color={c} />} label={says.repeat} note={draft.repeat ? words.plan.repeat.label(draft.repeat) : words.plan.repeat.none} onPress={() => setPicking('repeat')} />
      </RowGroup>
      <View style={{ gap: 12, paddingHorizontal: layout.rowGutter }}>
        <Field label={says.where} value={draft.place} onChangeText={(place) => onChange((old) => ({ ...old, place }))} maxLength={200} placeholder={says.wherePlaceholder} error={problems.place} />
        <Field label={says.notes} value={draft.notes} onChangeText={(notes) => onChange((old) => ({ ...old, notes }))} maxLength={4000} multiline placeholder={says.notesPlaceholder} error={problems.notes} />
      </View>

      <WhenSheet visible={picking === 'when'} onClose={close} kind="event" value={{ day: draft.day, time: draft.time, endTime: draft.endTime }} onChange={(when) => onChange((old) => ({ ...old, day: when.day ?? old.day, time: when.time, endTime: when.endTime }))} />
      <PeopleSheet visible={picking === 'who'} onClose={close} title={says.who} subtitle={says.whoNote} members={members} value={draft.guests} onChange={(guests) => onChange((old) => ({ ...old, guests }))} />
      <RemindSheet visible={picking === 'remind'} onClose={close} allowNone value={draft.remindMinutes} onChange={(remindMinutes) => onChange((old) => ({ ...old, remindMinutes }))} />
      <RepeatSheet visible={picking === 'repeat'} onClose={close} value={draft.repeat} day={draft.day} onChange={(repeat) => onChange((old) => ({ ...old, repeat }))} />
    </View>
  );
}

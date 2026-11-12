import { useMutation } from '@tanstack/react-query';
import { Plus, UserMinus } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { View } from 'react-native';

import { useCache } from '@/api/cache';
import { messageFor } from '@/api/fetcher';
import { addEventGuest, type Answer, changeEventGuest, type EventResponse, type GuestResponse, removeEventGuest } from '@/api/generated/homeport';
import { useCircles } from '@/features/circles/current';
import { membersOf } from '@/features/circles/members';
import { newClientId } from '@/lib/ids';
import { firstName } from '@/lib/names';
import { layout, useTheme } from '@/theme';
import { Avatar } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { Field } from '@/ui/Field';
import { GroupLabel } from '@/ui/Heading';
import { Tap } from '@/ui/Motion';
import { Segmented } from '@/ui/Segmented';
import { SelectPill } from '@/ui/SelectPill';
import { Sheet, SheetRow } from '@/ui/Sheet';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

type Props = { event: EventResponse; visible: boolean; onClose: () => void };

const ANSWERS: readonly Answer[] = ['going', 'maybe', 'cant'];
/** What the row of three shows chosen for someone who hasn't answered: none of them. */
const UNANSWERED = 'none' as const;

/**
 * Who is coming to an event, and what each of them answered. Whoever may change the event can answer for
 * someone who has no phone (a child, a grandparent from outside the circle), take someone off, and put
 * someone on: one of the circle, or a name.
 */
export function GuestsSheet({ event, visible, onClose }: Props) {
  return (
    <Sheet visible={visible} onClose={onClose} title={words.plan.event.guests.title} tall>
      <Guests event={event} />
    </Sheet>
  );
}

function Guests({ event }: { event: EventResponse }) {
  const { colors } = useTheme();
  const cache = useCache();
  const says = words.plan.event.guests;
  const circle = useCircles().find((one) => one.id === event.circleId);
  /** The guest whose choices are open under their row. */
  const [opened, setOpened] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const clientId = useRef(newClientId());

  const settled = () => cache.eventGuestsChanged(event);
  const answer = useMutation({
    mutationFn: ({ guest, next }: { guest: GuestResponse; next: Answer | null }) => changeEventGuest(guest.id, next ? { answer: next } : { removeAnswer: true }),
    onSettled: settled,
  });
  const remove = useMutation({
    mutationFn: (guest: GuestResponse) => removeEventGuest(guest.id),
    onSuccess: () => setOpened(null),
    onSettled: settled,
  });
  const add = useMutation({
    mutationFn: (who: { memberId: string } | { name: string }) => addEventGuest(event.id, { clientId: clientId.current, ...who }),
    onSuccess: () => {
      // The next one is someone new: they get an id of their own.
      clientId.current = newClientId();
      setName('');
    },
    onSettled: settled,
  });
  const problem = [answer, remove, add].find((one) => one.isError)?.error;
  const onIt = new Set(event.guests.map((guest) => guest.memberId));
  const others = circle ? membersOf(circle).filter((member) => !onIt.has(member.id)) : [];

  return (
    <View>
      {event.guests.map((guest, index) => {
        const shown = guest.you ? says.you : guest.name;
        const said = says.answers[guest.answer ?? UNANSWERED];
        const open = opened === guest.id;
        return (
          <View key={guest.id} style={{ borderTopWidth: index === 0 ? 0 : 1, borderTopColor: colors.line }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 8, paddingHorizontal: layout.gutter }}>
              <Avatar uri={guest.avatarUrl} name={guest.name} size={36} />
              <Txt variant="headline" weight={600} numberOfLines={1} style={{ flex: 1 }}>
                {guest.part ? says.part(shown, guest.part) : shown}
              </Txt>
              {event.canEdit ? (
                <SelectPill label={said} muted={!guest.answer} spoken={says.row(shown, said)} onPress={() => setOpened(open ? null : guest.id)} />
              ) : (
                <Txt variant="footnote" weight={700} color={guest.answer ? 'text' : 'muted'} accessibilityLabel={says.rowQuiet(shown, said)}>
                  {said}
                </Txt>
              )}
            </View>
            {open ? (
              <View style={{ gap: 10, paddingBottom: 12 }}>
                <Segmented label={says.answerFor(shown)} options={ANSWERS.map((id) => ({ id, label: words.plan.event.answers[id] }))} value={guest.answer ?? UNANSWERED} onChange={(next) => answer.mutate({ guest, next: next === UNANSWERED ? null : next })} />
                {guest.you ? null : (
                  <Tap accessibilityRole="button" accessibilityLabel={says.remove} hitSlop={8} onPress={() => remove.mutate(guest)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', marginHorizontal: layout.gutter }}>
                    <UserMinus size={16} color={colors.danger} />
                    <Txt variant="caption" weight={700} color="danger">
                      {says.remove}
                    </Txt>
                  </Tap>
                )}
              </View>
            ) : null}
          </View>
        );
      })}
      {problem ? (
        <Txt variant="caption" color="danger" accessibilityLiveRegion="polite" style={{ paddingTop: 8, paddingHorizontal: layout.gutter }}>
          {messageFor(problem)}
        </Txt>
      ) : null}

      {event.canEdit ? (
        adding ? (
          <View style={{ paddingBottom: 4 }}>
            <GroupLabel style={{ marginHorizontal: layout.gutter }}>{says.add}</GroupLabel>
            {others.length ? (
              others.map((member, index) => (
                <SheetRow key={member.id} first={index === 0} icon={() => <Avatar uri={member.avatarUrl} name={member.name} size={32} />} label={member.you ? says.you : firstName(member.name)} trailing={<Plus size={18} color={colors.muted} />} onPress={() => add.mutate({ memberId: member.id })} />
              ))
            ) : (
              <Txt variant="callout" color="muted" style={{ marginHorizontal: layout.gutter }}>
                {says.everyoneIsOn}
              </Txt>
            )}
            <GroupLabel style={{ marginHorizontal: layout.gutter }}>{says.outside}</GroupLabel>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingHorizontal: layout.barGutter }}>
              <View style={{ flex: 1 }}>
                <Field label={says.name} value={name} onChangeText={setName} maxLength={80} autoCapitalize="words" returnKeyType="done" onSubmitEditing={() => name.trim() && add.mutate({ name: name.trim() })} />
              </View>
              <Button label={says.addName} disabled={name.trim().length === 0} loading={add.isPending} onPress={() => add.mutate({ name: name.trim() })} style={{ marginTop: 6 }} />
            </View>
          </View>
        ) : (
          <View style={{ paddingTop: 12, paddingHorizontal: layout.barGutter }}>
            <Button label={says.add} variant="soft" size="lg" block icon={(c) => <Plus size={18} color={c} />} onPress={() => setAdding(true)} />
          </View>
        )
      ) : null}
    </View>
  );
}

import { useMutation } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { View } from 'react-native';

import { useCache } from '@/api/cache';
import { messageFor } from '@/api/fetcher';
import { addGoalEntry, type GoalResponse } from '@/api/generated/homeport';
import { useCircles } from '@/features/circles/current';
import { membersOf } from '@/features/circles/members';
import { today } from '@/lib/dates';
import { newClientId } from '@/lib/ids';
import { firstName } from '@/lib/names';
import { layout } from '@/theme';
import { Button } from '@/ui/Button';
import { Field } from '@/ui/Field';
import { SelectPill } from '@/ui/SelectPill';
import { Sheet } from '@/ui/Sheet';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

import { PeopleSheet } from './PeopleSheet';
import { readCents } from './times';

type Props = { goal: GoalResponse; visible: boolean; onClose: () => void };

/**
 * "Add money": how much, a few words ("payday"), and who put it in when that isn't you (a child's pocket
 * money). The ring, what is left and the pace are the API's to work out again.
 */
export function AddMoneySheet({ goal, visible, onClose }: Props) {
  return (
    <Sheet visible={visible} onClose={onClose} title={words.plan.goal.addSheet.money}>
      <Adding goal={goal} onClose={onClose} />
    </Sheet>
  );
}

function Adding({ goal, onClose }: Omit<Props, 'visible'>) {
  const cache = useCache();
  const says = words.plan.goal.addSheet;
  const circle = useCircles().find((one) => one.id === goal.circleId);
  const people = circle ? membersOf(circle).filter((member) => member.kind !== 'pet') : [];
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  /** Who put it in, when not the person themselves. */
  const [memberId, setMemberId] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [tried, setTried] = useState(false);
  const clientId = useRef(newClientId());
  const cents = readCents(amount);
  const by = people.find((member) => member.id === memberId);

  const add = useMutation({
    mutationFn: () => addGoalEntry(goal.id, { clientId: clientId.current, amount: cents ?? 0, note: note.trim() || undefined, day: today(), memberId: by && !by.you ? by.id : undefined }),
    onSuccess: () => {
      void cache.goalMoved(goal);
      onClose();
    },
  });

  return (
    <View style={{ gap: 12, paddingTop: 6, paddingHorizontal: layout.barGutter }}>
      <Field label={says.amount} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" autoFocus placeholder="150" error={tried && !cents ? says.amountProblem : null} />
      <Field label={says.note} value={note} onChangeText={setNote} maxLength={200} placeholder={says.notePlaceholder} />
      {people.length > 1 ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 4 }}>
          <Txt variant="caption" color="muted">
            {says.who}
          </Txt>
          <SelectPill label={by && !by.you ? firstName(by.name) : words.plan.people.you} spoken={words.common.fieldChange(says.who, by && !by.you ? firstName(by.name) : words.plan.people.you)} onPress={() => setPicking(true)} />
        </View>
      ) : null}
      {add.isError ? (
        <Txt variant="caption" color="danger" accessibilityLiveRegion="polite" style={{ marginHorizontal: 4 }}>
          {messageFor(add.error)}
        </Txt>
      ) : null}
      <Button
        label={says.confirm}
        size="lg"
        block
        loading={add.isPending}
        onPress={() => {
          setTried(true);
          if (cents) add.mutate();
        }}
      />
      <PeopleSheet visible={picking} onClose={() => setPicking(false)} single title={says.who} nobody={words.plan.people.you} members={people.filter((member) => !member.you)} value={memberId ? [memberId] : []} onChange={(picked) => setMemberId(picked[0] ?? null)} />
    </View>
  );
}

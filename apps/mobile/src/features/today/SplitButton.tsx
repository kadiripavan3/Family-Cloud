import { useMutation } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';

import { useCache } from '@/api/cache';
import { messageFor } from '@/api/fetcher';
import { addSplitPayment, remindSplitMember, type SplitResponse, type ToPayResponse, useGetSplit } from '@/api/generated/homeport';
import { today } from '@/lib/dates';
import { newClientId } from '@/lib/ids';
import { formatMoney } from '@/lib/money';
import { Button } from '@/ui/Button';
import { ConfirmSheet } from '@/ui/ConfirmSheet';
import { words } from '@/words';

type Props = {
  /** The split the line is about. */
  splitId: string;
  /** The line's own title, for a screen reader: "You're owed for Lisbon weekend". */
  title: string;
  /** True in a circle of two people: between two you settle; among more, whoever is owed reminds. */
  two: boolean;
  /** Says a sentence that answers the press and goes by itself. */
  say: (text: string) => void;
  /** Drawn while the split is on its way, and when it has nothing for this person to do. */
  fallback?: ReactNode;
};

/**
 * The button on a line of Today about shared costs. Today's line says only what it comes to; the split
 * itself says who pays whom, so it is asked. What the button does is what it says:
 *
 *  - "Remind", for someone who is owed among several people: each one who owes them is reminded.
 *  - "Settle", between two people and for someone who owes: the payments that settle it for this person
 *    are marked as made, after asking. The app moves no money itself.
 */
export function SplitButton({ splitId, title, two, say, fallback }: Props) {
  const split = useGetSplit(splitId).data;
  /** What settles it for this person: who pays them, or whom they pay. */
  const mine = split ? split.settle.filter((one) => one.youPay || one.paysYou) : [];
  if (!split || mine.length === 0) return <>{fallback}</>;
  const owed = mine.filter((one) => one.paysYou);
  return owed.length > 0 && !two ? <Remind split={split} owed={owed} title={title} say={say} /> : <Settle split={split} mine={mine} title={title} say={say} />;
}

function Remind({ split, owed, title, say }: { split: SplitResponse; owed: ToPayResponse[]; title: string; say: (text: string) => void }) {
  const cache = useCache();
  const remind = useMutation({
    mutationFn: async () => {
      for (const one of owed) await remindSplitMember(split.id, one.from.memberId ?? '');
    },
    onSuccess: () => {
      say(words.today.split.reminded(owed.map((one) => one.from.name ?? '')));
      void cache.thingChanged(split);
    },
    onError: (error) => say(messageFor(error)),
  });
  return <Button label={words.today.split.remind} spoken={words.today.split.spoken(words.today.split.remind, title)} size="sm" variant="soft" inline loading={remind.isPending} onPress={() => remind.mutate()} />;
}

function Settle({ split, mine, title, say }: { split: SplitResponse; mine: ToPayResponse[]; title: string; say: (text: string) => void }) {
  const cache = useCache();
  /** One id for each payment of the question that is open, so a second tap doesn't mark it twice. Null while nothing is asked. */
  const [ids, setIds] = useState<string[] | null>(null);
  const settle = useMutation({
    mutationFn: async (clientIds: string[]) => {
      for (const [index, one] of mine.entries()) {
        await addSplitPayment(split.id, { clientId: clientIds[index] ?? newClientId(), from: one.from.memberId ?? '', to: one.to.memberId ?? '', amountCents: one.cents }, { day: today() });
      }
    },
    onSuccess: () => {
      setIds(null);
      say(words.today.split.settled(split.title));
      return cache.thingChanged(split);
    },
  });
  const money = (cents: number) => formatMoney(cents, split.currency);
  const only = mine.length === 1 ? mine[0] : undefined;
  const question = only
    ? only.paysYou
      ? words.today.split.paidYou(only.from.name ?? '', money(only.cents))
      : words.today.split.youPaid(only.to.name ?? '', money(only.cents))
    : words.today.split.several(money(mine.reduce((sum, one) => sum + one.cents, 0)));
  return (
    <>
      <Button
        label={words.today.split.settle}
        spoken={words.today.split.spoken(words.today.split.settle, title)}
        size="sm"
        variant="soft"
        inline
        onPress={() => {
          settle.reset();
          setIds(mine.map(() => newClientId()));
        }}
      />
      <ConfirmSheet
        visible={ids !== null}
        onClose={() => setIds(null)}
        title={question}
        body={words.today.split.body(split.title)}
        confirm={words.today.split.confirm}
        cancel={words.today.split.notYet}
        busy={settle.isPending}
        problem={settle.isError ? messageFor(settle.error) : null}
        onConfirm={() => (ids ? settle.mutate(ids) : undefined)}
      />
    </>
  );
}

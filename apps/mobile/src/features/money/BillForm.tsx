import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Calendar, ScanLine } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { View } from 'react-native';

import { useCache } from '@/api/cache';
import { ApiError, messageFor } from '@/api/fetcher';
import { type BillResponse, changeBill, type CircleResponse, createBill, type PaidHow, type Repeat } from '@/api/generated/homeport';
import { useCircle, useCircles } from '@/features/circles/current';
import { useLeave } from '@/features/navigation/useLeave';
import { useUnsaved } from '@/features/navigation/useUnsaved';
import { StartsAsPill } from '@/features/sharing/StartsAsPill';
import { useStartsAs } from '@/features/sharing/useStartsAs';
import { thingHref } from '@/features/things/open';
import { formatWeekday, today } from '@/lib/dates';
import { newClientId } from '@/lib/ids';
import { moneyToType, parseMoney } from '@/lib/money';
import { firstName } from '@/lib/names';
import { AppBar } from '@/ui/AppBar';
import { Button } from '@/ui/Button';
import { CheckRow } from '@/ui/CheckRow';
import { ConfirmSheet } from '@/ui/ConfirmSheet';
import { DayPicker } from '@/ui/DayPicker';
import { Field, FieldButton } from '@/ui/Field';
import { ToggleRow } from '@/ui/Rows';
import { Screen } from '@/ui/Screen';
import { Txt } from '@/ui/Txt';
import { useTheme } from '@/theme';
import { words } from '@/words';

import { payers } from './lines';
import { ChoiceChips, FormLabel, Trouble } from './parts';

const REPEATS: readonly Repeat[] = ['once', 'monthly', 'months', 'yearly'];
const PAYS: readonly PaidHow[] = ['by_hand', 'standing_order', 'direct_debit'];
/** How long before it is due a bill can remind, in days. */
const REMIND = { none: null, one: 1, two: 2, week: 7 } as const;
type Remind = keyof typeof REMIND;
const remindOf = (days: number | null): Remind => (days === null ? 'none' : days <= 1 ? 'one' : days <= 2 ? 'two' : 'week');

/**
 * Adding a bill by hand, and changing one: what it is, who to pay, how much and by when, how often it comes,
 * how it gets paid, when it reminds, and who pays it. Sharing it out here is always even; the amounts each
 * person owes come back from the API. Saving a new one opens the bill itself.
 */
export function BillForm({ bill }: { bill?: BillResponse }) {
  const { colors } = useTheme();
  const router = useRouter();
  const leave = useLeave();
  const cache = useCache();
  const current = useCircle();
  const circle: CircleResponse = useCircles().find((one) => one.id === bill?.circleId) ?? current;
  const [audience, setAudience] = useStartsAs(circle);
  const people = payers(circle);

  const [title, setTitle] = useState(bill?.title ?? '');
  const [payee, setPayee] = useState(bill?.payee ?? '');
  const [amount, setAmount] = useState(moneyToType(bill?.amountCents));
  const [dueOn, setDueOn] = useState(bill?.dueOn ?? today());
  const [repeat, setRepeat] = useState<Repeat>(bill?.repeat ?? 'once');
  const [every, setEvery] = useState(String(bill && bill.everyMonths > 1 ? bill.everyMonths : 3));
  const [subscription, setSubscription] = useState(bill?.subscription ?? false);
  const [pays, setPays] = useState<PaidHow>(bill?.pays ?? 'by_hand');
  const [remind, setRemind] = useState<Remind>(bill ? remindOf(bill.remindDays) : 'two');
  const [sharers, setSharers] = useState<readonly string[]>(bill ? bill.shares.flatMap((share) => (share.person.memberId ? [share.person.memberId] : [])) : [circle.myMemberId]);
  /** Who pays is only sent when it was changed here: a bill that is shared out unevenly keeps its parts otherwise. */
  const [sharersChanged, setSharersChanged] = useState(false);
  const [iban, setIban] = useState(bill?.iban ?? '');
  const [reference, setReference] = useState(bill?.reference ?? '');
  const [payUrl, setPayUrl] = useState(bill?.payUrl ?? '');
  const [note, setNote] = useState(bill?.note ?? '');
  const [picking, setPicking] = useState(false);
  const [touched, setTouched] = useState(false);
  const clientId = useRef(newClientId());

  const cents = parseMoney(amount);
  const named = title.trim().length > 0 || payee.trim().length > 0;
  const ready = named && cents !== null && cents > 0 && sharers.length > 0;
  const unsaved = useUnsaved(touched);
  /** Changes one box and remembers that something was typed. */
  const typed =
    <T,>(set: (value: T) => void) =>
    (value: T) => {
      setTouched(true);
      set(value);
    };

  const save = useMutation({
    mutationFn: () => {
      const shares = sharers.map((memberId) => ({ memberId, weight: 1 }));
      const common = {
        title: title.trim() || undefined,
        payee: payee.trim() || undefined,
        amountCents: cents ?? 0,
        dueOn,
        repeat,
        everyMonths: repeat === 'months' ? Number(every) || 3 : undefined,
        subscription,
        pays,
        remindDays: REMIND[remind] ?? undefined,
        note: note.trim(),
        iban: iban.trim(),
        reference: reference.trim(),
        payUrl: payUrl.trim() || undefined,
      };
      if (bill) return changeBill(bill.id, { ...common, removeReminder: remind === 'none' || undefined, removePayUrl: (!payUrl.trim() && !!bill.payUrl) || undefined, shares: sharersChanged ? shares : undefined });
      return createBill({ ...common, clientId: clientId.current, circleId: circle.id, audience, shares: sharers.length === 1 && sharers[0] === circle.myMemberId ? undefined : shares });
    },
    onSuccess: (saved) => {
      unsaved.release();
      if (bill) {
        void cache.billSaved(saved);
        leave();
      } else {
        void cache.billMade(saved);
        router.replace(thingHref({ kind: 'bill', id: saved.id }));
      }
    },
  });
  const failed = save.error instanceof ApiError ? save.error : null;
  const fieldProblem = failed?.fields.title || failed?.fields.payee || failed?.fields.amountCents;

  return (
    <Screen
      header={<AppBar leading="close" title={bill ? words.money.form.change : words.money.form.new} />}
      footer={<Button label={bill ? words.money.form.save : words.money.form.add} size="lg" block disabled={!ready} loading={save.isPending} onPress={() => save.mutate()} />}>
      <View style={{ gap: 12, paddingTop: 8 }}>
        {bill ? null : <Button label={words.money.form.scanInstead} variant="soft" block icon={(c) => <ScanLine size={18} color={c} />} onPress={() => router.replace('/money/scan')} />}
        <Field label={words.money.form.name} value={title} onChangeText={typed(setTitle)} maxLength={120} placeholder={words.money.form.namePlaceholder} autoFocus={!bill} error={failed?.fields.title} />
        <Field label={words.money.form.payee} value={payee} onChangeText={typed(setPayee)} maxLength={120} error={failed?.fields.payee} />
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Field label={words.money.form.amount} value={amount} onChangeText={typed(setAmount)} keyboardType="decimal-pad" maxLength={14} error={amount.trim() && cents === null ? words.money.form.amountWrong : failed?.fields.amountCents} />
          </View>
          <FieldButton label={words.money.form.due} value={formatWeekday(dueOn)} icon={<Calendar size={18} color={colors.text} />} onPress={() => setPicking(true)} />
        </View>

        <FormLabel>{words.money.form.repeat}</FormLabel>
        <ChoiceChips label={words.money.form.repeat} options={REPEATS.map((id) => ({ id, label: words.money.form.repeats[id] }))} value={repeat} onChange={typed(setRepeat)} />
        {repeat === 'months' ? <Field label={words.money.form.everyMonths} value={every} onChangeText={typed(setEvery)} keyboardType="number-pad" maxLength={2} error={failed?.fields.everyMonths} /> : null}
        <View style={{ marginHorizontal: -16 }}>
          <ToggleRow first label={words.money.form.subscription.label} note={words.money.form.subscription.note} value={subscription} onChange={typed(setSubscription)} />
        </View>

        <FormLabel>{words.money.form.pays}</FormLabel>
        <ChoiceChips label={words.money.form.pays} options={PAYS.map((id) => ({ id, label: words.money.form.paysHow[id] }))} value={pays} onChange={typed(setPays)} />

        <FormLabel>{words.money.form.remind}</FormLabel>
        <ChoiceChips label={words.money.form.remind} options={(Object.keys(REMIND) as Remind[]).map((id) => ({ id, label: words.money.form.reminders[id] }))} value={remind} onChange={typed(setRemind)} />

        {people.length > 1 ? (
          <>
            <FormLabel>{words.money.form.whoPays}</FormLabel>
            <View style={{ gap: 12, marginHorizontal: 4 }}>
              {people.map((person) => {
                const me = person.id === circle.myMemberId;
                return (
                  <CheckRow
                    key={person.id}
                    label={me ? words.money.form.onlyMe : words.money.form.splitWith(firstName(person.name))}
                    checked={sharers.includes(person.id)}
                    onChange={(on) => {
                      setTouched(true);
                      setSharersChanged(true);
                      setSharers(on ? [...sharers, person.id] : sharers.filter((id) => id !== person.id));
                    }}
                  />
                );
              })}
              <Txt variant="footnote" color="muted">
                {words.money.form.splitNote}
              </Txt>
            </View>
          </>
        ) : null}

        <FormLabel>{words.money.form.more}</FormLabel>
        <Field label={words.money.form.iban} value={iban} onChangeText={typed(setIban)} maxLength={42} autoCapitalize="characters" autoCorrect={false} error={failed?.fields.iban} />
        <Field label={words.money.form.reference} value={reference} onChangeText={typed(setReference)} maxLength={140} autoCorrect={false} error={failed?.fields.reference} />
        <Field label={words.money.form.payUrl} value={payUrl} onChangeText={typed(setPayUrl)} maxLength={500} autoCapitalize="none" autoCorrect={false} keyboardType="url" error={failed?.fields.payUrl} />
        <Field label={words.money.form.note} value={note} onChangeText={typed(setNote)} maxLength={2000} multiline error={failed?.fields.note} />

        {bill ? null : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 4 }}>
            <Txt variant="caption" color="muted">
              {words.things.seenBy}
            </Txt>
            <StartsAsPill circle={circle} value={audience} onChange={setAudience} />
          </View>
        )}
        <Trouble message={save.isError && !fieldProblem ? messageFor(save.error) : null} style={{ marginTop: 0, marginHorizontal: 4 }} />
      </View>

      <DayPicker visible={picking} onClose={() => setPicking(false)} title={words.money.form.dueTitle} value={dueOn} onChange={typed(setDueOn)} />
      <ConfirmSheet visible={unsaved.asking} onClose={unsaved.stay} title={words.things.discard.title} body={words.things.discard.body} confirm={words.things.discard.confirm} cancel={words.things.discard.cancel} onConfirm={unsaved.leave} />
    </Screen>
  );
}

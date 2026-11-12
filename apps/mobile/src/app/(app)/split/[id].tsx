import { useMutation } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronRight, Ellipsis, Eye, Pencil, Plus, ScanLine, Trash2 } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCache } from '@/api/cache';
import { ApiError, messageFor } from '@/api/fetcher';
import { addSplitPayment, deleteThing, type ExpenseResponse, type PaymentResponse, remindSplitMember, removeSplitPayment, renameSplit, type SplitResponse, type ToPayResponse, useGetSplit, useGetSplitExpensesInfinite } from '@/api/generated/homeport';
import { paged, rows } from '@/api/pages';
import { useCircles } from '@/features/circles/current';
import { expenseLine } from '@/features/money/lines';
import { Amount, EmojiTile, Faces, FIGURES, Trouble } from '@/features/money/parts';
import { ExpenseSheet } from '@/features/money/split/ExpenseSheet';
import { useLeave } from '@/features/navigation/useLeave';
import { AudienceChip } from '@/features/sharing/AudienceChip';
import { AudienceSheet } from '@/features/sharing/AudienceSheet';
import { PageProblem } from '@/features/states/PageProblem';
import { formatDay, today } from '@/lib/dates';
import { newClientId } from '@/lib/ids';
import { loadState } from '@/lib/loading';
import { formatMoney } from '@/lib/money';
import { firstName } from '@/lib/names';
import { layout, radius, useTheme } from '@/theme';
import { AppBar } from '@/ui/AppBar';
import { Avatar } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { ConfirmSheet } from '@/ui/ConfirmSheet';
import { Field } from '@/ui/Field';
import { GlassBar } from '@/ui/GlassBar';
import { GroupLabel } from '@/ui/Heading';
import { Loading } from '@/ui/Loading';
import { MoreButton } from '@/ui/MoreButton';
import { Tap } from '@/ui/Motion';
import { RoundButton } from '@/ui/RoundButton';
import { Sheet, SheetRow } from '@/ui/Sheet';
import { ListSkeleton, Sk } from '@/ui/Skeleton';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

/**
 * 8.9 Splitting with friends. Everyone adds what they paid; the API works out where each one stands and the
 * fewest payments that settle it. The card on top says where the person stands (pressing it shows everyone),
 * then the payments to make (a row marks one as made; "Remind" nudges whoever owes you), the latest
 * expenses (a row changes one), and the payments already made (a row takes one back). No bank link: it only
 * keeps count.
 */
export default function Split() {
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const asked = useGetSplit(id);
  const load = loadState(asked);
  const split = asked.data;
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: colors.bg }}>
      {load.error ? (
        <>
          <AppBar />
          <PageProblem error={load.error} onRetry={load.retry} retrying={load.retrying} />
        </>
      ) : !split ? (
        <>
          <AppBar />
          {load.offline ? (
            <Loading offline />
          ) : (
            <View accessibilityLabel={words.states.loading}>
              <Sk height={132} radius="panel" style={{ marginHorizontal: layout.barGutter }} />
              <ListSkeleton count={4} />
            </View>
          )}
        </>
      ) : (
        <Loaded split={split} />
      )}
    </SafeAreaView>
  );
}

type Open = 'menu' | 'standings' | 'expense' | 'rename' | 'audience' | 'delete' | null;

function Loaded({ split }: { split: SplitResponse }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const cache = useCache();
  const leave = useLeave();
  const circle = useCircles().find((one) => one.id === split.circleId);
  const [open, setOpen] = useState<Open>(null);
  const [expense, setExpense] = useState<ExpenseResponse | undefined>(undefined);
  const [paying, setPaying] = useState<ToPayResponse | null>(null);
  const [takingBack, setTakingBack] = useState<PaymentResponse | null>(null);
  const [typed, setTyped] = useState('');
  const [wantMore, setWantMore] = useState(false);
  const paymentId = useRef(newClientId());

  // The split comes with its twenty latest expenses; the rest are asked for a page at a time.
  const further = useGetSplitExpensesInfinite(split.id, undefined, { query: { ...paged, enabled: wantMore } });
  const expenses = wantMore ? (rows(further.data) ?? split.latest) : split.latest;

  const pay = useMutation({
    mutationFn: (one: ToPayResponse) => addSplitPayment(split.id, { clientId: paymentId.current, from: one.from.memberId ?? '', to: one.to.memberId ?? '', amountCents: one.cents }, { day: today() }),
    onSuccess: () => {
      paymentId.current = newClientId();
      setPaying(null);
      void cache.splitChanged(split);
    },
  });
  const takeBack = useMutation({
    mutationFn: (payment: PaymentResponse) => removeSplitPayment(payment.id),
    onSuccess: () => {
      setTakingBack(null);
      void cache.splitChanged(split);
    },
  });
  const remind = useMutation({ mutationFn: (memberId: string) => remindSplitMember(split.id, memberId), onSuccess: (saved) => void cache.splitSaved(saved) });
  const rename = useMutation({
    mutationFn: () => renameSplit(split.id, { title: typed.trim() }),
    onSuccess: (saved) => {
      void cache.splitSaved(saved);
      setOpen(null);
    },
  });
  const remove = useMutation({
    mutationFn: () => deleteThing(split.id),
    onSuccess: () => {
      setOpen(null);
      leave();
      void cache.thingDeleted(split);
    },
  });

  const amount = formatMoney(Math.abs(split.myBalanceCents), split.currency);
  const standing = split.myBalanceCents > 0 ? words.money.split.owed(amount) : split.myBalanceCents < 0 ? words.money.split.owe(amount) : words.money.split.even;
  const after = words.money.split.after(split.expenses, formatMoney(split.totalCents, split.currency));
  const renameFailed = rename.error instanceof ApiError ? rename.error : null;

  return (
    <>
      <AppBar
        title={split.title}
        subtitle={circle ? words.money.split.sub(circle.name, circle.kind, split.people.length) : undefined}
        trailing={<RoundButton label={words.things.more} icon={(c) => <Ellipsis size={20} color={c} />} onPress={() => setOpen('menu')} />}
      />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: (split.canEdit ? 104 : 24) + insets.bottom }}>
        <Tap accessibilityRole="button" accessibilityLabel={words.money.split.standingsSpoken(words.common.spoken([after, standing]))} onPress={() => setOpen('standings')} style={{ alignItems: 'center', gap: 4, marginHorizontal: layout.barGutter, padding: 18, borderRadius: radius.panel, backgroundColor: colors.accentSoft }}>
          <Txt variant="caption" center style={{ color: colors.accentText }}>
            {after}
          </Txt>
          <Txt variant="display" center style={FIGURES}>
            {standing}
          </Txt>
          <View style={{ marginTop: 6 }}>
            <Faces people={split.people.map((one) => one.person)} ring={colors.accentSoft} />
          </View>
        </Tap>

        <GroupLabel style={{ marginHorizontal: layout.gutter }}>{words.money.split.fewest}</GroupLabel>
        {split.settle.length === 0 ? (
          <Txt variant="callout" color="muted" style={{ marginHorizontal: layout.gutter }}>
            {words.money.split.settled}
          </Txt>
        ) : null}
        {split.settle.map((one, index) => (
          <SettleRow key={`${one.from.memberId}-${one.to.memberId}-${index}`} toPay={one} currency={split.currency} canEdit={split.canEdit} reminding={remind.isPending && remind.variables === one.from.memberId} onPress={() => setPaying(one)} onRemind={() => remind.mutate(one.from.memberId ?? '')} />
        ))}
        <Trouble message={remind.isError ? messageFor(remind.error) : null} />

        {expenses.length ? <GroupLabel style={{ marginHorizontal: layout.gutter }}>{words.money.split.latest}</GroupLabel> : null}
        {expenses.map((one) => (
          <ExpenseRow
            key={one.id}
            expense={one}
            currency={split.currency}
            onPress={
              split.canEdit
                ? () => {
                    setExpense(one);
                    setOpen('expense');
                  }
                : undefined
            }
          />
        ))}
        {wantMore ? (
          <MoreButton pages={further} label={words.money.split.moreExpenses} />
        ) : split.expenses > split.latest.length ? (
          <View style={{ alignItems: 'center', marginTop: 8 }}>
            <Button label={words.money.split.moreExpenses} variant="line" size="sm" inline onPress={() => setWantMore(true)} />
          </View>
        ) : null}

        {split.paid.length ? <GroupLabel style={{ marginHorizontal: layout.gutter }}>{words.money.split.paidBack}</GroupLabel> : null}
        {split.paid.map((payment) => (
          <PaidRow key={payment.id} payment={payment} currency={split.currency} youId={split.people.find((one) => one.you)?.person.memberId} onPress={split.canEdit ? () => setTakingBack(payment) : undefined} />
        ))}
        {split.canEdit ? null : (
          <Txt variant="footnote" color="muted" style={{ marginTop: 14, marginHorizontal: layout.gutter }}>
            {words.money.split.viewOnly}
          </Txt>
        )}
      </ScrollView>

      {split.canEdit ? (
        <GlassBar radius="sheet" style={{ position: 'absolute', left: 12, right: 12, bottom: Math.max(insets.bottom, 12) + 12 }} contentStyle={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 58, paddingVertical: 10, paddingLeft: 18, paddingRight: 10 }}>
          <View style={{ flex: 1 }}>
            <Txt variant="item" weight={800} numberOfLines={1}>
              {words.money.split.cta.title}
            </Txt>
            <Txt variant="footnote" color="muted" numberOfLines={1}>
              {words.money.split.cta.note}
            </Txt>
          </View>
          <Button label={words.money.split.cta.scan} variant="soft" size="sm" inline icon={(c) => <ScanLine size={16} color={c} />} onPress={() => router.push({ pathname: '/money/scan', params: { split: split.id } })} />
          <Button
            label={words.money.split.cta.add}
            spoken={words.money.split.expense.new}
            size="sm"
            inline
            icon={(c) => <Plus size={16} color={c} />}
            onPress={() => {
              setExpense(undefined);
              setOpen('expense');
            }}
          />
        </GlassBar>
      ) : null}

      <ExpenseSheet split={split} visible={open === 'expense'} expense={expense} onClose={() => setOpen(null)} />

      <Sheet visible={open === 'standings'} onClose={() => setOpen(null)} title={words.money.split.standings} subtitle={after}>
        {split.people.map((one, index) => {
          const balance = formatMoney(Math.abs(one.balanceCents), split.currency);
          return (
            <View key={one.person.memberId ?? index} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 8, paddingHorizontal: layout.gutter }}>
              <Avatar uri={one.person.avatarUrl} name={one.person.name ?? ''} size={38} />
              <View style={{ flex: 1 }}>
                <Txt variant="item">{one.you ? words.money.split.You : firstName(one.person.name)}</Txt>
                <Txt variant="footnote" color="muted" style={FIGURES}>
                  {words.money.split.paidAndShare(formatMoney(one.paidCents, split.currency), formatMoney(one.shareCents, split.currency))}
                </Txt>
              </View>
              <Amount color={one.balanceCents < 0 ? colors.warn : one.balanceCents > 0 ? colors.ok : colors.muted}>{one.balanceCents > 0 ? words.money.split.plus(balance) : one.balanceCents < 0 ? `−${balance}` : balance}</Amount>
            </View>
          );
        })}
      </Sheet>

      <Sheet
        visible={!!paying}
        onClose={() => setPaying(null)}
        title={paying ? (paying.paysYou ? words.money.split.payment.titleToYou(firstName(paying.from.name), formatMoney(paying.cents, split.currency)) : paying.youPay ? words.money.split.payment.titleFromYou(firstName(paying.to.name), formatMoney(paying.cents, split.currency)) : words.money.split.payment.title(firstName(paying.from.name), firstName(paying.to.name), formatMoney(paying.cents, split.currency))) : undefined}
        subtitle={words.money.split.payment.body}>
        <Trouble message={pay.isError ? messageFor(pay.error) : null} style={{ marginTop: 0, marginBottom: 8 }} />
        <View style={{ gap: 10, paddingTop: 6, paddingHorizontal: layout.rowGutter }}>
          <Button label={words.money.split.payment.confirm} size="lg" block loading={pay.isPending} onPress={() => (paying ? pay.mutate(paying) : undefined)} />
          <Button label={words.common.notNow} variant="soft" size="lg" block onPress={() => setPaying(null)} />
        </View>
      </Sheet>
      <ConfirmSheet
        visible={!!takingBack}
        onClose={() => setTakingBack(null)}
        title={words.money.split.payment.takeBackAsk.title}
        body={words.money.split.payment.takeBackAsk.body}
        confirm={words.money.split.payment.takeBackAsk.confirm}
        busy={takeBack.isPending}
        problem={takeBack.isError ? messageFor(takeBack.error) : null}
        onConfirm={() => (takingBack ? takeBack.mutate(takingBack) : undefined)}
      />

      <Sheet visible={open === 'menu'} onClose={() => setOpen(null)}>
        {split.canEdit ? (
          <SheetRow
            first
            icon={(c) => <Pencil size={22} color={c} />}
            label={words.money.split.menu.rename}
            onPress={() => {
              setTyped(split.title);
              rename.reset();
              setOpen('rename');
            }}
          />
        ) : null}
        <SheetRow first={!split.canEdit} icon={(c) => <Eye size={22} color={c} />} label={words.money.split.menu.whoSees} trailing={<AudienceChip thing={split} quiet />} onPress={() => setOpen('audience')} />
        {split.mine ? <SheetRow danger icon={(c) => <Trash2 size={22} color={c} />} label={words.money.split.menu.delete} onPress={() => setOpen('delete')} /> : null}
      </Sheet>
      <Sheet visible={open === 'rename'} onClose={() => setOpen(null)} title={words.money.split.menu.rename}>
        <View style={{ gap: 10, paddingTop: 6, paddingHorizontal: layout.rowGutter }}>
          <Field label={words.money.split.renameTitle} value={typed} onChangeText={setTyped} maxLength={120} autoFocus error={renameFailed?.fields.title ?? (rename.isError ? messageFor(rename.error) : null)} />
          <Button label={words.things.save} size="lg" block disabled={typed.trim().length === 0} loading={rename.isPending} onPress={() => rename.mutate()} />
        </View>
      </Sheet>
      <AudienceSheet thingId={split.id} visible={open === 'audience'} onClose={() => setOpen(null)} />
      <ConfirmSheet
        visible={open === 'delete'}
        onClose={() => setOpen(null)}
        title={words.money.split.deleteAsk.title}
        body={words.money.split.deleteAsk.body}
        confirm={words.money.split.deleteAsk.confirm}
        busy={remove.isPending}
        problem={remove.isError ? messageFor(remove.error) : null}
        onConfirm={() => remove.mutate()}
      />
    </>
  );
}

/** One of the payments that settle it: who pays whom, and how much. Pressing the row marks it as made; "Remind" is there when the person is the one owed. */
function SettleRow({ toPay, currency, canEdit, reminding, onPress, onRemind }: { toPay: ToPayResponse; currency: string; canEdit: boolean; reminding: boolean; onPress: () => void; onRemind: () => void }) {
  const { colors } = useTheme();
  const from = firstName(toPay.from.name);
  const to = firstName(toPay.to.name);
  const line = toPay.paysYou ? words.money.split.paysYou(from) : toPay.youPay ? words.money.split.youPay(to) : words.money.split.pays(from, to);
  const amount = formatMoney(toPay.cents, currency);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 50, paddingVertical: 8, paddingHorizontal: layout.rowGutter }}>
      <Tap accessibilityRole="button" accessibilityLabel={words.common.spoken([line, amount, words.money.split.payment.confirm])} disabled={!canEdit} onPress={onPress} scaleTo={0.99} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Avatar uri={toPay.from.avatarUrl} name={toPay.from.name ?? ''} size={34} />
        <ChevronRight size={16} color={colors.muted} />
        <Avatar uri={toPay.to.avatarUrl} name={toPay.to.name ?? ''} size={34} />
        <Txt variant="control" weight={600} numberOfLines={1} style={{ flex: 1, marginLeft: 4 }}>
          {line}
        </Txt>
        <Amount>{amount}</Amount>
      </Tap>
      {toPay.paysYou && canEdit ? <Button label={toPay.remindedAt ? words.money.split.reminded : words.money.split.remind} spoken={words.money.split.remindSpoken(from)} variant="soft" size="sm" inline loading={reminding} onPress={onRemind} /> : null}
    </View>
  );
}

/** An expense as a row: its emoji, what it was, who paid and how it is split, and what it cost. */
function ExpenseRow({ expense, currency, onPress }: { expense: ExpenseResponse; currency: string; onPress?: () => void }) {
  const line = expenseLine(expense);
  const amount = formatMoney(expense.amountCents, currency);
  const content = (
    <>
      <EmojiTile emoji={expense.emoji || '🧾'} />
      <View style={{ flex: 1, gap: 3 }}>
        <Txt variant="item" numberOfLines={1}>
          {expense.title}
        </Txt>
        <Txt variant="footnote" color="muted" numberOfLines={1}>
          {line}
        </Txt>
      </View>
      <Amount>{amount}</Amount>
    </>
  );
  const frame = { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 58, paddingVertical: 7, paddingHorizontal: layout.rowGutter } as const;
  if (!onPress) return <View style={frame}>{content}</View>;
  return (
    <Tap accessibilityRole="button" accessibilityLabel={words.money.split.expense.spoken(expense.title, line, amount)} onPress={onPress} scaleTo={0.99} style={frame}>
      {content}
    </Tap>
  );
}

/** A payment that was made: who paid whom, when, and how much. Pressing it takes it back. */
function PaidRow({ payment, currency, youId, onPress }: { payment: PaymentResponse; currency: string; youId?: string; onPress?: () => void }) {
  const { colors } = useTheme();
  const name = (person: PaymentResponse['from']) => (person.memberId && person.memberId === youId ? words.money.split.you : firstName(person.name));
  const from = payment.from.memberId && payment.from.memberId === youId ? words.money.split.You : firstName(payment.from.name);
  const line = words.money.split.paidLine(from, name(payment.to));
  const amount = formatMoney(payment.amountCents, currency);
  const content = (
    <>
      <Avatar uri={payment.from.avatarUrl} name={payment.from.name ?? ''} size={34} />
      <View style={{ flex: 1 }}>
        <Txt variant="control" weight={600} numberOfLines={1}>
          {line}
        </Txt>
        <Txt variant="footnote" color="muted">
          {formatDay(payment.paidOn)}
        </Txt>
      </View>
      <Amount color={colors.muted}>{amount}</Amount>
    </>
  );
  const frame = { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 50, paddingVertical: 7, paddingHorizontal: layout.rowGutter } as const;
  if (!onPress) return <View style={frame}>{content}</View>;
  return (
    <Tap accessibilityRole="button" accessibilityLabel={words.common.spoken([line, amount, words.money.split.payment.takeBackAsk.confirm])} onPress={onPress} scaleTo={0.99} style={frame}>
      {content}
    </Tap>
  );
}

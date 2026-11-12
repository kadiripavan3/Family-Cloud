import { useMutation } from '@tanstack/react-query';
import { Check, Trash2 } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { TextInput, View } from 'react-native';

import { useCache } from '@/api/cache';
import { ApiError, messageFor } from '@/api/fetcher';
import { addSplitExpense, changeSplitExpense, type ExpenseResponse, removeSplitExpense, type ShareMode, type ShareRequest, type SplitResponse } from '@/api/generated/homeport';
import { today } from '@/lib/dates';
import { newClientId } from '@/lib/ids';
import { formatMoney, moneyToType, parseMoney } from '@/lib/money';
import { firstName } from '@/lib/names';
import { layout, radius, textStyle, useTheme } from '@/theme';
import { Avatar } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { ConfirmSheet } from '@/ui/ConfirmSheet';
import { Field } from '@/ui/Field';
import { Tap } from '@/ui/Motion';
import { Segmented } from '@/ui/Segmented';
import { Sheet, SheetRow } from '@/ui/Sheet';
import { MAX_TEXT_SCALE, Txt } from '@/ui/Txt';
import { webNoOutline } from '@/ui/web';
import { words } from '@/words';

import { ChoiceChips, FormLabel, Trouble } from '../parts';

const MODES: readonly ShareMode[] = ['equal', 'shares', 'exact'];

type Props = {
  split: SplitResponse;
  visible: boolean;
  onClose: () => void;
  /** The expense to change. Left out: a new one, paid by the person adding it. */
  expense?: ExpenseResponse;
};

/**
 * Adding what someone paid to a split, and changing an expense: what it was, how much, who paid, and who
 * shares it. Shared equally, the API works out each part; by shares, each person gets a number of shares;
 * with exact amounts, each one's part is typed and must add up to what it cost. The app never works out
 * what anybody owes: that comes back from the API.
 */
export function ExpenseSheet(props: Props) {
  // Each time it opens it starts from the expense as it is now, or empty.
  return props.visible ? <Open key={props.expense?.id ?? 'new'} {...props} /> : null;
}

function Open({ split, onClose, expense }: Props) {
  const { colors } = useTheme();
  const cache = useCache();
  const people = split.people.map((one) => ({ id: one.person.memberId ?? '', name: one.you ? words.money.split.You : firstName(one.person.name), avatarUrl: one.person.avatarUrl, you: one.you }));
  const me = people.find((one) => one.you);
  const [title, setTitle] = useState(expense?.title ?? '');
  const [amount, setAmount] = useState(moneyToType(expense?.amountCents));
  const [paidBy, setPaidBy] = useState(expense?.paidBy?.memberId ?? me?.id ?? people[0]?.id ?? '');
  const [mode, setMode] = useState<ShareMode>(expense?.mode ?? 'equal');
  const [sharers, setSharers] = useState<readonly string[]>(expense ? expense.shares.flatMap((share) => (share.person.memberId ? [share.person.memberId] : [])) : people.map((one) => one.id));
  /** What is typed beside each person: a number of shares, or an amount. */
  const [typed, setTyped] = useState<Record<string, string>>(() =>
    Object.fromEntries((expense && expense.mode !== 'equal' ? expense.shares : []).flatMap((share) => (share.person.memberId ? [[share.person.memberId, expense?.mode === 'exact' ? moneyToType(share.cents) : String(share.weight)]] : []))),
  );
  const [removing, setRemoving] = useState(false);
  const clientId = useRef(newClientId());

  const cents = parseMoney(amount);
  const shares: ShareRequest[] | null = (() => {
    const out: ShareRequest[] = [];
    for (const memberId of sharers) {
      if (mode === 'equal') out.push({ memberId });
      else if (mode === 'shares') {
        const weight = Number(typed[memberId] ?? '1');
        if (!Number.isInteger(weight) || weight < 1) return null;
        out.push({ memberId, weight });
      } else {
        const part = parseMoney(typed[memberId] ?? '');
        if (part === null || part <= 0) return null;
        out.push({ memberId, cents: part });
      }
    }
    return out.length ? out : null;
  })();
  // For exact amounts: how far what is typed is from what it cost. Whole cents, as typed; the API checks it again.
  const shared = mode === 'exact' ? sharers.reduce((sum, memberId) => sum + (parseMoney(typed[memberId] ?? '') ?? 0), 0) : null;
  const left = shared === null || cents === null ? null : cents - shared;
  const ready = title.trim().length > 0 && cents !== null && cents > 0 && shares !== null && (left === null || left === 0);

  const save = useMutation({
    mutationFn: () => {
      const everyone = mode === 'equal' && sharers.length === people.length;
      const body = { title: title.trim(), amountCents: cents ?? 0, paidBy, mode, shares: shares ?? [] };
      if (expense) return changeSplitExpense(expense.id, body);
      return addSplitExpense(split.id, { ...body, clientId: clientId.current, shares: everyone ? undefined : body.shares }, { day: today() });
    },
    onSuccess: () => {
      void cache.splitChanged(split);
      onClose();
    },
  });
  const remove = useMutation({
    mutationFn: () => removeSplitExpense(expense!.id),
    onSuccess: () => {
      void cache.splitChanged(split);
      setRemoving(false);
      onClose();
    },
  });
  const failed = save.error instanceof ApiError ? save.error : null;

  return (
    <>
      <Sheet
        visible
        onClose={onClose}
        title={expense ? words.money.split.expense.change : words.money.split.expense.new}
        footer={
          <View style={{ paddingTop: 12, paddingHorizontal: layout.rowGutter }}>
            <Button label={expense ? words.money.split.expense.save : words.money.split.expense.add} size="lg" block disabled={!ready} loading={save.isPending} onPress={() => save.mutate()} />
          </View>
        }>
        <View style={{ gap: 10, paddingTop: 6, paddingBottom: 12, paddingHorizontal: layout.rowGutter }}>
          <Field label={words.money.split.expense.what} value={title} onChangeText={setTitle} maxLength={120} placeholder={words.money.split.expense.whatPlaceholder} autoFocus={!expense} error={failed?.fields.title} />
          <Field label={words.money.split.expense.amount} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" maxLength={14} error={amount.trim() && cents === null ? words.money.split.expense.amountWrong : failed?.fields.amountCents} />
          <FormLabel>{words.money.split.expense.paidBy}</FormLabel>
          <ChoiceChips label={words.money.split.expense.paidBy} options={people.map((one) => ({ id: one.id, label: one.name }))} value={paidBy} onChange={setPaidBy} />
          <FormLabel>{words.money.split.expense.how}</FormLabel>
          <Segmented label={words.money.split.expense.how} options={MODES.map((id) => ({ id, label: words.money.split.expense.modes[id] }))} value={mode} onChange={setMode} style={{ marginHorizontal: 0 }} />
          <FormLabel>{words.money.split.expense.who}</FormLabel>
          <View>
            {people.map((one) => {
              const on = sharers.includes(one.id);
              return (
                <View key={one.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 }}>
                  <Tap
                    accessibilityRole="checkbox"
                    accessibilityLabel={one.name}
                    accessibilityState={{ checked: on }}
                    // Said this way, a browser hears whether it is ticked as well: the web takes no `accessibilityState`.
                    aria-checked={on}
                    onPress={() => setSharers(on ? sharers.filter((id) => id !== one.id) : [...sharers, one.id])}
                    scaleTo={0.99}
                    style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 }}>
                    <View style={{ width: 24, height: 24, borderRadius: radius.chip, alignItems: 'center', justifyContent: 'center', borderWidth: on ? 0 : 2, borderColor: colors.lineStrong, backgroundColor: on ? colors.accent : 'transparent' }}>
                      {on ? <Check size={16} color={colors.onAccent} strokeWidth={3} /> : null}
                    </View>
                    <Avatar uri={one.avatarUrl} name={one.name} size={30} />
                    <Txt variant="item" numberOfLines={1} style={{ flex: 1 }}>
                      {one.name}
                    </Txt>
                  </Tap>
                  {on && mode !== 'equal' ? (
                    <TextInput
                      accessibilityLabel={mode === 'shares' ? words.money.split.expense.sharesOf(one.name) : words.money.split.expense.amountOf(one.name)}
                      placeholder={mode === 'shares' ? '1' : '0.00'}
                      placeholderTextColor={colors.muted}
                      selectionColor={colors.accent}
                      maxFontSizeMultiplier={MAX_TEXT_SCALE}
                      keyboardType={mode === 'shares' ? 'number-pad' : 'decimal-pad'}
                      value={typed[one.id] ?? ''}
                      onChangeText={(text) => setTyped((old) => ({ ...old, [one.id]: text }))}
                      maxLength={12}
                      style={[webNoOutline, textStyle('item', 700, { oneLine: true }), { width: 96, minHeight: 38, paddingVertical: 0, paddingHorizontal: 12, borderRadius: radius.tile, textAlign: 'right', color: colors.text, backgroundColor: colors.fill }]}
                    />
                  ) : null}
                </View>
              );
            })}
          </View>
          {left === null ? null : (
            <Txt variant="caption" accessibilityLiveRegion="polite" style={{ marginHorizontal: 4, color: left === 0 ? colors.ok : colors.warn }}>
              {left === 0 ? words.money.split.expense.addsUp : left > 0 ? words.money.split.expense.left(formatMoney(left, split.currency)) : words.money.split.expense.tooMuch(formatMoney(-left, split.currency))}
            </Txt>
          )}
          <Trouble message={save.isError && !(failed?.fields.title || failed?.fields.amountCents) ? messageFor(save.error) : null} style={{ marginTop: 0, marginHorizontal: 4 }} />
        </View>
        {expense ? <SheetRow danger icon={(c) => <Trash2 size={22} color={c} />} label={words.money.split.expense.remove} onPress={() => setRemoving(true)} /> : null}
      </Sheet>
      <ConfirmSheet
        visible={removing}
        onClose={() => setRemoving(false)}
        title={words.money.split.expense.removeAsk.title}
        body={words.money.split.expense.removeAsk.body}
        confirm={words.money.split.expense.removeAsk.confirm}
        busy={remove.isPending}
        problem={remove.isError ? messageFor(remove.error) : null}
        onConfirm={() => remove.mutate()}
      />
    </>
  );
}

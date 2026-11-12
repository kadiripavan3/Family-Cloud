import { useMutation } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Calendar, Check, Image as ImageIcon, type LucideIcon, Repeat, Users, X } from 'lucide-react-native';
import { type ReactNode, useRef, useState } from 'react';
import { ScrollView, TextInput, type TextInputProps, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCache } from '@/api/cache';
import { messageFor } from '@/api/fetcher';
import { addSplitExpense, type BillReadingResponse, createBill, getBill, readBill, useGetBill, useGetSplit } from '@/api/generated/homeport';
import type { LocalPhoto } from '@/api/upload';
import { useCircle, useCircles } from '@/features/circles/current';
import { briefOf, payers } from '@/features/money/lines';
import { keepLetter, pickPaper, readRequest } from '@/features/money/pick';
import { useLeave } from '@/features/navigation/useLeave';
import { useStartsAs } from '@/features/sharing/useStartsAs';
import { thingHref } from '@/features/things/open';
import { formatDay, formatMonthName, today } from '@/lib/dates';
import { newClientId } from '@/lib/ids';
import { formatMoneyExact, moneyToType, parseMoney } from '@/lib/money';
import { darkTheme, radius, textStyle, withAlpha } from '@/theme';
import { AvoidKeyboard } from '@/ui/AvoidKeyboard';
import { Button } from '@/ui/Button';
import { DayPicker } from '@/ui/DayPicker';
import { Frost } from '@/ui/Frost';
import { LightStatusBar } from '@/ui/LightStatusBar';
import { Tap } from '@/ui/Motion';
import { RoundButton } from '@/ui/RoundButton';
import { MAX_TEXT_SCALE, Txt } from '@/ui/Txt';
import { webNoOutline } from '@/ui/web';
import { words } from '@/words';

/** This screen is dark whatever the phone is set to: it stands on a picture, or on the stage. */
const colors = darkTheme.colors;

/** What the person can still correct after the paper was read. */
type Draft = { payee: string; amount: string; dueOn: string; reference: string; iban: string; monthly: boolean; split: boolean };

function draftOf(read: BillReadingResponse): Draft {
  return {
    payee: read.payee?.value ?? '',
    amount: read.amountCents ? moneyToType(read.amountCents.value) : '',
    dueOn: read.dueOn?.value ?? today(),
    reference: read.reference?.value ?? '',
    iban: read.iban?.value ?? '',
    monthly: read.repeat?.value === 'monthly',
    split: false,
  };
}

/**
 * 8.3 Scan a bill. On a phone the camera reads the paper; that part needs the phone's own text reading and
 * isn't built, so here a picture of the paper is picked (the button at the top right) and its lines are typed
 * or pasted. The API reads who to pay, how much, by when and the reference off those lines, and says which
 * line each came from; the person corrects what is wrong, says whether it comes every month and who it is
 * split with, and adds the bill. The picture is kept in the Library, linked to the bill.
 *
 * The same screen reads a receipt into a split (`?split=<id>`: it adds an expense), and keeps the picture of
 * a letter with a bill that is there already (`?bill=<id>`).
 */
export default function ScanBill() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const leave = useLeave();
  const cache = useCache();
  const window = useWindowDimensions();
  const params = useLocalSearchParams<{ bill?: string; split?: string }>();
  const current = useCircle();
  const circles = useCircles();
  const forBill = useGetBill(params.bill ?? '', { query: { enabled: !!params.bill } }).data;
  const forSplit = useGetSplit(params.split ?? '', { query: { enabled: !!params.split } }).data;
  const circle = circles.find((one) => one.id === (forBill?.circleId ?? forSplit?.circleId)) ?? current;
  const [audience] = useStartsAs(circle);
  const others = payers(circle).filter((person) => person.id !== circle.myMemberId);

  const [photo, setPhoto] = useState<LocalPhoto | null>(null);
  const [lines, setLines] = useState('');
  const [read, setRead] = useState<BillReadingResponse | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [picking, setPicking] = useState(false);
  const clientId = useRef(newClientId());
  const letterId = useRef(newClientId());
  const set = (change: Partial<Draft>) => setDraft((old) => (old ? { ...old, ...change } : old));

  const pick = useMutation({ mutationFn: pickPaper, onSuccess: (picked) => (picked ? setPhoto(picked) : undefined) });
  const reading = useMutation({
    mutationFn: () => readBill(readRequest(lines)),
    onSuccess: (answer) => {
      setRead(answer);
      setDraft(draftOf(answer));
    },
  });
  const cents = draft ? parseMoney(draft.amount) : null;

  /** Adds the bill, and keeps the picture with it. Pressing again after something failed makes nothing twice. */
  const add = useMutation({
    mutationFn: async () => {
      if (!draft || !read || cents === null) throw new Error('nothing was read yet');
      const sharers = draft.split ? [circle.myMemberId, ...others.map((person) => person.id)] : null;
      const bill = await createBill({
        clientId: clientId.current,
        circleId: circle.id,
        title: read.title || undefined,
        payee: draft.payee.trim() || undefined,
        emoji: read.emoji || undefined,
        amountCents: cents,
        currency: read.currency,
        dueOn: draft.dueOn,
        repeat: draft.monthly ? 'monthly' : read.repeat && read.repeat.value !== 'monthly' ? read.repeat.value : 'once',
        iban: draft.iban.trim() || undefined,
        reference: draft.reference.trim() || undefined,
        // The same reminder a bill added by hand starts with.
        remindDays: 2,
        audience,
        shares: sharers?.map((memberId) => ({ memberId, weight: 1 })),
      });
      if (!photo) return bill;
      await keepLetter({ photo, billId: bill.id, circleId: bill.circleId, title: words.money.scan.invoiceTitle(formatMonthName(bill.dueOn)), text: lines, audience }, letterId.current);
      // The bill as it is now: with the picture as its invoice.
      return getBill(bill.id);
    },
    onSuccess: (bill) => {
      void cache.billMade(bill);
      router.replace(thingHref({ kind: 'bill', id: bill.id }));
    },
  });
  /** Adds what the receipt says to a split, shared equally by everyone. */
  const addExpense = useMutation({
    mutationFn: () => {
      if (!draft || !read || cents === null || !forSplit) throw new Error('nothing was read yet');
      return addSplitExpense(forSplit.id, { clientId: clientId.current, title: draft.payee.trim() || read.title, emoji: read.emoji || undefined, amountCents: cents, spentOn: draft.dueOn }, { day: today() });
    },
    onSuccess: () => {
      if (forSplit) void cache.splitChanged(forSplit);
      leave();
    },
  });
  /** Keeps the picture with a bill that is there already. */
  const keep = useMutation({
    mutationFn: async () => {
      if (!photo || !forBill) throw new Error('no picture was picked');
      await keepLetter({ photo, billId: forBill.id, circleId: forBill.circleId, title: words.money.scan.invoiceTitle(formatMonthName(forBill.dueOn)), audience: forBill.chip.audience === 'circle' ? 'circle' : 'me' }, letterId.current);
    },
    onSuccess: () => {
      if (forBill) void cache.billLinked(forBill);
      leave();
    },
  });

  const step = params.bill ? 'letter' : draft && read ? 'check' : 'lines';
  const counter = !photo ? words.money.scan.counter.pick : step === 'check' ? words.money.scan.counter.check : step === 'lines' ? words.money.scan.counter.lines : words.money.scan.counter.check;
  const problem = [pick, reading, add, addExpense, keep].find((one) => one.isError)?.error;
  const ready = !!draft && cents !== null && cents > 0 && (draft.payee.trim().length > 0 || !!read?.title);

  return (
    <View style={{ flex: 1, backgroundColor: colors.black }}>
      <LightStatusBar />
      {photo ? <Image source={{ uri: photo.uri }} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} contentFit="cover" accessible={false} /> : null}
      {/* The frame the paper goes in, with everything around it dimmed, and the line that reads down it. */}
      <View pointerEvents="none" style={{ position: 'absolute', left: 46, right: 46, top: insets.top + 70, height: 250, borderRadius: radius.cardLarge, borderWidth: 2.5, borderColor: colors.accent, boxShadow: `0 0 0 2000px ${withAlpha(colors.black, 0.42)}` }}>
        <View style={{ position: 'absolute', left: 14, right: 14, top: '46%', height: 2, borderRadius: radius.pill, backgroundColor: colors.accent, boxShadow: `0 0 14px 2px ${colors.accent}` }} />
      </View>
      <AvoidKeyboard style={{ flex: 1, justifyContent: 'flex-end' }}>
        <View style={{ maxHeight: Math.round(window.height * 0.72), paddingTop: 10, paddingBottom: Math.max(insets.bottom, 16) + 8, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, backgroundColor: colors.surface, boxShadow: darkTheme.shadow.sheet }}>
          <View style={{ alignSelf: 'center', width: 38, height: 5, borderRadius: radius.pill, marginBottom: 8, backgroundColor: colors.fill2 }} />
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {step === 'letter' ? (
              <>
                <SheetTitle>{words.money.scan.letter.title(forBill?.title ?? '')}</SheetTitle>
                <Txt variant="callout" style={{ marginTop: 2, marginHorizontal: 22, color: colors.muted }}>
                  {photo ? words.money.scan.letter.picked : words.money.scan.letter.note}
                </Txt>
              </>
            ) : step === 'lines' ? (
              <>
                <SheetTitle>{words.money.scan.lines.title}</SheetTitle>
                <Txt variant="footnote" style={{ marginTop: 2, marginBottom: 8, marginHorizontal: 22, color: colors.muted }}>
                  {words.money.scan.lines.note}
                </Txt>
                <View style={{ marginHorizontal: 16 }}>
                  <Box label={words.money.scan.lines.label} value={lines} onChangeText={setLines} multiline placeholder={words.money.scan.lines.placeholder} maxLength={8000} autoCorrect={false} />
                </View>
              </>
            ) : draft && read ? (
              <>
                <SheetTitle>{words.money.scan.check.title}</SheetTitle>
                <View style={{ gap: 10, marginTop: 6, marginHorizontal: 16 }}>
                  <Box
                    label={params.split ? words.money.scan.receipt.what : words.money.scan.check.payee}
                    value={draft.payee}
                    onChangeText={(payee) => set({ payee })}
                    from={read.payee?.line}
                    accessory={
                      read.payee && read.payee.value === draft.payee ? (
                        <View accessible accessibilityLabel={words.money.scan.check.read}>
                          <Check size={18} color={colors.ok} />
                        </View>
                      ) : undefined
                    }
                    maxLength={120}
                  />
                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    <View style={{ flex: 1 }}>
                      <Box
                        label={words.money.scan.check.amount}
                        value={draft.amount}
                        shown={cents === null ? undefined : formatMoneyExact(cents, read.currency)}
                        onChangeText={(amount) => set({ amount })}
                        from={read.amountCents?.line}
                        missing={!read.amountCents}
                        keyboardType="decimal-pad"
                        maxLength={14}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Box label={params.split ? words.money.scan.receipt.day : words.money.scan.check.due} value={formatDay(draft.dueOn)} from={read.dueOn?.line} icon={Calendar} onPress={() => setPicking(true)} />
                    </View>
                  </View>
                  {params.split ? null : (
                    <>
                      <Box label={words.money.scan.check.reference} value={draft.reference} onChangeText={(reference) => set({ reference })} from={read.reference?.line} maxLength={140} autoCorrect={false} />
                      {read.iban ? <Box label={words.money.scan.check.iban} value={draft.iban} onChangeText={(iban) => set({ iban })} from={read.iban.line} maxLength={42} autoCorrect={false} autoCapitalize="characters" /> : null}
                    </>
                  )}
                </View>
                {params.split ? null : (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12, marginHorizontal: 16 }}>
                    <Choice icon={Repeat} label={words.money.scan.monthly} on={draft.monthly} onPress={() => set({ monthly: !draft.monthly })} />
                    {others.length ? <Choice icon={Users} label={words.money.scan.splitWith(others.map((person) => briefOf(person).name ?? ''))} on={draft.split} onPress={() => set({ split: !draft.split })} /> : null}
                  </View>
                )}
              </>
            ) : null}
            {problem ? (
              <Txt variant="caption" accessibilityLiveRegion="polite" style={{ marginTop: 10, marginHorizontal: 22, color: colors.danger }}>
                {messageFor(problem)}
              </Txt>
            ) : null}
          </ScrollView>
          <View style={{ gap: 6, paddingTop: 14, paddingHorizontal: 16 }}>
            {step === 'letter' ? (
              <Button label={words.money.scan.letter.keep} size="lg" block disabled={!photo || !forBill} loading={keep.isPending} onPress={() => keep.mutate()} />
            ) : step === 'lines' ? (
              <Button label={words.money.scan.lines.read} size="lg" block disabled={lines.trim().length === 0} loading={reading.isPending} onPress={() => reading.mutate()} />
            ) : (
              <>
                {params.split ? (
                  <Button label={words.money.scan.receipt.add} size="lg" block disabled={!ready || !forSplit} loading={addExpense.isPending} onPress={() => addExpense.mutate()} />
                ) : (
                  <Button label={words.money.scan.add} size="lg" block disabled={!ready} loading={add.isPending} onPress={() => add.mutate()} />
                )}
                <Tap
                  accessibilityRole="button"
                  accessibilityLabel={words.money.scan.check.again}
                  onPress={() => {
                    setRead(null);
                    setDraft(null);
                  }}
                  style={{ alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 12 }}>
                  <Txt variant="callout" weight={700} style={{ color: colors.muted }}>
                    {words.money.scan.check.again}
                  </Txt>
                </Tap>
              </>
            )}
          </View>
        </View>
      </AvoidKeyboard>

      {/* The buttons at the top come last, so the sheet's frame, which fills the screen, doesn't lie over them. */}
      <View style={{ position: 'absolute', top: insets.top + 4, left: 16, right: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <RoundButton tone="photo" label={words.common.close} icon={(c) => <X size={20} color={c} />} onPress={leave} />
        <View style={{ paddingVertical: 9, paddingHorizontal: 14, borderRadius: radius.photo, overflow: 'hidden', borderWidth: 1, borderColor: colors.photoGlassLine, backgroundColor: colors.photoGlass }}>
          <Frost tone="dark" />
          <Txt variant="caption" weight={700} accessibilityLiveRegion="polite" style={{ color: colors.onPhoto }}>
            {counter}
          </Txt>
        </View>
        <RoundButton tone="photo" label={words.money.scan.pickPicture} icon={(c) => <ImageIcon size={20} color={c} />} onPress={() => pick.mutate()} />
      </View>

      {draft ? <DayPicker visible={picking} onClose={() => setPicking(false)} title={params.split ? words.money.scan.receipt.day : words.money.form.dueTitle} value={draft.dueOn} onChange={(dueOn) => set({ dueOn })} /> : null}
    </View>
  );
}

function SheetTitle({ children }: { children: ReactNode }) {
  return (
    <Txt variant="titleSmall" accessibilityRole="header" style={{ paddingTop: 8, paddingBottom: 4, paddingHorizontal: 22, color: colors.text }}>
      {children}
    </Txt>
  );
}

type BoxProps = Omit<TextInputProps, 'style' | 'value'> & {
  label: string;
  value: string;
  /** What stands in the box while nobody is typing in it: an amount written as money. */
  shown?: string;
  /** The line of the paper the value was read from. */
  from?: string;
  /** Nothing was found for it on the paper. */
  missing?: boolean;
  icon?: LucideIcon;
  accessory?: ReactNode;
  /** A box that opens a picker instead of the keyboard. */
  onPress?: () => void;
};

/** One of the sheet's boxes, on the dark sheet: its small label, what was read (to correct), and under it the line it was read from. */
function Box({ label, value, shown, from, missing, icon: Icon, accessory, onPress, multiline, onFocus, onBlur, ...input }: BoxProps) {
  const [focused, setFocused] = useState(false);
  const frame = { borderRadius: radius.field, borderWidth: focused ? 2 : 1.5, borderColor: focused ? colors.text : colors.lineStrong, backgroundColor: colors.bg, paddingHorizontal: focused ? 13.5 : 14, paddingTop: focused ? 6.5 : 7, paddingBottom: focused ? 7.5 : 8 } as const;
  const inside = (
    <>
      <Txt variant="small" style={{ color: colors.muted }}>
        {label}
      </Txt>
      <View style={{ flexDirection: 'row', alignItems: multiline ? 'flex-start' : 'center', gap: 8, minHeight: 23 }}>
        {Icon ? <Icon size={18} color={colors.text} /> : null}
        {onPress ? (
          <Txt variant="item" weight={600} numberOfLines={1} style={{ flex: 1, color: colors.text }}>
            {value}
          </Txt>
        ) : (
          <TextInput
            maxFontSizeMultiplier={MAX_TEXT_SCALE}
            {...input}
            accessibilityLabel={label}
            multiline={multiline}
            value={focused || !shown ? value : shown}
            placeholderTextColor={colors.muted}
            selectionColor={colors.accent}
            onFocus={(event) => {
              setFocused(true);
              onFocus?.(event);
            }}
            onBlur={(event) => {
              setFocused(false);
              onBlur?.(event);
            }}
            style={[webNoOutline, textStyle('item', 600, { oneLine: !multiline }), { flex: 1, minWidth: 0, minHeight: multiline ? 96 : 23, padding: 0, color: colors.text, textAlignVertical: multiline ? 'top' : 'center' }]}
          />
        )}
        {accessory}
      </View>
    </>
  );
  return (
    <View style={{ gap: 4 }}>
      {onPress ? (
        <Tap accessibilityRole="button" accessibilityLabel={words.common.fieldChange(label, value)} onPress={onPress} scaleTo={0.98} style={frame}>
          {inside}
        </Tap>
      ) : (
        <View style={frame}>{inside}</View>
      )}
      {from || missing ? (
        <Txt variant="tiny" weight={600} numberOfLines={2} style={{ marginHorizontal: 4, color: missing ? colors.warn : colors.muted }}>
          {from ? words.money.scan.check.from(from) : words.money.scan.check.notFound}
        </Txt>
      ) : null}
    </View>
  );
}

/** One of the two choices under the boxes: a soft chip that is on or off. */
function Choice({ icon: Icon, label, on, onPress }: { icon: LucideIcon; label: string; on: boolean; onPress: () => void }) {
  const color = on ? colors.accentText : colors.muted;
  return (
    <Tap
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked: on }}
      // Said this way, a browser hears whether it is on as well: the web takes no `accessibilityState`.
      aria-checked={on}
      hitSlop={{ top: 6, bottom: 6 }}
      onPress={onPress}
      scaleTo={0.94}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 12, borderRadius: radius.photo, backgroundColor: on ? colors.accentSoft : colors.fill }}>
      <Icon size={14} color={color} />
      <Txt variant="caption" weight={700} style={{ color }}>
        {label}
      </Txt>
    </Tap>
  );
}

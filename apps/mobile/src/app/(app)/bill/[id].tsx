import { useMutation } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Check, ChevronRight, Copy, Ellipsis, ExternalLink, Eye, KeyRound, type LucideIcon, Paperclip, Pencil, Repeat, Trash2, Users } from 'lucide-react-native';
import { type ReactNode, useState } from 'react';
import { Linking, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useCache } from '@/api/cache';
import { messageFor } from '@/api/fetcher';
import { type BillResponse, deleteThing, markBillPaid, type PaidRequest, type ShareResponse, useGetBill } from '@/api/generated/homeport';
import { comesRound, isHalves, whoPays } from '@/features/money/lines';
import { DotPill, EmojiTile, Faces, FIGURES, Trouble } from '@/features/money/parts';
import { useLeave } from '@/features/navigation/useLeave';
import { AudienceChip } from '@/features/sharing/AudienceChip';
import { AudienceSheet } from '@/features/sharing/AudienceSheet';
import { PageProblem } from '@/features/states/PageProblem';
import { useOpenThing } from '@/features/things/open';
import { daysBetween, formatDay, formatMonthShort, formatWeekday, toISODate, today } from '@/lib/dates';
import { loadState } from '@/lib/loading';
import { formatMoneyExact, formatMoneyRound, toWhole } from '@/lib/money';
import { firstName } from '@/lib/names';
import { copyText } from '@/lib/share';
import { layout, radius, useTheme } from '@/theme';
import { AppBar } from '@/ui/AppBar';
import { Avatar } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { ConfirmSheet } from '@/ui/ConfirmSheet';
import { Loading } from '@/ui/Loading';
import { Tap } from '@/ui/Motion';
import { NoteBox } from '@/ui/NoteBox';
import { RoundButton } from '@/ui/RoundButton';
import { Sheet, SheetRow } from '@/ui/Sheet';
import { Sk } from '@/ui/Skeleton';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

/** How tall the tallest bar of "the last six" is. */
const BAR = 70;

/**
 * 8.2 A bill: what is due and when, whether the person's own share is paid, the last months as bars with
 * what it usually comes to, who pays what, how it comes round, and its login and its invoice when it has
 * them. One button at the bottom marks the person's share as paid, or takes that back. Everything else
 * (changing it, marking all of it, who sees it, deleting) is behind the three dots.
 */
export default function Bill() {
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const asked = useGetBill(id);
  const load = loadState(asked);
  const bill = asked.data;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      {load.error ? (
        <>
          <AppBar />
          <PageProblem error={load.error} onRetry={load.retry} retrying={load.retrying} inset={false} />
        </>
      ) : !bill ? (
        <>
          <AppBar />
          {load.offline ? <Loading offline /> : <BillSkeleton />}
        </>
      ) : (
        <Loaded bill={bill} />
      )}
    </SafeAreaView>
  );
}

type Open = 'menu' | 'who' | 'login' | 'audience' | 'delete' | null;

function Loaded({ bill }: { bill: BillResponse }) {
  const { colors } = useTheme();
  const router = useRouter();
  const cache = useCache();
  const leave = useLeave();
  const open = useOpenThing();
  const [sheet, setSheet] = useState<Open>(null);
  const [copied, setCopied] = useState<'iban' | 'reference' | null>(null);
  /** The day that was just paid in full, when the bill has moved on to its next one: it can still be taken back. */
  const [justPaid, setJustPaid] = useState<string | null>(null);

  const mark = useMutation({
    mutationFn: (request: PaidRequest) => markBillPaid(bill.id, request),
    onSuccess: (saved, request) => {
      setJustPaid(request.paid !== false && saved.dueOn !== request.dueOn ? request.dueOn : null);
      void cache.billSaved(saved);
    },
  });
  const remove = useMutation({
    mutationFn: () => deleteThing(bill.id),
    onSuccess: () => {
      setSheet(null);
      leave();
      void cache.thingDeleted(bill);
    },
  });

  const mine = bill.myShare;
  const shared = bill.shares.length > 1;
  const halves = isHalves(bill);
  const who = whoPays(bill);
  const round = comesRound(bill);
  const someOpen = bill.shares.some((share) => !share.paid);
  const change = () => router.push({ pathname: '/money/bill', params: { id: bill.id } });
  const copy = async (what: 'iban' | 'reference', value: string) => setCopied((await copyText(value)) ? what : null);

  return (
    <>
      <AppBar title={bill.title} subtitle={bill.payee === bill.title ? undefined : bill.payee} trailing={<RoundButton label={words.things.more} icon={(c) => <Ellipsis size={20} color={c} />} onPress={() => setSheet('menu')} />} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 16 }}>
        <View style={{ alignItems: 'center', gap: 4, marginTop: 2, marginBottom: 14, marginHorizontal: layout.rowGutter }}>
          <View style={{ marginBottom: 6 }}>
            <EmojiTile emoji={bill.emoji} size={60} />
          </View>
          <Txt variant="hero" style={FIGURES}>
            {formatMoneyExact(bill.amountCents, bill.currency)}
          </Txt>
          <Txt variant="note" weight={600} color="muted" center>
            {bill.paid ? words.money.bill.paidOn(formatDay(bill.paidAt ? toISODate(new Date(bill.paidAt)) : bill.dueOn)) : words.money.bill.due(daysBetween(today(), bill.dueOn), formatWeekday(bill.dueOn))}
          </Txt>
          <View style={{ marginTop: 6 }}>
            {bill.paid ? (
              <DotPill tone="ok" label={words.money.bill.pill.paid} />
            ) : mine && shared ? (
              <DotPill tone={mine.paid ? 'ok' : 'warn'} label={mine.paid ? words.money.bill.pill.minePaid(halves) : words.money.bill.pill.mineOpen(halves)} />
            ) : (
              <DotPill tone="warn" label={words.money.bill.pill.open} />
            )}
          </View>
        </View>

        {bill.history.length > 1 ? <History bill={bill} /> : null}

        <Card style={{ marginHorizontal: layout.barGutter, borderRadius: radius.card, overflow: 'hidden' }}>
          <InfoRow first icon={Users} title={who.title} note={who.note} onPress={() => setSheet('who')} trailing={shared ? <Faces people={bill.shares.map((share) => share.person)} ring={colors.surface} /> : undefined} />
          <InfoRow icon={Repeat} title={round.title} note={round.note} onPress={bill.canEdit ? change : undefined} />
          {bill.login ? (
            <InfoRow icon={KeyRound} title={words.money.bill.login.title(firstName(bill.payee) || bill.title)} note={words.money.bill.login.note} onPress={() => open(bill.login!)} />
          ) : (
            <InfoRow quiet icon={KeyRound} title={words.money.bill.login.none} note={words.money.bill.login.noneNote} onPress={() => setSheet('login')} />
          )}
          {bill.invoice ? (
            <InfoRow icon={Paperclip} title={bill.invoice.title?.trim() || words.things.kind('document').name} note={words.money.bill.invoice.note} onPress={() => open(bill.invoice!)} />
          ) : (
            <InfoRow quiet icon={Paperclip} title={words.money.bill.invoice.none} note={words.money.bill.invoice.noneNote} onPress={bill.canEdit ? () => router.push({ pathname: '/money/scan', params: { bill: bill.id } }) : undefined} />
          )}
        </Card>

        {justPaid ? (
          <NoteBox soft icon={(c) => <Check size={20} color={c} />} style={{ alignItems: 'center', marginTop: 12, marginHorizontal: layout.barGutter }} trailing={<Button label={words.money.bill.takeBack} variant="soft" size="sm" inline loading={mark.isPending} onPress={() => mark.mutate({ dueOn: justPaid, paid: false })} />}>
            {words.money.bill.dueAgain(formatWeekday(bill.dueOn))}
          </NoteBox>
        ) : null}
        <Trouble message={mark.isError ? messageFor(mark.error) : null} />
        {bill.canEdit ? null : (
          <Txt variant="footnote" color="muted" style={{ marginTop: 14, marginHorizontal: layout.gutter }}>
            {words.money.bill.viewOnly}
          </Txt>
        )}
      </ScrollView>

      {bill.canEdit && !justPaid ? (
        <View style={{ paddingTop: 12, paddingBottom: 12, paddingHorizontal: layout.rowGutter }}>
          {bill.paid || mine?.paid ? (
            <Button label={words.money.bill.notPaidAfterAll} variant="soft" size="lg" block loading={mark.isPending} onPress={() => mark.mutate({ dueOn: bill.dueOn, paid: false })} />
          ) : (
            <Button label={mine && shared ? words.money.bill.markMine(halves) : words.money.bill.mark} size="lg" block loading={mark.isPending} icon={(c) => <Check size={19} color={c} strokeWidth={2.4} />} onPress={() => mark.mutate({ dueOn: bill.dueOn })} />
          )}
        </View>
      ) : null}

      <Sheet visible={sheet === 'menu'} onClose={() => setSheet(null)}>
        {bill.canEdit ? (
          <SheetRow
            first
            icon={(c) => <Pencil size={22} color={c} />}
            label={words.money.bill.menu.change}
            onPress={() => {
              setSheet(null);
              change();
            }}
          />
        ) : null}
        {bill.canEdit && shared && someOpen ? (
          <SheetRow
            icon={(c) => <Check size={22} color={c} />}
            label={words.money.bill.menu.markAll}
            onPress={() => {
              setSheet(null);
              mark.mutate({ dueOn: bill.dueOn, everyone: true });
            }}
          />
        ) : null}
        <SheetRow first={!bill.canEdit} icon={(c) => <Eye size={22} color={c} />} label={words.money.bill.menu.whoSees} trailing={<AudienceChip thing={bill} quiet />} onPress={() => setSheet('audience')} />
        {bill.iban ? <SheetRow icon={(c) => <Copy size={22} color={c} />} label={words.money.bill.menu.copyIban} note={copied === 'iban' ? words.common.copied : bill.iban} onPress={() => void copy('iban', bill.iban)} /> : null}
        {bill.reference ? <SheetRow icon={(c) => <Copy size={22} color={c} />} label={words.money.bill.menu.copyReference} note={copied === 'reference' ? words.common.copied : bill.reference} onPress={() => void copy('reference', bill.reference)} /> : null}
        {bill.payUrl ? <SheetRow icon={(c) => <ExternalLink size={22} color={c} />} label={words.money.bill.menu.openPayee} onPress={() => void Linking.openURL(bill.payUrl!)} /> : null}
        {bill.mine ? <SheetRow danger icon={(c) => <Trash2 size={22} color={c} />} label={words.money.bill.menu.delete} onPress={() => setSheet('delete')} /> : null}
      </Sheet>

      <Sheet visible={sheet === 'who'} onClose={() => setSheet(null)} title={words.money.bill.whoPays.title} subtitle={who.title}>
        {bill.shares.map((share, index) => (
          <ShareRow key={share.person.memberId ?? index} share={share} currency={bill.currency} canEdit={bill.canEdit && !bill.paid} busy={mark.isPending} onChange={(paid) => mark.mutate({ dueOn: bill.dueOn, memberId: share.person.memberId, paid })} />
        ))}
        {bill.canEdit && shared && someOpen && !bill.paid ? (
          <View style={{ paddingTop: 12, paddingHorizontal: layout.rowGutter }}>
            <Button label={words.money.bill.whoPays.all} variant="soft" block loading={mark.isPending} onPress={() => mark.mutate({ dueOn: bill.dueOn, everyone: true })} />
          </View>
        ) : null}
        <Trouble message={mark.isError ? messageFor(mark.error) : null} />
      </Sheet>

      <Sheet visible={sheet === 'login'} onClose={() => setSheet(null)} title={words.money.bill.login.noneSheet.title} subtitle={words.money.bill.login.noneSheet.body}>
        <View style={{ paddingTop: 6, paddingHorizontal: layout.rowGutter }}>
          <Button label={words.common.ok} variant="soft" size="lg" block onPress={() => setSheet(null)} />
        </View>
      </Sheet>

      <AudienceSheet thingId={bill.id} visible={sheet === 'audience'} onClose={() => setSheet(null)} />
      <ConfirmSheet
        visible={sheet === 'delete'}
        onClose={() => setSheet(null)}
        title={words.money.bill.deleteAsk.title}
        body={words.money.bill.deleteAsk.body}
        confirm={words.money.bill.deleteAsk.confirm}
        busy={remove.isPending}
        problem={remove.isError ? messageFor(remove.error) : null}
        onConfirm={() => remove.mutate()}
      />
    </>
  );
}

/** The last times it was due, as bars: the amount over each, its month under it, this time's in the accent. */
function History({ bill }: { bill: BillResponse }) {
  const { colors } = useTheme();
  const most = Math.max(...bill.history.map((past) => past.amountCents), 1);
  const more = bill.usualCents !== null && bill.amountCents * 10 > bill.usualCents * 11;
  return (
    <View style={{ marginBottom: 14, marginHorizontal: layout.rowGutter }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
        <Txt variant="subheading">{words.money.bill.last(bill.history.length)}</Txt>
        {bill.usualCents === null ? null : (
          <Txt variant="small" weight={500} color="muted">
            {words.money.bill.usually(formatMoneyRound(bill.usualCents, bill.currency))}
          </Txt>
        )}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10, marginTop: 16 }}>
        {bill.history.map((past) => (
          <View key={past.dueOn} accessible accessibilityLabel={words.money.bill.bar(formatMonthShort(past.dueOn), formatMoneyExact(past.amountCents, bill.currency))} style={{ flex: 1, alignItems: 'stretch' }}>
            <Txt variant="tiny" weight={800} center style={[FIGURES, { marginBottom: 3 }]}>
              {words.common.number(toWhole(past.amountCents))}
            </Txt>
            <View style={{ height: Math.max(6, Math.round((BAR * past.amountCents) / most)), borderTopLeftRadius: radius.chip, borderTopRightRadius: radius.chip, backgroundColor: past.current ? colors.accent : colors.fill2 }} />
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 5 }}>
        {bill.history.map((past) => (
          <Txt key={past.dueOn} variant="tiny" color="muted" center accessible={false} style={{ flex: 1 }}>
            {formatMonthShort(past.dueOn)}
          </Txt>
        ))}
      </View>
      {more ? (
        <Txt variant="footnote" weight={700} style={{ marginTop: 10, color: colors.warn }}>
          {words.money.bill.moreThanUsual}
        </Txt>
      ) : null}
    </View>
  );
}

type RowProps = { icon: LucideIcon; title: string; note: string; first?: boolean; trailing?: ReactNode; onPress?: () => void; quiet?: boolean };

/** One line of the bill's card: an icon, a bold line over a quiet one, and an arrow (or faces) when it opens something. */
function InfoRow({ icon: Icon, title, note, first, trailing, onPress, quiet }: RowProps) {
  const { colors } = useTheme();
  const color = quiet ? colors.muted : colors.text;
  const content = (
    <>
      <Icon size={22} color={color} />
      <View style={{ flex: 1, gap: 1 }}>
        <Txt variant="item" weight={600} style={{ color }}>
          {title}
        </Txt>
        <Txt variant="footnote" color="muted">
          {note}
        </Txt>
      </View>
      {trailing ?? (onPress ? <ChevronRight size={18} color={colors.muted} /> : null)}
    </>
  );
  const frame = { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 54, paddingVertical: 14, paddingHorizontal: 16, borderTopWidth: first ? 0 : 1, borderTopColor: colors.line } as const;
  if (!onPress) return <View style={frame}>{content}</View>;
  return (
    <Tap accessibilityRole="button" accessibilityLabel={words.common.spoken([title, note])} onPress={onPress} scaleTo={0.99} style={frame}>
      {content}
    </Tap>
  );
}

/** One person's part of the bill, in the sheet that says who pays what: what it comes to, and whether it is paid. */
function ShareRow({ share, currency, canEdit, busy, onChange }: { share: ShareResponse; currency: string; canEdit: boolean; busy: boolean; onChange: (paid: boolean) => void }) {
  const name = firstName(share.person.name);
  const state = share.paid ? words.money.bill.whoPays.paid : words.money.bill.whoPays.open;
  const spoken = share.you ? (share.paid ? words.money.bill.whoPays.unmarkMine : words.money.bill.whoPays.markMine) : share.paid ? words.money.bill.whoPays.unmark(name) : words.money.bill.whoPays.mark(name);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 58, paddingVertical: 8, paddingHorizontal: layout.gutter }}>
      <Avatar uri={share.person.avatarUrl} name={share.person.name ?? ''} size={38} />
      <View style={{ flex: 1 }}>
        <Txt variant="item">{share.you ? words.money.bill.whoPays.you : name}</Txt>
        <Txt variant="footnote" color="muted" style={FIGURES}>
          {words.common.join([formatMoneyExact(share.cents, currency), state])}
        </Txt>
      </View>
      {canEdit ? <Button label={share.paid ? words.money.bill.takeBack : words.money.bill.mark} spoken={spoken} variant="soft" size="sm" inline disabled={busy} onPress={() => onChange(!share.paid)} /> : null}
    </View>
  );
}

/** Loading: grey shapes where the amount, the bars and the card will stand. */
function BillSkeleton() {
  return (
    <View accessibilityLabel={words.states.loading} style={{ alignItems: 'center', paddingHorizontal: layout.rowGutter }}>
      <Sk width={60} height={60} radius="photo" style={{ marginTop: 2 }} />
      <Sk width={190} height={40} radius="tile" style={{ marginTop: 12 }} />
      <Sk width={150} height={14} radius="chip" style={{ marginTop: 10 }} />
      <Sk height={96} radius="field" style={{ alignSelf: 'stretch', marginTop: 34 }} />
      <Sk height={236} radius="card" style={{ alignSelf: 'stretch', marginTop: 20 }} />
    </View>
  );
}

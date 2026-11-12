import { ArrowLeftRight, List as ListIcon, SlidersHorizontal, Sparkle, Star } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { View } from 'react-native';

import { messageFor } from '@/api/fetcher';
import { type PiggyBankJarResponse, type PiggyBankMoneyResponse, type PiggyBankResponse, type PiggyBankSettings, useGetBoardEntriesInfinite } from '@/api/generated/homeport';
import { paged, rows } from '@/api/pages';
import { readCents, readCount } from '@/features/plan/times';
import { BoardFrame, type MenuRow } from '@/features/templates/BoardFrame';
import { CtaBar } from '@/features/templates/parts/Bars';
import type { Board, BoardScreenProps } from '@/features/templates/types';
import { useBoardChanges } from '@/features/templates/useBoard';
import { formatDayOfYear, today } from '@/lib/dates';
import { newClientId } from '@/lib/ids';
import { layout, radius, useTheme } from '@/theme';
import { Avatar } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Field } from '@/ui/Field';
import { Loading } from '@/ui/Loading';
import { MoreButton } from '@/ui/MoreButton';
import { Tap } from '@/ui/Motion';
import { NoteBox } from '@/ui/NoteBox';
import { Segmented } from '@/ui/Segmented';
import { Sheet } from '@/ui/Sheet';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

import { Amount, ItemTile, Label, Up } from '../parts';
import { exactMoney, signedMoney, whenOf } from './money';

type Bank = Board<PiggyBankResponse, PiggyBankSettings>;
type Jar = 'spend' | 'save' | 'give';
type Kind = 'in' | 'out' | 'move';
const say = words.perks.piggyBank;
const PIG = '🐷';
const BOUGHT = '🛒';
const COINS = '💰';
const JARS: readonly Jar[] = ['spend', 'save', 'give'];
const isJar = (jar: string): jar is Jar => JARS.includes(jar as Jar);
const nameOf = (jar: string) => (isJar(jar) ? say.jars[jar] : jar);

/**
 * 16.2 The piggy bank. Pocket money in three jars, kept count of by the grown-ups: it isn't a bank account,
 * and the page says so under the total. Save earns interest at a rate the parents choose, paid on the first
 * of the month; a fund ("Skates fund") fills with the stars that money stands for. Only the grown-ups pay
 * in, take out and move; everyone who sees it sees all of it.
 */
export function PiggyBank({ board }: BoardScreenProps<PiggyBankResponse, PiggyBankSettings>) {
  const view = board.view;
  const money = (cents: number) => exactMoney(cents, view.currency);
  const [paying, setPaying] = useState<{ kind: Kind; jar: Jar } | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [rules, setRules] = useState(false);
  const [all, setAll] = useState(false);
  const opened = view.lately.find((one) => one.id !== null && one.id === openId) ?? null;
  const child = view.child?.name ?? '';

  const menu: MenuRow[] = [
    { icon: (color) => <ListIcon size={20} color={color} />, label: say.all.title, onPress: () => setAll(true) },
    ...(view.canChange ? [{ icon: (color: string) => <SlidersHorizontal size={20} color={color} />, label: say.rules.title, onPress: () => setRules(true) }] : []),
  ];

  return (
    <BoardFrame
      board={board}
      title={board.title}
      chip="menu"
      menu={menu}
      floating={
        <CtaBar title={view.fund ? say.fund.title(view.fund.name, view.fund.percent) : say.noFund.title(child)} line={view.fund ? say.fund.toGo(view.fund.starsToGo) : say.noFund.line}>
          {view.canChange ? <Button label={say.payIn} size="sm" inline onPress={() => setPaying({ kind: 'in', jar: 'save' })} /> : null}
        </CtaBar>
      }>
      <View accessible accessibilityRole="header" accessibilityLabel={words.common.spoken([money(view.totalCents), say.notABank])} style={{ alignItems: 'center', gap: 4, marginTop: 2, marginHorizontal: layout.rowGutter, marginBottom: 14 }}>
        <View style={{ marginBottom: 6 }}>
          <ItemTile emoji={board.emoji || PIG} size={60} />
        </View>
        <Txt variant="displayLarge" style={{ fontVariant: ['tabular-nums'] }}>
          {money(view.totalCents)}
        </Txt>
        <Txt variant="note" weight={600} color="muted" center>
          {say.notABank}
        </Txt>
      </View>

      <View style={{ flexDirection: 'row', gap: 10, marginHorizontal: layout.barGutter, marginBottom: 14 }}>
        {view.jars.map((jar) => (
          // The jar the bank pays interest on, and the fund fills, is the one with the dark edge.
          <JarCard key={jar.jar} jar={jar} money={money(jar.cents)} on={jar.jar === 'save'} onPress={view.canChange && isJar(jar.jar) ? () => setPaying({ kind: 'in', jar: jar.jar as Jar }) : undefined} />
        ))}
      </View>

      {view.interestPercent > 0 ? (
        <NoteBox soft icon={(color) => <Sparkle size={20} color={color} />} title={say.interest.title(view.interestPercent)} style={{ marginHorizontal: layout.barGutter }}>
          {view.lastInterest ? say.interest.arrived(money(view.lastInterest.cents), formatDayOfYear(view.lastInterest.day)) : say.interest.first(view.nextInterestOn ? formatDayOfYear(view.nextInterestOn) : null)}
        </NoteBox>
      ) : null}

      <Label>{say.lately}</Label>
      {view.lately.length === 0 ? (
        <Txt variant="callout" color="muted" style={{ marginHorizontal: layout.gutter }}>
          {view.canChange ? say.nothingYet : say.nothingYetLooking}
        </Txt>
      ) : (
        view.lately.map((one, index) => <MoneyRow key={one.id ?? index} entry={one} currency={view.currency} onPress={one.id ? () => setOpenId(one.id) : undefined} />)
      )}

      <MoneySheet board={board} start={paying} onClose={() => setPaying(null)} />
      <EntrySheet board={board} entry={opened} onClose={() => setOpenId(null)} />
      <RulesSheet board={board} visible={rules} onClose={() => setRules(false)} />
      <AllSheet board={board} visible={all} onClose={() => setAll(false)} />
    </BoardFrame>
  );
}

/** One jar: how full it is drawn, what is in it, and its name. Pressed by a grown-up, it opens paying in, with this jar chosen. */
function JarCard({ jar, money, on, onPress }: { jar: PiggyBankJarResponse; money: string; on: boolean; onPress?: () => void }) {
  const { colors } = useTheme();
  const fill = Math.min(Math.max(jar.fill ?? 0, 0), 100);
  const name = nameOf(jar.jar);
  const content = (
    <Card style={{ alignItems: 'center', gap: 1, paddingVertical: 10, paddingHorizontal: 6, borderRadius: radius.card, borderWidth: 2, borderColor: on ? colors.text : colors.surface }}>
      <View style={{ width: 44, height: 56, marginBottom: 7, justifyContent: 'flex-end', overflow: 'hidden', borderTopLeftRadius: radius.chip, borderTopRightRadius: radius.chip, borderBottomLeftRadius: radius.thumb, borderBottomRightRadius: radius.thumb, borderWidth: 2, borderColor: colors.fill2, backgroundColor: colors.fill }}>
        <View style={{ height: `${fill}%`, backgroundColor: colors.accent }} />
      </View>
      <Txt variant="headline" weight={800} style={{ fontVariant: ['tabular-nums'] }}>
        {money}
      </Txt>
      <Txt variant="small" color="muted">
        {name}
      </Txt>
    </Card>
  );
  const spoken = say.jarSpoken(name, money, jar.fill);
  if (!onPress) {
    return (
      <View accessible accessibilityLabel={spoken} style={{ flex: 1 }}>
        {content}
      </View>
    );
  }
  return (
    <Tap accessibilityRole="button" accessibilityLabel={say.jarButton(spoken)} scaleTo={0.97} onPress={onPress} style={{ flex: 1 }}>
      {content}
    </Tap>
  );
}

/** What a line of money says under its title: the family's own words where there are some, else the day and the jar. */
function lineOf(entry: PiggyBankMoneyResponse): string {
  const jar = nameOf(entry.jar);
  const when = whenOf(entry.day);
  if (entry.kind === 'move') return words.common.join([when, say.fromTo(jar, nameOf(entry.toJar ?? '')), entry.note]);
  if (entry.kind === 'out') return entry.note ? say.noteOutOf(entry.note, jar) : words.common.join([when, say.outOf(jar)]);
  return entry.note ?? words.common.join([when, say.into(jar)]);
}

/** One thing that happened: stars on the accent's tile, a face for money from someone outside, a trolley for what was bought. */
function MoneyRow({ entry, currency, onPress }: { entry: PiggyBankMoneyResponse; currency: string; onPress?: () => void }) {
  const leading =
    entry.kind === 'interest' ? (
      <ItemTile tone="accent" icon={(color) => <Sparkle size={20} color={color} />} />
    ) : entry.stars ? (
      <ItemTile tone="accent" icon={(color) => <Star size={20} color={color} />} />
    ) : entry.fromName ? (
      <Avatar name={entry.fromName} size={44} />
    ) : entry.kind === 'move' ? (
      <ItemTile icon={(color) => <ArrowLeftRight size={20} color={color} />} />
    ) : (
      <ItemTile emoji={entry.kind === 'out' ? BOUGHT : COINS} />
    );
  const amount = entry.kind === 'move' ? exactMoney(entry.cents, currency) : signedMoney(entry.cents, currency);
  return (
    <Up
      leading={leading}
      title={entry.title}
      line={lineOf(entry)}
      spoken={words.common.spoken([entry.title, lineOf(entry), amount])}
      trailing={<Amount tone={entry.cents > 0 && entry.kind !== 'move' ? 'ok' : 'plain'}>{amount}</Amount>}
      onPress={onPress}
    />
  );
}

/** One line of money, pressed: when it was, who wrote it down, and for a grown-up the way to take it back. */
function EntrySheet({ board, entry, onClose }: { board: Bank; entry: PiggyBankMoneyResponse | null; onClose: () => void }) {
  const changes = useBoardChanges(board);
  const close = () => {
    changes.forget();
    onClose();
  };
  const amount = entry ? (entry.kind === 'move' ? exactMoney(entry.cents, board.view.currency) : signedMoney(entry.cents, board.view.currency)) : '';
  return (
    <Sheet visible={entry !== null} onClose={close} title={entry?.title} subtitle={entry ? words.common.join([amount, lineOf(entry)]) : undefined}>
      {entry ? (
        <View style={{ gap: 10, paddingTop: 6, paddingHorizontal: layout.rowGutter }}>
          <Txt variant="callout" color="muted">
            {say.entry.written(whenOf(entry.day), entry.by?.name ?? null)}
          </Txt>
          {changes.problem ? (
            <Txt variant="caption" color="danger" accessibilityLiveRegion="polite">
              {changes.problem}
            </Txt>
          ) : null}
          {board.view.canChange && entry.id && entry.kind !== 'interest' ? <Button label={say.entry.takeBack} variant="soft" size="lg" block loading={changes.busy} onPress={() => void changes.remove(entry.id!).then((gone) => (gone ? close() : undefined))} /> : null}
        </View>
      ) : null}
    </Sheet>
  );
}

/** Money in, out, or from one jar to another: which jar, how much (or how many stars), and what it was for. */
function MoneySheet({ board, start, onClose }: { board: Bank; start: { kind: Kind; jar: Jar } | null; onClose: () => void }) {
  return (
    <Sheet visible={start !== null} onClose={onClose} title={say.money.title} subtitle={say.money.lead(board.view.child?.name ?? '')}>
      {start ? <MoneyForm board={board} start={start} onClose={onClose} /> : null}
    </Sheet>
  );
}

function MoneyForm({ board, start, onClose }: { board: Bank; start: { kind: Kind; jar: Jar }; onClose: () => void }) {
  const changes = useBoardChanges(board);
  const clientId = useRef(newClientId());
  const view = board.view;
  const [kind, setKind] = useState<Kind>(start.kind);
  const [jar, setJar] = useState<Jar>(start.jar);
  const [toJar, setToJar] = useState<Jar>(start.jar === 'spend' ? 'save' : 'spend');
  const [amount, setAmount] = useState('');
  const [stars, setStars] = useState('');
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const cents = readCents(amount);
  const starCount = kind === 'in' && view.starCents ? readCount(stars) : null;
  // Stars set the amount when none is typed: the API works it out from what a star is worth.
  const hasAmount = (cents !== null && cents > 0) || (!amount.trim() && !!starCount);
  const ready = hasAmount && (kind === 'move' ? jar !== toJar : !!title.trim());
  const jarOptions = JARS.map((one) => ({ id: one, label: say.jars[one] }));

  const send = () => {
    const fields = {
      jar,
      toJar: kind === 'move' ? toJar : undefined,
      cents: cents ?? undefined,
      stars: starCount ?? undefined,
      title: title.trim() || undefined,
      note: note.trim() || undefined,
    };
    void changes.add(kind, fields, clientId.current).then((added) => (added ? onClose() : undefined));
  };

  return (
    <View style={{ gap: 12, paddingTop: 6 }}>
      <Segmented label={say.money.kind} value={kind} onChange={setKind} options={[{ id: 'in', label: say.money.kinds.in }, { id: 'out', label: say.money.kinds.out }, { id: 'move', label: say.money.kinds.move }]} />
      <View>
        <Txt variant="label" color="muted" style={{ marginBottom: 8, marginHorizontal: layout.gutter }}>
          {kind === 'in' ? say.money.intoJar : say.money.outOfJar}
        </Txt>
        <Segmented label={kind === 'in' ? say.money.intoJar : say.money.outOfJar} value={jar} onChange={setJar} options={jarOptions} />
      </View>
      {kind === 'move' ? (
        <View>
          <Txt variant="label" color="muted" style={{ marginBottom: 8, marginHorizontal: layout.gutter }}>
            {say.money.toJar}
          </Txt>
          <Segmented label={say.money.toJar} value={toJar} onChange={setToJar} options={jarOptions} />
        </View>
      ) : null}
      <View style={{ gap: 12, paddingHorizontal: layout.rowGutter }}>
        <Field label={say.money.amount} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" maxLength={10} placeholder={say.money.amountPlaceholder} error={changes.problem} note={amount.trim() && cents === null ? say.money.amountNote : null} />
        {kind === 'in' && view.starCents ? <Field label={say.money.stars} value={stars} onChangeText={(typed) => setStars(typed.replace(/\D/g, ''))} keyboardType="number-pad" maxLength={5} note={say.money.starsNote(exactMoney(view.starCents, view.currency))} /> : null}
        {kind === 'move' ? null : <Field label={kind === 'in' ? say.money.from : say.money.what} value={title} onChangeText={setTitle} maxLength={120} placeholder={kind === 'in' ? say.money.fromPlaceholder : say.money.whatPlaceholder} />}
        <Field label={say.money.note} value={note} onChangeText={setNote} maxLength={200} placeholder={say.money.notePlaceholder} />
        <Button label={say.money.save[kind]} size="lg" block disabled={!ready} loading={changes.busy} onPress={send} />
      </View>
    </View>
  );
}

/** What the bank pays and what a star is worth: the parents' own rules, changed by them alone. */
function RulesSheet({ board, visible, onClose }: { board: Bank; visible: boolean; onClose: () => void }) {
  return (
    <Sheet visible={visible} onClose={onClose} title={say.rules.title} subtitle={say.rules.lead}>
      {visible ? <Rules board={board} onClose={onClose} /> : null}
    </Sheet>
  );
}

function Rules({ board, onClose }: { board: Bank; onClose: () => void }) {
  const changes = useBoardChanges(board);
  const settings = board.settings;
  const [percent, setPercent] = useState(String(settings.interestPercent));
  const [star, setStar] = useState(settings.starCents ? (settings.starCents / 100).toFixed(2) : '');
  const [fund, setFund] = useState(settings.fund?.name ?? '');
  const [fundStars, setFundStars] = useState(settings.fund ? String(settings.fund.stars) : '');
  const rate = readCount(percent);
  const starCents = star.trim() ? readCents(star) : null;
  const stars = readCount(fundStars);
  const ready = rate !== null && rate <= 100 && (!star.trim() || (starCents !== null && starCents > 0)) && (!fund.trim() || (stars !== null && stars > 0));
  const save = () =>
    void changes
      .set({ interestPercent: rate, ...(starCents ? { starCents } : {}), fund: fund.trim() && stars ? { name: fund.trim(), stars } : null })
      .then((saved) => (saved ? onClose() : undefined));
  return (
    <View style={{ gap: 12, paddingTop: 6, paddingHorizontal: layout.rowGutter }}>
      <Field label={say.rules.interest} value={percent} onChangeText={(typed) => setPercent(typed.replace(/\D/g, ''))} keyboardType="number-pad" maxLength={3} note={say.rules.interestNote} error={changes.problem} />
      <Field label={say.rules.star} value={star} onChangeText={setStar} keyboardType="decimal-pad" maxLength={8} placeholder={say.rules.starPlaceholder} />
      <Field label={say.rules.fund} value={fund} onChangeText={setFund} maxLength={80} placeholder={say.rules.fundPlaceholder} />
      <Field label={say.rules.fundStars} value={fundStars} onChangeText={(typed) => setFundStars(typed.replace(/\D/g, ''))} keyboardType="number-pad" maxLength={6} />
      <Button label={say.rules.save} size="lg" block disabled={!ready} loading={changes.busy} onPress={save} />
    </View>
  );
}

/** Everything that ever happened in the piggy bank, newest first, a page at a time: the interest too. */
function AllSheet({ board, visible, onClose }: { board: Bank; visible: boolean; onClose: () => void }) {
  const asked = useGetBoardEntriesInfinite(board.id, { day: today() }, { query: { ...paged, enabled: visible } });
  // One template's list holds that template's own: in a piggy bank every entry is a line of money.
  const lines = rows(asked.data) as PiggyBankMoneyResponse[] | undefined;
  return (
    <Sheet visible={visible} onClose={onClose} title={say.all.title} tall>
      {asked.isError && !lines ? (
        <Txt variant="callout" color="muted" center style={{ padding: 32 }}>
          {messageFor(asked.error)}
        </Txt>
      ) : !lines ? (
        <View style={{ minHeight: 200 }}>
          <Loading />
        </View>
      ) : lines.length === 0 ? (
        <Txt variant="callout" color="muted" center style={{ padding: 32 }}>
          {say.nothingYetLooking}
        </Txt>
      ) : (
        <View>
          {lines.map((one, index) => (
            <MoneyRow key={one.id ?? index} entry={one} currency={board.view.currency} />
          ))}
          <MoreButton pages={asked} />
        </View>
      )}
    </Sheet>
  );
}

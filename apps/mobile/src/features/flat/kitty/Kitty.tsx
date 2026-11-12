import { Euro, History, ImagePlus, ListChecks, Repeat, ShoppingCart, Undo2, Wallet, X } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { View } from 'react-native';

import { messageFor } from '@/api/fetcher';
import { type KittyLineResponse, type KittySettings, type KittyViewResponse, useGetBoardEntriesInfinite } from '@/api/generated/homeport';
import { paged, rows } from '@/api/pages';
import { readCents } from '@/features/plan/times';
import { BoardFrame, type MenuRow } from '@/features/templates/BoardFrame';
import { type LocalPhoto, pickPhoto, uploadPhoto } from '@/features/templates/media';
import type { Board, BoardScreenProps } from '@/features/templates/types';
import { useBoardChanges } from '@/features/templates/useBoard';
import { formatDayLong, today } from '@/lib/dates';
import { newClientId } from '@/lib/ids';
import { formatMoney } from '@/lib/money';
import { layout, radius, useTheme } from '@/theme';
import { Avatar } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { Chip } from '@/ui/Chip';
import { Emoji } from '@/ui/Emoji';
import { Field } from '@/ui/Field';
import { GroupLabel } from '@/ui/Heading';
import { Loading } from '@/ui/Loading';
import { MoreButton } from '@/ui/MoreButton';
import { Tap } from '@/ui/Motion';
import { NoteBox } from '@/ui/NoteBox';
import { Photo } from '@/ui/Photo';
import { RoundButton } from '@/ui/RoundButton';
import { Sheet } from '@/ui/Sheet';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

import { recentDay } from '../days';
import { LowChips } from '../LowChips';
import { exactMoney, signedMoney } from '../money';
import { called, calledAll, isMe, useFlat } from '../people';
import { potRows, type PotRow } from './lines';

type Pot = Board<KittyViewResponse, KittySettings>;
const say = words.flat.kitty;
const POT = '💰';
const SHOPPING = '🛒';

/**
 * 18.3 The kitty. A shared pot for the things nobody wants to count. What it holds, who hasn't paid in yet,
 * the flat's usual things as chips (a tap says one is running low, and it joins the list of whoever's turn
 * it is to shop), whose turn that is, and the month's money in and out. Paying in, what was bought (with a
 * photo of the receipt), the usual things and what each pays in are one tap away, on the page while they
 * are due and under More always.
 */
export function Kitty({ board }: BoardScreenProps<KittyViewResponse, KittySettings>) {
  const { colors } = useTheme();
  const changes = useBoardChanges(board);
  const { me } = useFlat(board.circleId);
  const view = board.view;
  const [sheet, setSheet] = useState<'bought' | 'usual' | 'each' | 'all' | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const potLines = potRows(view.lines);
  const opened = potLines.find((row) => row.id === openId) ?? null;
  const owes = board.canEdit && view.eachCents > 0 && view.notPaidIn.some((person) => isMe(person, me));
  const waiting = calledAll(view.notPaidIn, me);

  const menu: MenuRow[] = board.canEdit
    ? [
        { icon: (color) => <ShoppingCart size={20} color={color} />, label: say.bought.open, onPress: () => setSheet('bought') },
        view.youPaidIn && view.yourPayInId
          ? { icon: (color) => <Undo2 size={20} color={color} />, label: say.takeBack(view.monthName), onPress: () => void changes.remove(view.yourPayInId!) }
          : { icon: (color) => <Wallet size={20} color={color} />, label: say.payIn(formatMoney(view.eachCents, view.currency), view.monthName), onPress: () => void changes.add('in', {}) },
        { icon: (color) => <ListChecks size={20} color={color} />, label: say.usual.open, onPress: () => setSheet('usual') },
        { icon: (color) => <Euro size={20} color={color} />, label: say.each.open, onPress: () => setSheet('each') },
        { icon: (color) => <History size={20} color={color} />, label: say.all.open, onPress: () => setSheet('all') },
      ]
    : [{ icon: (color) => <History size={20} color={color} />, label: say.all.open, onPress: () => setSheet('all') }];

  return (
    <BoardFrame board={board} title={board.title} problem={changes.problem} menu={menu}>
      <View style={{ alignItems: 'center', gap: 4, marginTop: 2, marginHorizontal: layout.rowGutter, marginBottom: 14 }}>
        <View style={{ width: 60, height: 60, marginBottom: 6, borderRadius: radius.photo, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.fill }}>
          <Emoji char={board.emoji || POT} size={32} />
        </View>
        <Txt variant="hero" accessibilityRole="header" accessibilityLabel={view.balanceCents < 0 ? say.short(exactMoney(-view.balanceCents, view.currency)) : say.holds(exactMoney(view.balanceCents, view.currency))} style={{ fontVariant: ['tabular-nums'] }}>
          {view.balanceCents < 0 ? signedMoney(view.balanceCents, view.currency) : exactMoney(view.balanceCents, view.currency)}
        </Txt>
        <Txt variant="note" weight={600} color="muted" center>
          {words.common.join([view.eachCents > 0 ? say.each.line(formatMoney(view.eachCents, view.currency), view.payInDay) : null, view.eachCents > 0 ? say.waiting(waiting) : null]) || say.noPayingIn}
        </Txt>
        {owes ? <Button label={say.payIn(formatMoney(view.eachCents, view.currency), view.monthName)} size="sm" inline loading={changes.busy} onPress={() => void changes.add('in', {})} style={{ marginTop: 8 }} /> : null}
      </View>

      <GroupLabel style={{ marginHorizontal: layout.gutter }}>{say.low.label}</GroupLabel>
      {view.items.length ? (
        <LowChips items={view.items} onToggle={board.canEdit ? (item) => void changes.act('low', { itemId: item.id, low: !item.low }) : undefined} />
      ) : (
        <Txt variant="callout" color="muted" style={{ marginHorizontal: layout.gutter }}>
          {say.low.none}
        </Txt>
      )}

      {view.shopper ? (
        <NoteBox
          soft
          icon={(color) => <Repeat size={20} color={color} />}
          title={view.yourTurn ? say.turn.yours : say.turn.theirs(view.shopper.name ?? '')}
          trailing={view.yourTurn && board.canEdit ? <Button label={say.turn.done} size="sm" inline onPress={() => setSheet('bought')} /> : undefined}
          style={{ marginTop: 16, marginHorizontal: layout.barGutter }}>
          {view.yourTurn ? say.turn.yourList : say.turn.theirList(view.shopper.name ?? '')}
        </NoteBox>
      ) : null}

      <GroupLabel style={{ marginHorizontal: layout.gutter }}>{say.inAndOut}</GroupLabel>
      {potLines.map((row) => (
        <PotLine key={row.id} row={row} me={me} currency={view.currency} onPress={() => setOpenId(row.id)} />
      ))}
      {potLines.length === 0 ? (
        <Txt variant="callout" color="muted" style={{ marginHorizontal: layout.gutter }}>
          {say.nothingYet(view.monthName)}
        </Txt>
      ) : null}
      {view.leftOverCents !== 0 ? (
        <Tap accessibilityRole="button" accessibilityLabel={words.common.spoken([say.leftOver(view.leftOverFrom), exactMoney(view.leftOverCents, view.currency), say.all.open])} scaleTo={0.99} onPress={() => setSheet('all')} style={ROW}>
          <View style={{ width: 44, height: 44, borderRadius: radius.thumb, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentSoft }}>
            <Euro size={20} color={colors.accentText} />
          </View>
          <Txt variant="item" style={{ flex: 1 }}>
            {say.leftOver(view.leftOverFrom)}
          </Txt>
          <Amount cents={view.leftOverCents} currency={view.currency} plain />
        </Tap>
      ) : null}

      <BoughtSheet board={board} visible={sheet === 'bought'} onClose={() => setSheet(null)} />
      <UsualSheet board={board} visible={sheet === 'usual'} onClose={() => setSheet(null)} />
      <EachSheet board={board} visible={sheet === 'each'} onClose={() => setSheet(null)} />
      <AllSheet board={board} me={me} visible={sheet === 'all'} onClose={() => setSheet(null)} />
      <LineSheet board={board} me={me} row={opened} onClose={() => setOpenId(null)} />
    </BoardFrame>
  );
}

const ROW = { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 58, paddingVertical: 7, paddingHorizontal: layout.rowGutter } as const;

/** An amount at the end of a row: money in is green with a plus, money out has a minus, a sum that is neither stands plain. */
function Amount({ cents, currency, plain }: { cents: number; currency: string; plain?: boolean }) {
  const { colors } = useTheme();
  return (
    <Txt variant="item" weight={!plain && cents > 0 ? 700 : 800} numberOfLines={1} style={{ color: !plain && cents > 0 ? colors.ok : colors.text, fontVariant: ['tabular-nums'] }}>
      {plain ? exactMoney(cents, currency) : signedMoney(cents, currency)}
    </Txt>
  );
}

/** The small line under what was bought: who shopped, when, and that the receipt was kept. */
const boughtLine = (line: KittyLineResponse, me: string | null) => words.common.join([called(line.who, me), recentDay(line.day), line.receipt ? say.receiptKept : null]);

/** One row of the month: a purchase with its trolley, or a month's paying in with the pictures of who paid. */
function PotLine({ row, me, currency, onPress }: { row: PotRow; me: string | null; currency: string; onPress: () => void }) {
  const { colors } = useTheme();
  if (row.kind === 'out') {
    const { line } = row;
    return (
      <Tap accessibilityRole="button" accessibilityLabel={words.common.spoken([line.title, boughtLine(line, me), signedMoney(line.cents, currency)])} scaleTo={0.99} onPress={onPress} style={ROW}>
        <View style={{ width: 44, height: 44, borderRadius: radius.thumb, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.fill }}>
          <Emoji char={SHOPPING} size={24} />
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <Txt variant="item">{line.title}</Txt>
          <Txt variant="footnote" color="muted">
            {boughtLine(line, me)}
          </Txt>
        </View>
        <Amount cents={line.cents} currency={currency} />
      </Tap>
    );
  }
  const who = words.flat.list(calledAll(row.lines.map((line) => line.who), me));
  const faces = [...row.lines.filter((line) => isMe(line.who, me)), ...row.lines.filter((line) => !isMe(line.who, me))];
  return (
    <Tap accessibilityRole="button" accessibilityLabel={words.common.spoken([row.title, who, signedMoney(row.cents, currency)])} scaleTo={0.99} onPress={onPress} style={ROW}>
      <View style={{ flexDirection: 'row' }}>
        {faces.slice(0, 4).map((line, index) => (
          <View key={line.id} style={{ marginLeft: index === 0 ? 0 : -8 }}>
            <Avatar uri={line.who?.avatarUrl} name={line.who?.name ?? ''} size={22} ring={colors.surface} />
          </View>
        ))}
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <Txt variant="item">{row.title}</Txt>
        <Txt variant="footnote" color="muted">
          {who}
        </Txt>
      </View>
      <Amount cents={row.cents} currency={currency} />
    </Tap>
  );
}

/** A row, pressed: a purchase with its receipt (and the way to take it out, for whoever wrote it), or who paid in and when. */
function LineSheet({ board, me, row, onClose }: { board: Pot; me: string | null; row: PotRow | null; onClose: () => void }) {
  const changes = useBoardChanges(board);
  const { currency, yourPayInId } = board.view;
  const remove = (id: string) => void changes.remove(id).then((gone) => (gone ? onClose() : undefined));
  const line = row?.kind === 'out' ? row.line : null;
  return (
    <Sheet visible={row !== null} onClose={onClose} title={row?.kind === 'out' ? row.line.title : row?.title} subtitle={line ? words.common.join([called(line.who, me), formatDayLong(line.day), signedMoney(line.cents, currency)]) : undefined}>
      <View style={{ gap: 12, paddingTop: 6, paddingHorizontal: layout.rowGutter }}>
        {line?.receipt ? <Photo uri={line.receipt.url} radius="photo" style={{ height: 260 }} label={say.receipt} /> : null}
        {row?.kind === 'in'
          ? row.lines.map((one) => (
              <View key={one.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Avatar uri={one.who?.avatarUrl} name={one.who?.name ?? ''} size={34} />
                <View style={{ flex: 1 }}>
                  <Txt variant="item">{called(one.who, me)}</Txt>
                  <Txt variant="footnote" color="muted">
                    {formatDayLong(one.day)}
                  </Txt>
                </View>
                <Amount cents={one.cents} currency={currency} />
              </View>
            ))
          : null}
        {changes.problem ? (
          <Txt variant="caption" color="danger" accessibilityLiveRegion="polite">
            {changes.problem}
          </Txt>
        ) : null}
        {line && line.mine && board.canEdit ? <Button label={say.remove} variant="soft" size="lg" block loading={changes.busy} onPress={() => remove(line.id)} /> : null}
        {row?.kind === 'in' && board.canEdit && yourPayInId && row.lines.some((one) => one.id === yourPayInId) ? <Button label={say.takeMineBack} variant="soft" size="lg" block loading={changes.busy} onPress={() => remove(yourPayInId)} /> : null}
      </View>
    </Sheet>
  );
}

/** What was bought: what, what it cost, a photo of the receipt, and which of the things that were running low it covers. */
function BoughtSheet({ board, visible, onClose }: { board: Pot; visible: boolean; onClose: () => void }) {
  const { colors } = useTheme();
  const changes = useBoardChanges(board);
  const clientId = useRef(newClientId());
  const [what, setWhat] = useState('');
  const [cost, setCost] = useState('');
  const [photo, setPhoto] = useState<LocalPhoto | null>(null);
  /** The things this didn't buy, of those that are running low: they stay on the list. */
  const [left, setLeft] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const low = board.view.items.filter((item) => item.low);
  const cents = readCents(cost);

  const save = async () => {
    setProblem(null);
    setSending(true);
    try {
      const mediaId = photo ? await uploadPhoto(photo) : undefined;
      const added = await changes.add('out', { what: what.trim(), cents, mediaId, itemIds: low.filter((item) => !left.includes(item.id)).map((item) => item.id) }, clientId.current);
      if (!added) return;
      clientId.current = newClientId();
      setWhat('');
      setCost('');
      setPhoto(null);
      setLeft([]);
      onClose();
    } catch (error) {
      setProblem(messageFor(error));
    } finally {
      setSending(false);
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={say.bought.title} subtitle={say.bought.lead}>
      <View style={{ gap: 12, paddingTop: 6, paddingHorizontal: layout.rowGutter }}>
        <Field label={say.bought.what} value={what} onChangeText={setWhat} maxLength={120} placeholder={say.bought.whatPlaceholder} />
        <Field label={say.bought.cost} value={cost} onChangeText={setCost} keyboardType="decimal-pad" maxLength={12} placeholder={say.bought.costPlaceholder} error={cost.trim() && cents === null ? say.bought.badCost : null} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Tap
            accessibilityRole="button"
            accessibilityLabel={photo ? say.bought.changeReceipt : say.bought.receipt}
            hitSlop={8}
            scaleTo={0.94}
            onPress={() => void pickPhoto().then((picked) => (picked ? setPhoto(picked) : undefined)).catch(() => setProblem(words.media.photosClosed))}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 12, borderRadius: radius.photo, backgroundColor: colors.accentSoft }}>
            <ImagePlus size={16} color={colors.accentText} />
            <Txt variant="caption" weight={700} style={{ color: colors.accentText }}>
              {photo ? say.bought.changeReceipt : say.bought.receipt}
            </Txt>
          </Tap>
          {photo ? <Photo uri={photo.uri} radius="chip" style={{ width: 34, height: 34 }} label={say.bought.receiptChosen} /> : null}
        </View>
        {low.length ? (
          <View style={{ gap: 8 }}>
            <Txt variant="caption" color="muted">
              {say.bought.covers}
            </Txt>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {low.map((item) => (
                <Chip key={item.id} label={item.name} selected={!left.includes(item.id)} onPress={() => setLeft((now) => (now.includes(item.id) ? now.filter((id) => id !== item.id) : [...now, item.id]))} />
              ))}
            </View>
          </View>
        ) : null}
        {(problem ?? changes.problem) ? (
          <Txt variant="caption" color="danger" accessibilityLiveRegion="polite">
            {problem ?? changes.problem}
          </Txt>
        ) : null}
        <Button label={say.bought.save} size="lg" block disabled={!what.trim() || !cents} loading={sending || changes.busy} onPress={() => void save()} />
      </View>
    </Sheet>
  );
}

/** The flat's usual things: the chips on the page. One more is a word and a tap; one that isn't bought any more is taken off. */
function UsualSheet({ board, visible, onClose }: { board: Pot; visible: boolean; onClose: () => void }) {
  const changes = useBoardChanges(board);
  const clientId = useRef(newClientId());
  const [name, setName] = useState('');
  const add = async () => {
    if (!(await changes.add('item', { name: name.trim() }, clientId.current))) return;
    clientId.current = newClientId();
    setName('');
  };
  return (
    <Sheet visible={visible} onClose={onClose} title={say.usual.title} subtitle={say.usual.lead}>
      <View style={{ gap: 10, paddingTop: 6, paddingHorizontal: layout.rowGutter }}>
        {board.view.items.map((item) => (
          <View key={item.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 }}>
            <Txt variant="item" weight={600} style={{ flex: 1 }}>
              {item.name}
            </Txt>
            <RoundButton label={say.usual.remove(item.name)} onPress={() => void changes.remove(item.id)} icon={(color) => <X size={18} color={color} />} />
          </View>
        ))}
        <Field label={say.usual.add} value={name} onChangeText={setName} maxLength={60} placeholder={say.usual.placeholder} returnKeyType="done" onSubmitEditing={() => (name.trim() ? void add() : undefined)} error={changes.problem} />
        <Button label={say.usual.save} size="lg" block disabled={!name.trim()} loading={changes.busy} onPress={() => void add()} />
      </View>
    </Sheet>
  );
}

/** What each person pays in a month, and on which day of it. */
function EachSheet({ board, visible, onClose }: { board: Pot; visible: boolean; onClose: () => void }) {
  const changes = useBoardChanges(board);
  const [each, setEach] = useState(String(board.settings.eachCents / 100));
  const [day, setDay] = useState(String(board.settings.payInDay));
  const cents = readCents(each);
  const payInDay = /^\d{1,2}$/.test(day.trim()) ? Number(day.trim()) : null;
  const dayFits = payInDay !== null && payInDay >= 1 && payInDay <= 28;
  return (
    <Sheet visible={visible} onClose={onClose} title={say.each.title} subtitle={say.each.lead}>
      <View style={{ gap: 12, paddingTop: 6, paddingHorizontal: layout.rowGutter }}>
        <Field label={say.each.amount} value={each} onChangeText={setEach} keyboardType="decimal-pad" maxLength={12} error={each.trim() && cents === null ? say.bought.badCost : null} />
        <Field label={say.each.day} value={day} onChangeText={setDay} keyboardType="number-pad" maxLength={2} error={day.trim() && !dayFits ? say.each.badDay : changes.problem} />
        <Button label={say.each.save} size="lg" block disabled={cents === null || !dayFits} loading={changes.busy} onPress={() => void changes.set({ eachCents: cents, payInDay }).then((saved) => (saved ? onClose() : undefined))} />
      </View>
    </Sheet>
  );
}

/** Every line there ever was, newest first, a page at a time: the months before this one. */
function AllSheet({ board, me, visible, onClose }: { board: Pot; me: string | null; visible: boolean; onClose: () => void }) {
  const asked = useGetBoardEntriesInfinite(board.id, { day: today() }, { query: { ...paged, enabled: visible } });
  // One template's list holds that template's own: in a kitty every entry that is listed is a line of the pot.
  const lines = rows(asked.data) as KittyLineResponse[] | undefined;
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
          {say.all.none}
        </Txt>
      ) : (
        <View style={{ paddingTop: 6 }}>
          {lines.map((line) => (
            <View key={line.id} style={ROW}>
              <View style={{ flex: 1, gap: 3 }}>
                <Txt variant="item">{line.title}</Txt>
                <Txt variant="footnote" color="muted">
                  {words.common.join([called(line.who, me), formatDayLong(line.day), line.receipt ? say.receiptKept : null])}
                </Txt>
              </View>
              <Amount cents={line.cents} currency={board.view.currency} />
            </View>
          ))}
          <MoreButton pages={asked} />
        </View>
      )}
    </Sheet>
  );
}

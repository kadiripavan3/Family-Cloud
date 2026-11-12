import { Ban, Calendar, Check, Gift, SlidersHorizontal, Undo2, UserPlus, Users, X } from 'lucide-react-native';
import { type ReactNode, useRef, useState } from 'react';
import { View } from 'react-native';

import type { SecretSantaApartResponse, SecretSantaSettings, SecretSantaViewResponse, SecretSantaWishResponse } from '@/api/generated/homeport';
import { useCircles } from '@/features/circles/current';
import { membersOf } from '@/features/circles/members';
import { readCents } from '@/features/plan/times';
import { BoardFrame, type MenuRow } from '@/features/templates/BoardFrame';
import { AddBar } from '@/features/templates/parts/Bars';
import { PersonChips } from '@/features/templates/parts/People';
import { Arrow, BoardRow, Face } from '@/features/templates/parts/Rows';
import type { Board, BoardScreenProps } from '@/features/templates/types';
import { useBoardChanges } from '@/features/templates/useBoard';
import { useOpenThing } from '@/features/things/open';
import { addDays, formatDay, formatWeekday, today } from '@/lib/dates';
import { newClientId } from '@/lib/ids';
import { formatMoney } from '@/lib/money';
import { layout, radius, useTheme } from '@/theme';
import { Button } from '@/ui/Button';
import { ConfirmSheet } from '@/ui/ConfirmSheet';
import { DayPicker } from '@/ui/DayPicker';
import { Field, FieldButton } from '@/ui/Field';
import { GroupLabel } from '@/ui/Heading';
import { Tap } from '@/ui/Motion';
import { RowGroup } from '@/ui/Rows';
import { Sheet } from '@/ui/Sheet';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

type Santa = Board<SecretSantaViewResponse, SecretSantaSettings>;
const say = words.crew.secretSanta;

/** Which sheet is up, if any. */
type Up = 'hat' | 'apart' | 'rules' | 'undo' | null;

/**
 * 19.4 Secret Santa. The names are drawn inside the API, so nobody knows the whole list: each person is
 * shown the one name they drew, with that person's wish list, and nothing about anyone else's. The card at
 * the top is this person's alone; under it stand what everyone may know (who is in the hat, who can't draw
 * whom, when the presents are swapped) and their own wish list, which whoever drew them reads.
 */
export function SecretSanta({ board }: BoardScreenProps<SecretSantaViewResponse, SecretSantaSettings>) {
  const { colors } = useTheme();
  const view = board.view;
  const changes = useBoardChanges(board);
  const adding = useBoardChanges(board);
  const open = useOpenThing();
  const clientId = useRef(newClientId());
  const [up, setUp] = useState<Up>(null);
  const [wishId, setWishId] = useState<string | null>(null);
  const [apartId, setApartId] = useState<string | null>(null);
  const wish = view.myWishes.find((one) => one.id === wishId) ?? null;
  const apart = view.apart.find((one) => one.id === apartId) ?? null;
  const mayChange = board.canEdit && !view.drawn;

  const addWish = async (text: string) => {
    if (!(await adding.add('wish', { text }, clientId.current))) return false;
    clientId.current = newClientId();
    return true;
  };

  const menu: MenuRow[] = [
    { icon: (color) => <Users size={20} color={color} />, label: say.hat.title, onPress: () => setUp('hat') },
    ...(mayChange ? [{ icon: (color: string) => <Ban size={20} color={color} />, label: say.apart.add, onPress: () => setUp('apart') }] : []),
    ...(board.canEdit ? [{ icon: (color: string) => <SlidersHorizontal size={20} color={color} />, label: say.rules.title, onPress: () => setUp('rules') }] : []),
    ...(board.canEdit && view.drawn ? [{ icon: (color: string) => <Undo2 size={20} color={color} />, label: say.undo.label, onPress: () => setUp('undo') }] : []),
  ];

  return (
    <BoardFrame
      board={board}
      title={board.title}
      chip="menu"
      menu={menu}
      problem={changes.problem}
      footer={view.inTheHat ? <AddBar placeholder={say.wishes.add} maxLength={200} busy={adding.busy} problem={adding.problem} onSubmit={addWish} /> : undefined}>
      <YoursCard board={board} onDraw={() => void changes.act('draw')} onGot={(got) => void changes.act('got_it', { got })} busy={changes.busy} />

      <GroupLabel style={{ marginHorizontal: layout.gutter }}>{say.draw}</GroupLabel>
      <RowGroup>
        <BoardRow first leading={<Users size={22} color={colors.text} />} title={say.names(view.names.length)} line={view.drawn ? say.drawnOn(view.drawnOn ? formatDay(view.drawnOn) : null) : say.notDrawn} onPress={() => setUp('hat')} spoken={words.common.spoken([say.names(view.names.length), say.hat.spoken])} />
        {view.apart.map((pair) => (
          <BoardRow key={pair.id} leading={<Ban size={22} color={colors.text} />} title={say.apart.pair(pair.a.name ?? '', pair.b.name ?? '')} line={pair.why} onPress={mayChange ? () => setApartId(pair.id) : undefined} />
        ))}
        <SwapRow board={board} onOpen={() => (view.swapThing ? open(view.swapThing) : board.canEdit ? setUp('rules') : undefined)} />
      </RowGroup>

      {view.inTheHat ? (
        <>
          <GroupLabel style={{ marginHorizontal: layout.gutter }}>{say.wishes.title}</GroupLabel>
          {view.myWishes.length === 0 ? (
            <Txt variant="callout" color="muted" style={{ marginHorizontal: layout.gutter }}>
              {say.wishes.empty}
            </Txt>
          ) : (
            view.myWishes.map((one, index) => <WishRow key={one.id} wish={one} note={index === view.myWishes.length - 1 ? say.wishes.seenBy : null} onPress={() => setWishId(one.id)} />)
          )}
        </>
      ) : null}

      <HatSheet board={board} visible={up === 'hat'} onClose={() => setUp(null)} />
      <ApartSheet board={board} visible={up === 'apart'} onClose={() => setUp(null)} />
      <RulesSheet board={board} visible={up === 'rules'} onClose={() => setUp(null)} />
      <WishSheet board={board} wish={wish} onClose={() => setWishId(null)} />
      <PairSheet board={board} pair={apart} onClose={() => setApartId(null)} />
      <ConfirmSheet
        visible={up === 'undo'}
        onClose={() => {
          changes.forget();
          setUp(null);
        }}
        title={say.undo.title}
        body={say.undo.body}
        confirm={say.undo.confirm}
        busy={changes.busy}
        problem={changes.problem}
        onConfirm={() => void changes.act('undo_draw').then((undone) => (undone ? setUp(null) : undefined))}
      />
    </BoardFrame>
  );
}

type YoursProps = { board: Santa; onDraw: () => void; onGot: (got: boolean) => void; busy: boolean };

/**
 * The card only this person sees. Once the names are drawn: who they are buying for, the budget and that
 * person's wishes, and a tick for "I've got it" that nobody else is shown. Before the draw: how many names
 * are in the hat, and the button that draws them.
 */
function YoursCard({ board, onDraw, onGot, busy }: YoursProps) {
  const { colors } = useTheme();
  const view = board.view;
  const yours = view.yours;
  const budget = view.budgetCents > 0 ? formatMoney(view.budgetCents, view.currency) : null;

  let eyebrow: string;
  let title: string;
  let line: string;
  let button: ReactNode = null;
  if (yours) {
    eyebrow = say.yours.eyebrow;
    title = say.yours.title(yours.person.name ?? '');
    line = say.yours.line(budget, yours.person.name ?? '', yours.wishes);
    button = (
      <CardButton
        label={yours.gotIt ? say.yours.got : say.yours.gotIt}
        spoken={yours.gotIt ? say.yours.gotSpoken : say.yours.gotIt}
        pressed={yours.gotIt}
        icon={(color) => (yours.gotIt ? <Check size={19} color={color} strokeWidth={2.6} /> : <Gift size={19} color={color} strokeWidth={2.4} />)}
        onPress={() => onGot(!yours.gotIt)}
      />
    );
  } else if (view.drawn) {
    eyebrow = say.out.eyebrow;
    title = say.out.title;
    line = say.out.line;
  } else {
    eyebrow = say.before.eyebrow;
    title = say.before.title(view.names.length);
    line = say.before.line(budget);
    button = board.canEdit ? <CardButton label={say.before.draw} icon={(color) => <Gift size={19} color={color} strokeWidth={2.4} />} onPress={onDraw} disabled={busy} /> : null;
  }

  return (
    <View style={{ gap: 6, marginTop: 4, marginHorizontal: layout.barGutter, padding: 18, borderRadius: radius.panel, backgroundColor: colors.accent }}>
      <Txt variant="label" numberOfLines={1} style={{ color: colors.onAccent, opacity: 0.7 }}>
        {eyebrow}
      </Txt>
      <Txt variant="title" accessibilityRole="header" style={{ color: colors.onAccent }}>
        {title}
      </Txt>
      <Txt variant="caption" weight={500} style={{ color: colors.onAccent, opacity: 0.8 }}>
        {line}
      </Txt>
      {button ? <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>{button}</View> : null}
    </View>
  );
}

type CardButtonProps = { label: string; spoken?: string; icon: (color: string) => ReactNode; onPress: () => void; pressed?: boolean; disabled?: boolean };

/** The small dark button on the accent card: the card's colours the other way round, in light and in dark. */
function CardButton({ label, spoken, icon, onPress, pressed, disabled }: CardButtonProps) {
  const { colors } = useTheme();
  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel={spoken ?? label}
      accessibilityState={{ disabled: !!disabled }}
      aria-pressed={pressed}
      disabled={disabled}
      hitSlop={4}
      onPress={onPress}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 36, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: colors.onAccent, opacity: disabled ? 0.5 : 1 }}>
      {icon(colors.accent)}
      <Txt variant="callout" weight={700} numberOfLines={1} style={{ color: colors.accent }}>
        {label}
      </Txt>
    </Tap>
  );
}

/** When and where the presents change hands. It opens what the swap belongs to (the dinner's own board) when there is such a thing. */
function SwapRow({ board, onOpen }: { board: Santa; onOpen: () => void }) {
  const { colors } = useTheme();
  const view = board.view;
  const none = !view.swapAt && !view.swapOn;
  const opens = view.swapThing !== null || board.canEdit;
  return (
    <BoardRow
      leading={<Calendar size={22} color={colors.text} />}
      title={none ? say.swap.none : say.swap.title(view.swapAt)}
      line={none ? (board.canEdit ? say.swap.choose : null) : view.swapOn ? formatWeekday(view.swapOn) : null}
      trailing={opens ? <Arrow /> : null}
      onPress={opens ? onOpen : undefined}
    />
  );
}

/** One wish of this person's own list. The last one carries the note that says who reads the list. */
function WishRow({ wish, note, onPress }: { wish: SecretSantaWishResponse; note: string | null; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Tap accessibilityRole="button" accessibilityLabel={say.wishes.spoken(wish.text)} scaleTo={0.99} onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44, paddingVertical: 10, paddingHorizontal: layout.rowGutter }}>
      <Gift size={18} color={colors.muted} />
      <View style={{ flex: 1 }}>
        <Txt variant="lead" weight={600}>
          {wish.text}
        </Txt>
        {note ? (
          <Txt variant="footnote" color="muted" style={{ marginTop: 1 }}>
            {note}
          </Txt>
        ) : null}
      </View>
    </Tap>
  );
}

/** A wish, pressed: its writer changes the words or takes it off the list. */
function WishSheet({ board, wish, onClose }: { board: Santa; wish: SecretSantaWishResponse | null; onClose: () => void }) {
  return (
    <Sheet visible={wish !== null} onClose={onClose} title={say.wishes.change.title} subtitle={say.wishes.seenBy}>
      {wish ? <Wishing key={wish.id} board={board} wish={wish} onClose={onClose} /> : null}
    </Sheet>
  );
}

function Wishing({ board, wish, onClose }: { board: Santa; wish: SecretSantaWishResponse; onClose: () => void }) {
  const changes = useBoardChanges(board);
  const [text, setText] = useState(wish.text);
  const typed = text.trim();
  return (
    <View style={{ gap: 12, paddingTop: 6, paddingHorizontal: layout.rowGutter }}>
      <Field label={say.wishes.change.label} value={text} onChangeText={setText} maxLength={200} error={changes.problem} />
      <Button label={say.wishes.change.save} size="lg" block disabled={!typed || typed === wish.text} loading={changes.busy} onPress={() => void changes.change(wish.id, { text: typed }).then((saved) => (saved ? onClose() : undefined))} />
      <Button label={say.wishes.change.remove} variant="soft" size="lg" block onPress={() => void changes.remove(wish.id).then((gone) => (gone ? onClose() : undefined))} />
    </View>
  );
}

/**
 * Who is in the hat. Before the draw, anyone who may change the board takes a name out or puts one in
 * (someone of the circle with their own sign-in: the name they draw is shown to them alone). After it the
 * hat is closed, and the list is all there is to see: who gives to whom is nowhere.
 */
function HatSheet({ board, visible, onClose }: { board: Santa; visible: boolean; onClose: () => void }) {
  const { colors } = useTheme();
  const changes = useBoardChanges(board);
  const view = board.view;
  const circle = useCircles().find((one) => one.id === board.circleId);
  const mayChange = board.canEdit && !view.drawn;
  const inside = new Set(view.names.map((one) => one.person.memberId));
  const outside = circle ? membersOf(circle).filter((member) => member.kind === 'person' && !inside.has(member.id)) : [];
  const close = () => {
    changes.forget();
    onClose();
  };
  return (
    <Sheet visible={visible} onClose={close} title={say.hat.title} subtitle={view.drawn ? say.hat.closed : say.hat.lead}>
      <View style={{ paddingTop: 4 }}>
        {view.names.map((one) => {
          const name = one.you ? say.you : (one.person.name ?? '');
          return (
            <View key={one.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingVertical: 7, paddingHorizontal: layout.rowGutter }}>
              <Face uri={one.person.avatarUrl} name={one.person.name ?? ''} size={38} />
              <Txt variant="item" numberOfLines={1} style={{ flex: 1 }}>
                {name}
              </Txt>
              {mayChange ? (
                <Tap accessibilityRole="button" accessibilityLabel={say.hat.remove(one.person.name ?? '')} hitSlop={10} onPress={() => void changes.remove(one.id)}>
                  <X size={18} color={colors.muted} />
                </Tap>
              ) : null}
            </View>
          );
        })}
        {changes.problem ? (
          <Txt variant="caption" color="danger" accessibilityLiveRegion="polite" style={{ paddingTop: 6, paddingHorizontal: layout.gutter }}>
            {changes.problem}
          </Txt>
        ) : null}
        {mayChange && outside.length ? (
          <>
            <GroupLabel style={{ marginTop: 14, marginHorizontal: layout.gutter }}>{say.hat.add}</GroupLabel>
            <PersonChips inset people={outside} value={null} onChange={(memberId) => void changes.add('name', { memberId })} />
          </>
        ) : null}
        {mayChange && outside.length === 0 && view.names.length < 3 ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 10, paddingHorizontal: layout.gutter }}>
            <UserPlus size={18} color={colors.muted} />
            <Txt variant="footnote" color="muted" style={{ flex: 1 }}>
              {say.hat.tooFew}
            </Txt>
          </View>
        ) : null}
      </View>
    </Sheet>
  );
}

/** Two people who can't draw each other: who, and why in the crew's own words. Before the draw only. */
function ApartSheet({ board, visible, onClose }: { board: Santa; visible: boolean; onClose: () => void }) {
  return (
    <Sheet visible={visible} onClose={onClose} title={say.apart.add} subtitle={say.apart.lead}>
      {visible ? <KeepingApart board={board} onClose={onClose} /> : null}
    </Sheet>
  );
}

function KeepingApart({ board, onClose }: { board: Santa; onClose: () => void }) {
  const changes = useBoardChanges(board);
  const clientId = useRef(newClientId());
  const circle = useCircles().find((one) => one.id === board.circleId);
  const inside = new Set(board.view.names.map((one) => one.person.memberId));
  const people = circle ? membersOf(circle).filter((member) => inside.has(member.id)) : [];
  const [one, setOne] = useState<string | null>(null);
  const [other, setOther] = useState<string | null>(null);
  const [why, setWhy] = useState('');
  return (
    <View style={{ gap: 12, paddingTop: 6 }}>
      <View>
        <GroupLabel style={{ marginTop: 0, marginHorizontal: layout.gutter }}>{say.apart.one}</GroupLabel>
        <PersonChips inset people={people} value={one} onChange={setOne} />
      </View>
      <View>
        <GroupLabel style={{ marginTop: 4, marginHorizontal: layout.gutter }}>{say.apart.other}</GroupLabel>
        <PersonChips inset people={people.filter((member) => member.id !== one)} value={other} onChange={setOther} />
      </View>
      <View style={{ gap: 12, paddingHorizontal: layout.rowGutter }}>
        <Field label={say.apart.why} value={why} onChangeText={setWhy} maxLength={80} placeholder={say.apart.whyPlaceholder} error={changes.problem} />
        <Button label={say.apart.save} size="lg" block disabled={!one || !other || one === other} loading={changes.busy} onPress={() => void changes.add('apart', { memberId: one, otherMemberId: other, why: why.trim() || undefined }, clientId.current).then((added) => (added ? onClose() : undefined))} />
      </View>
    </View>
  );
}

/** A rule, pressed before the draw: it can be taken away again. */
function PairSheet({ board, pair, onClose }: { board: Santa; pair: SecretSantaApartResponse | null; onClose: () => void }) {
  const changes = useBoardChanges(board);
  const close = () => {
    changes.forget();
    onClose();
  };
  return (
    <Sheet visible={pair !== null} onClose={close} title={pair ? say.apart.pair(pair.a.name ?? '', pair.b.name ?? '') : undefined} subtitle={pair?.why ?? undefined}>
      {pair ? (
        <View style={{ gap: 10, paddingTop: 6, paddingHorizontal: layout.rowGutter }}>
          {changes.problem ? (
            <Txt variant="caption" color="danger" accessibilityLiveRegion="polite">
              {changes.problem}
            </Txt>
          ) : null}
          <Button label={say.apart.remove} variant="soft" size="lg" block loading={changes.busy} onPress={() => void changes.remove(pair.id).then((gone) => (gone ? close() : undefined))} />
        </View>
      ) : null}
    </Sheet>
  );
}

/** The budget and the swap: the most a present should cost, the day the presents change hands, and where, in the crew's words. */
function RulesSheet({ board, visible, onClose }: { board: Santa; visible: boolean; onClose: () => void }) {
  return (
    <Sheet visible={visible} onClose={onClose} title={say.rules.title} subtitle={say.rules.lead}>
      {visible ? <Ruling board={board} onClose={onClose} /> : null}
    </Sheet>
  );
}

function Ruling({ board, onClose }: { board: Santa; onClose: () => void }) {
  const changes = useBoardChanges(board);
  const view = board.view;
  const [budget, setBudget] = useState(view.budgetCents > 0 ? String(view.budgetCents / 100) : '');
  const [swapOn, setSwapOn] = useState<string | null>(view.swapOn);
  const [swapAt, setSwapAt] = useState(view.swapAt ?? '');
  const [picking, setPicking] = useState(false);
  const [tried, setTried] = useState(false);
  const cents = budget.trim() === '' ? 0 : readCents(budget);

  const save = async () => {
    setTried(true);
    if (cents === null) return;
    if (await changes.set({ budgetCents: cents, swapOn, swapAt: swapAt.trim() || null })) onClose();
  };

  return (
    <View style={{ gap: 12, paddingTop: 6, paddingHorizontal: layout.rowGutter }}>
      <Field label={say.rules.budget} value={budget} onChangeText={setBudget} keyboardType="decimal-pad" placeholder={say.rules.budgetPlaceholder} error={tried && cents === null ? say.rules.budgetProblem : null} />
      <View style={{ flexDirection: 'row' }}>
        <FieldButton label={say.rules.swapOn} value={swapOn ? formatWeekday(swapOn) : say.rules.choose} onPress={() => setPicking(true)} />
      </View>
      <Field label={say.rules.swapAt} value={swapAt} onChangeText={setSwapAt} maxLength={80} placeholder={say.rules.swapAtPlaceholder} />
      {changes.problem ? (
        <Txt variant="caption" color="danger" accessibilityLiveRegion="polite">
          {changes.problem}
        </Txt>
      ) : null}
      <Button label={say.rules.save} size="lg" block loading={changes.busy} onPress={() => void save()} />
      <DayPicker visible={picking} onClose={() => setPicking(false)} title={say.rules.swapOn} value={swapOn ?? addDays(today(), 14)} min={today()} onChange={setSwapOn} />
    </View>
  );
}

import { Check, ChevronLeft, ChevronRight, Plus, Shield } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { View } from 'react-native';

import type { MemberResponse, WhoseTurnResponse, WhoseTurnSettings, WhoseTurnThingResponse } from '@/api/generated/homeport';
import { useCircles } from '@/features/circles/current';
import { membersOf } from '@/features/circles/members';
import { BoardFrame, type MenuRow } from '@/features/templates/BoardFrame';
import { PersonChips } from '@/features/templates/parts/People';
import type { Board, BoardScreenProps } from '@/features/templates/types';
import { useBoardChanges, useBoardPart } from '@/features/templates/useBoard';
import { addMonths, formatMonth, formatMonthName, formatWeekdayDay, monthOf, today } from '@/lib/dates';
import { newClientId } from '@/lib/ids';
import { layout, radius, useTheme } from '@/theme';
import { Avatar } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { ConfirmSheet } from '@/ui/ConfirmSheet';
import { EmptyState } from '@/ui/EmptyState';
import { Eyebrow } from '@/ui/Eyebrow';
import { Field } from '@/ui/Field';
import { Tap } from '@/ui/Motion';
import { NoteBox } from '@/ui/NoteBox';
import { RoundButton } from '@/ui/RoundButton';
import { Sheet } from '@/ui/Sheet';
import { Toggle } from '@/ui/Toggle';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

import { ItemTile, Label, PeoplePick, type Picture, PicturePick, PICTURES, Up } from '../parts';

type Turns = Board<WhoseTurnResponse, WhoseTurnSettings>;
const say = words.perks.whoseTurn;
const FILM = '🎬';
/** The pictures offered for something new to take turns at. */
const OFFERED: readonly Picture[] = ['film', 'car', 'pizza', 'bath', 'dog', 'trophy', 'target', 'basket'];

/**
 * 16.1 Whose turn? What the family takes turns at, and whose turn each is. What is on tonight stands on top
 * with the one button that matters ("Done, pass it on"); the rest keep count below, each with the API's own
 * line about last time. Everyone who sees the list can read it; only the grown-ups write down what happened,
 * and every turn is kept with its date: the proof for the next argument.
 */
export function WhoseTurn({ board }: BoardScreenProps<WhoseTurnResponse, WhoseTurnSettings>) {
  const view = board.view;
  const changes = useBoardChanges(board);
  const circle = useCircles().find((one) => one.id === board.circleId);
  const members = circle ? membersOf(circle) : [];
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [proof, setProof] = useState(false);

  const tonight = view.things.find((thing) => thing.tonight) ?? null;
  const rest = view.things.filter((thing) => thing !== tonight);
  const opened = view.things.find((thing) => thing.id === openId) ?? null;
  const since = new Date().getFullYear() === Number(view.since.slice(0, 4)) ? formatMonthName(view.since) : formatMonth(view.since);
  const menu: MenuRow[] = [{ icon: (color) => <Shield size={20} color={color} />, label: say.proof.title, onPress: () => setProof(true) }];

  return (
    <BoardFrame
      board={board}
      title={board.title}
      chip="menu"
      menu={menu}
      actions={view.canChange ? <RoundButton label={say.add.button} onPress={() => setAdding(true)} icon={(color) => <Plus size={20} color={color} />} /> : undefined}
      problem={changes.problem}>
      {view.things.length === 0 ? (
        <View style={{ flex: 1, justifyContent: 'center', paddingBottom: 60 }}>
          <EmptyState emoji={board.emoji || FILM} title={say.empty.title} body={view.canChange ? say.empty.body : say.empty.bodyLooking} action={view.canChange ? <Button label={say.add.button} icon={(color) => <Plus size={19} color={color} />} onPress={() => setAdding(true)} /> : undefined} />
        </View>
      ) : (
        <>
          {tonight ? <Tonight thing={tonight} canChange={view.canChange} busy={changes.busy} onDone={() => void changes.add('turn', { thingId: tonight.id })} onOpen={() => setOpenId(tonight.id)} /> : null}
          {rest.length ? <Label>{tonight ? say.also : say.keeping}</Label> : null}
          {rest.map((thing) => (
            <Up
              key={thing.id}
              leading={<ItemTile emoji={thing.emoji ?? FILM} />}
              title={thing.name}
              line={thing.line}
              spoken={words.common.spoken([thing.name, thing.next?.name ? say.whose(thing.next.name) : null, thing.line])}
              trailing={thing.next ? <Who name={thing.next.name ?? ''} uri={thing.next.avatarUrl} /> : null}
              onPress={() => setOpenId(thing.id)}
            />
          ))}
          <View style={{ height: 16 }} />
          <Tap accessibilityRole="button" accessibilityLabel={words.common.spoken([say.proof.title, say.proof.body(view.turns, since)])} scaleTo={0.99} onPress={() => setProof(true)} style={{ marginHorizontal: layout.barGutter }}>
            <NoteBox icon={(color) => <Shield size={20} color={color} />} title={say.proof.title}>
              {say.proof.body(view.turns, since)}
            </NoteBox>
          </Tap>
        </>
      )}
      <ThingSheet board={board} thing={opened} members={members} onClose={() => setOpenId(null)} />
      <AddSheet board={board} visible={adding} members={members} onClose={() => setAdding(false)} />
      <ProofSheet board={board} visible={proof} onClose={() => setProof(false)} />
    </BoardFrame>
  );
}

/** What is on tonight: whose turn it is, large, with what happened last time and the button that passes it on. */
function Tonight({ thing, canChange, busy, onDone, onOpen }: { thing: WhoseTurnThingResponse; canChange: boolean; busy: boolean; onDone: () => void; onOpen: () => void }) {
  const { colors } = useTheme();
  const who = thing.next?.name ?? '';
  return (
    <View style={{ gap: 12, marginTop: 4, marginHorizontal: layout.barGutter, padding: 16, borderRadius: radius.panel, backgroundColor: colors.accentSoft }}>
      <Eyebrow>{say.tonight(thing.name)}</Eyebrow>
      <Tap accessibilityRole="button" accessibilityLabel={words.common.spoken([say.turn(who, thing.does), thing.line])} scaleTo={0.99} onPress={onOpen} style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        {/* The picture stands in a ring of the accent colour, with a gap of the card's own colour between them. The ring is drawn around the picture's own place, as a shadow would be: it takes no room. */}
        <View style={{ margin: -6, padding: 3, borderRadius: radius.pill, borderWidth: 3, borderColor: colors.accent }}>
          <Avatar uri={thing.next?.avatarUrl} name={who} size={64} />
        </View>
        <View style={{ flex: 1 }}>
          <Txt variant="titleSmall">{say.turn(who, thing.does)}</Txt>
          {thing.line ? (
            <Txt variant="caption" weight={500} color="muted">
              {thing.line}
            </Txt>
          ) : null}
        </View>
      </Tap>
      {canChange ? <Button label={say.done} size="sm" loading={busy} icon={(color) => <Check size={17} color={color} strokeWidth={2.6} />} onPress={onDone} /> : null}
    </View>
  );
}

/** Whose turn it is, at the end of a row: their picture and their name on a small pill. */
function Who({ name, uri }: { name: string; uri?: string | null }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4, paddingLeft: 4, paddingRight: 11, borderRadius: radius.field, backgroundColor: colors.fill }}>
      <Avatar uri={uri} name={name} size={24} />
      <Txt variant="caption" weight={800}>
        {name}
      </Txt>
    </View>
  );
}

/**
 * One thing, pressed. A grown-up writes down a turn here (for whoever's turn it was, or for someone who
 * took it instead, with a few words), takes the last one back, says it is on tonight, or stops keeping
 * count of it. Anyone else reads whose turn it is.
 */
function ThingSheet({ board, thing, members, onClose }: { board: Turns; thing: WhoseTurnThingResponse | null; members: MemberResponse[]; onClose: () => void }) {
  const [removing, setRemoving] = useState(false);
  const changes = useBoardChanges(board);
  const close = () => {
    setRemoving(false);
    changes.forget();
    onClose();
  };
  if (thing && removing) {
    return (
      <ConfirmSheet
        visible
        onClose={close}
        title={say.thing.removeAsk(thing.name)}
        body={say.thing.removeBody}
        confirm={say.thing.remove}
        busy={changes.busy}
        problem={changes.problem}
        onConfirm={() => void changes.remove(thing.id).then((gone) => (gone ? close() : undefined))}
      />
    );
  }
  return (
    <Sheet visible={thing !== null} onClose={close} title={thing?.name} subtitle={thing ? words.common.spoken([thing.next?.name ? say.turn(thing.next.name, thing.does) : null, thing.line]) : undefined}>
      {thing ? board.view.canChange ? <TakeTurn key={thing.id} board={board} thing={thing} members={members} onClose={close} onRemove={() => setRemoving(true)} /> : <Txt variant="callout" color="muted" style={{ paddingHorizontal: layout.gutter }}>{say.grownUps}</Txt> : null}
    </Sheet>
  );
}

function TakeTurn({ board, thing, members, onClose, onRemove }: { board: Turns; thing: WhoseTurnThingResponse; members: MemberResponse[]; onClose: () => void; onRemove: () => void }) {
  const changes = useBoardChanges(board);
  const clientId = useRef(newClientId());
  const takers = thing.people.map((person) => members.find((member) => member.id === person.memberId)).filter((member): member is MemberResponse => !!member);
  const [who, setWho] = useState<string | null>(thing.next?.memberId ?? takers[0]?.id ?? null);
  const [note, setNote] = useState('');
  const then = (done: unknown) => (done ? onClose() : undefined);
  return (
    <View style={{ gap: 12, paddingTop: 6 }}>
      <View>
        <Txt variant="label" color="muted" style={{ marginBottom: 8, marginHorizontal: layout.gutter }}>
          {say.thing.whoTook}
        </Txt>
        <PersonChips inset people={takers} value={who} onChange={setWho} />
      </View>
      <View style={{ gap: 10, paddingHorizontal: layout.rowGutter }}>
        <Field label={say.thing.note} value={note} onChangeText={setNote} maxLength={200} placeholder={say.thing.notePlaceholder} error={changes.problem} />
        <Button
          label={say.done}
          size="lg"
          block
          disabled={!who}
          loading={changes.busy}
          icon={(color) => <Check size={19} color={color} strokeWidth={2.6} />}
          onPress={() => void changes.add('turn', { thingId: thing.id, memberId: who, note: note.trim() || undefined }, clientId.current).then(then)}
        />
        {thing.last ? <Button label={say.thing.takeBack(thing.last.who?.name ?? '', formatWeekdayDay(thing.last.day))} variant="soft" block disabled={changes.busy} onPress={() => void changes.remove(thing.last!.id).then(then)} /> : null}
        <Button label={thing.tonight ? say.thing.notTonight : say.thing.onTonight} variant="soft" block disabled={changes.busy} onPress={() => void changes.change(thing.id, { onDay: thing.tonight ? null : today() }).then(then)} />
        <Button label={say.thing.remove} variant="quiet" block disabled={changes.busy} onPress={onRemove} />
      </View>
    </View>
  );
}

/** Something new to take turns at: what it is, what the one whose turn it is does, who takes turns, and whether it is on tonight. */
function AddSheet({ board, visible, members, onClose }: { board: Turns; visible: boolean; members: MemberResponse[]; onClose: () => void }) {
  return (
    <Sheet visible={visible} onClose={onClose} title={say.add.title} subtitle={say.add.lead}>
      {visible ? <AddThing board={board} members={members} onClose={onClose} /> : null}
    </Sheet>
  );
}

function AddThing({ board, members, onClose }: { board: Turns; members: MemberResponse[]; onClose: () => void }) {
  const changes = useBoardChanges(board);
  const clientId = useRef(newClientId());
  const people = members.filter((member) => member.kind !== 'pet');
  const [name, setName] = useState('');
  const [does, setDoes] = useState('');
  const [emoji, setEmoji] = useState<string>(PICTURES.film);
  const [who, setWho] = useState<string[]>([]);
  const [tonight, setTonight] = useState(false);
  // The order people were picked in is the order they take turns in; nobody picked means everyone.
  const fields = { name: name.trim(), emoji, does: does.trim() || undefined, people: who.length ? who : undefined, onDay: tonight ? today() : undefined };
  return (
    <View style={{ gap: 12, paddingTop: 6 }}>
      <View style={{ gap: 12, paddingHorizontal: layout.rowGutter }}>
        <Field label={say.add.name} value={name} onChangeText={setName} maxLength={80} autoFocus placeholder={say.add.namePlaceholder} error={changes.problem} />
        <Field label={say.add.does} value={does} onChangeText={setDoes} maxLength={80} autoCapitalize="none" placeholder={say.add.doesPlaceholder} note={say.add.doesNote} />
        <PicturePick label={say.add.picture} options={OFFERED} value={emoji} onChange={setEmoji} />
      </View>
      <View>
        <Txt variant="label" color="muted" style={{ marginBottom: 8, marginHorizontal: layout.gutter }}>
          {say.add.who}
        </Txt>
        <PeoplePick people={people} value={who} onChange={setWho} everyone={say.add.everyone} />
      </View>
      <View style={{ gap: 12, paddingHorizontal: layout.rowGutter }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 }}>
          <Txt variant="item" weight={600} style={{ flex: 1 }}>
            {say.add.tonight}
          </Txt>
          <Toggle label={say.add.tonight} value={tonight} onChange={setTonight} />
        </View>
        <Button label={say.add.save} size="lg" block disabled={!name.trim() || who.length === 1} loading={changes.busy} onPress={() => void changes.add('thing', fields, clientId.current).then((added) => (added ? onClose() : undefined))} />
        {who.length === 1 ? (
          <Txt variant="caption" color="muted" center>
            {say.add.twoAtLeast}
          </Txt>
        ) : null}
      </View>
    </View>
  );
}

/** The proof: every turn of a month, newest first, each with its date. The arrows go back as far as the list does. */
function ProofSheet({ board, visible, onClose }: { board: Turns; visible: boolean; onClose: () => void }) {
  const { colors } = useTheme();
  const thisMonth = monthOf(today());
  const [month, setMonth] = useState(thisMonth);
  const part = useBoardPart(board, visible ? month : undefined);
  const shown = visible && !part.waiting ? part.board.view.history : null;
  const first = monthOf(board.view.since);
  const arrow = (label: string, to: string, off: boolean, Icon: typeof ChevronLeft) => (
    <Tap accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: off }} disabled={off} hitSlop={10} onPress={() => setMonth(to)} style={{ width: 36, height: 36, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.fill, opacity: off ? 0.38 : 1 }}>
      <Icon size={18} color={colors.text} />
    </Tap>
  );
  return (
    <Sheet visible={visible} onClose={onClose} title={say.proof.title} subtitle={say.proof.lead} tall>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: layout.rowGutter, paddingBottom: 8 }}>
        {arrow(say.proof.earlier, addMonths(month, -1), month <= first, ChevronLeft)}
        <Txt variant="subheading" accessibilityRole="header" center style={{ flex: 1 }}>
          {formatMonth(month)}
        </Txt>
        {arrow(say.proof.later, addMonths(month, 1), month >= thisMonth, ChevronRight)}
      </View>
      {part.problem ? (
        <Txt variant="callout" color="muted" center style={{ padding: 32 }}>
          {part.problem}
        </Txt>
      ) : shown === null ? null : shown.length === 0 ? (
        <Txt variant="callout" color="muted" center style={{ padding: 32 }}>
          {say.proof.none}
        </Txt>
      ) : (
        shown.map((turn) => (
          <View key={turn.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingVertical: 6, paddingHorizontal: layout.rowGutter }}>
            <Avatar uri={turn.who?.avatarUrl} name={turn.who?.name ?? ''} size={34} />
            <View style={{ flex: 1 }}>
              <Txt variant="item">{say.proof.turn(turn.who?.name ?? '', turn.thing)}</Txt>
              <Txt variant="footnote" color="muted">
                {words.common.join([formatWeekdayDay(turn.day), turn.note])}
              </Txt>
            </View>
          </View>
        ))
      )}
    </Sheet>
  );
}

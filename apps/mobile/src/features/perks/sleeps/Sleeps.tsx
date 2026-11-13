import { LayoutGrid, Plus } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { View } from 'react-native';
import Svg, { Ellipse } from 'react-native-svg';

import type { MemberResponse, SleepsCountResponse, SleepsResponse, SleepsSettings } from '@/api/generated/homeport';
import { useCircles } from '@/features/circles/current';
import { membersOf } from '@/features/circles/members';
import { BoardFrame } from '@/features/templates/BoardFrame';
import { Notice } from '@/features/templates/parts/Notice';
import { PersonChips } from '@/features/templates/parts/People';
import type { Board, BoardScreenProps } from '@/features/templates/types';
import { useBoardChanges } from '@/features/templates/useBoard';
import { addDays, formatWeekdayDay, today } from '@/lib/dates';
import { newClientId } from '@/lib/ids';
import { type Colors, layout, radius, useTheme } from '@/theme';
import { Button } from '@/ui/Button';
import { CheckRow } from '@/ui/CheckRow';
import { DayPicker } from '@/ui/DayPicker';
import { Emoji } from '@/ui/Emoji';
import { EmptyState } from '@/ui/EmptyState';
import { Field, FieldButton } from '@/ui/Field';
import { Tap } from '@/ui/Motion';
import { NoteBox } from '@/ui/NoteBox';
import { RoundButton } from '@/ui/RoundButton';
import { Sheet } from '@/ui/Sheet';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

import { Amount, ItemTile, Label, type Picture, PicturePick, PICTURES, Up } from '../parts';
import { layoutOf, LINK, type Link, linksOf, rowsOf } from './chain';

type Counts = Board<SleepsResponse, SleepsSettings>;
type Count = SleepsCountResponse;
const say = words.perks.sleeps;
const MOON = '🌙';
const OFFERED: readonly Picture[] = ['cake', 'tree', 'plane', 'present', 'party', 'tent', 'swim', 'moon'];
/** How many links one row of the chain holds: sixty links make three rows on a phone. */
const PER_ROW = 20;

/** The colour of a link: the accent, or one of the five tints. */
const colourOf = (colors: Colors, tint: number) => [colors.accent, colors.tint1, colors.tint2, colors.tint3, colors.tint4, colors.tint5][tint] ?? colors.accent;

/**
 * 16.5 Sleeps until… A countdown the way a six-year-old counts: in sleeps, as a paper chain. The nearest day
 * has the chain, one link for every sleep there was when it started; a link is gone for every night that has
 * passed, and tonight's comes off when someone tears it (anyone who sees the board may). The other days
 * count below. The Home Screen widget needs the phone app, and the note says so when pressed.
 */
export function Sleeps({ board }: BoardScreenProps<SleepsResponse, SleepsSettings>) {
  const view = board.view;
  const changes = useBoardChanges(board);
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const all = [...(view.first ? [view.first] : []), ...view.others, ...view.passed];
  const opened = all.find((one) => one.id === openId) ?? null;
  const row = (count: Count, passed: boolean) => (
    <Up
      key={count.id}
      leading={<ItemTile emoji={count.emoji ?? MOON} />}
      title={count.title}
      line={words.common.join([formatWeekdayDay(count.day), count.note])}
      spoken={words.common.spoken([count.title, passed ? null : say.sleeps(count.sleeps), formatWeekdayDay(count.day), count.note])}
      trailing={passed ? null : <Amount>{count.sleeps}</Amount>}
      onPress={() => setOpenId(count.id)}
    />
  );

  return (
    <BoardFrame
      board={board}
      title={board.title}
      chip="menu"
      actions={board.canEdit ? <RoundButton label={say.add.button} onPress={() => setAdding(true)} icon={(color) => <Plus size={20} color={color} />} /> : undefined}
      problem={changes.problem}>
      {all.length === 0 ? (
        <View style={{ flex: 1, justifyContent: 'center', paddingBottom: 60 }}>
          <EmptyState emoji={board.emoji || MOON} title={say.empty.title} body={say.empty.body} action={board.canEdit ? <Button label={say.add.button} icon={(color) => <Plus size={19} color={color} />} onPress={() => setAdding(true)} /> : undefined} />
        </View>
      ) : (
        <>
          {view.first ? <First count={view.first} busy={changes.busy} onTear={(torn) => void changes.act('tear', { entryId: view.first!.id, torn })} onOpen={() => setOpenId(view.first!.id)} /> : null}
          {view.others.length ? <Label>{view.first ? say.also : say.counting}</Label> : null}
          {view.others.map((count) => row(count, false))}
          {view.passed.length ? <Label>{say.passed}</Label> : null}
          {view.passed.map((count) => row(count, true))}
          <View style={{ height: 16 }} />
          <Tap accessibilityRole="button" accessibilityLabel={words.common.spoken([say.widget.title, say.widget.body])} scaleTo={0.99} onPress={() => setNotice(say.widget.notice)} style={{ marginHorizontal: layout.barGutter }}>
            <NoteBox soft icon={(color) => <LayoutGrid size={20} color={color} />} title={say.widget.title}>
              {say.widget.body}
            </NoteBox>
          </Tap>
        </>
      )}
      <CountSheet board={board} count={opened} onClose={() => setOpenId(null)} />
      <AddSheet board={board} visible={adding} onClose={() => setAdding(false)} />
      <Notice text={notice} onClose={() => setNotice(null)} />
    </BoardFrame>
  );
}

/** The nearest day: how many sleeps, as large as the page goes, what it is, and its chain. */
function First({ count, busy, onTear, onOpen }: { count: Count; busy: boolean; onTear: (torn: boolean) => void; onOpen: () => void }) {
  const { colors } = useTheme();
  const links = linksOf(count);
  const tonight = links.find((link) => link.tonight);
  const under = count.sleeps === 0 ? say.dayCame : count.tornTonight ? say.torn : tonight ? say.tonight(count.tearer?.name ?? null, say.colours[tonight.tint] ?? say.colours[0]) : null;
  return (
    <View style={{ alignItems: 'center', marginTop: 4, marginHorizontal: layout.barGutter, paddingTop: 18, paddingHorizontal: 12, paddingBottom: 16, borderRadius: radius.panel, backgroundColor: colors.accentSoft }}>
      <Tap accessibilityRole="button" accessibilityLabel={words.common.spoken([say.spoken(count.sleeps, count.title), formatWeekdayDay(count.day)])} scaleTo={0.99} onPress={onOpen} style={{ alignItems: 'center', alignSelf: 'stretch' }}>
        {count.sleeps === 0 ? (
          <View style={{ height: 76, justifyContent: 'center' }}>
            <Emoji char={count.emoji ?? MOON} size={64} />
          </View>
        ) : (
          // The number is bigger than any text the app itself uses: the largest style, drawn larger.
          <View style={{ height: 76, justifyContent: 'center' }}>
            <Txt variant="hero" allowFontScaling={false} style={{ transform: [{ scale: 1.85 }] }}>
              {count.sleeps}
            </Txt>
          </View>
        )}
        <Txt variant="subheading" center>
          {count.sleeps === 0 ? say.today(count.title) : say.until(count.sleeps, count.title)}
        </Txt>
      </Tap>
      {links.length ? (
        <Tap
          accessibilityRole="button"
          accessibilityLabel={say.tear}
          accessibilityState={{ disabled: !count.canTear || busy }}
          disabled={!count.canTear || busy}
          scaleTo={0.97}
          onPress={() => onTear(true)}
          style={{ alignItems: 'center', gap: 6, marginTop: 16, marginBottom: 12 }}>
          {rowsOf(links, PER_ROW).map((row, index) => (
            <ChainRow key={index} links={row} />
          ))}
        </Tap>
      ) : (
        <View style={{ height: 12 }} />
      )}
      {under ? (
        <Txt variant="footnote" color="muted" center>
          {under}
        </Txt>
      ) : null}
      {count.tornTonight ? (
        <View style={{ marginTop: 10 }}>
          <Button label={say.putBack} variant="soft" size="sm" inline disabled={busy} onPress={() => onTear(false)} />
        </View>
      ) : null}
    </View>
  );
}

/** One row of links: a ring for each that is still on, a dashed outline for each that is gone. */
function ChainRow({ links }: { links: readonly Link[] }) {
  const { colors } = useTheme();
  const { lefts, width } = layoutOf(links);
  return (
    <Svg width={width} height={LINK.rowHeight} accessible={false}>
      {links.map((link, index) => {
        const box = link.narrow ? LINK.narrow : LINK.wide;
        const stroke = link.off ? 2 : 6;
        return (
          <Ellipse
            key={index}
            cx={lefts[index]! + box.width / 2}
            cy={LINK.rowHeight / 2}
            rx={(box.width - stroke) / 2}
            ry={(box.height - stroke) / 2}
            fill="none"
            stroke={link.off ? colors.muted : colourOf(colors, link.tint)}
            strokeWidth={stroke}
            strokeDasharray={link.off ? '4 3' : undefined}
            opacity={link.off ? 0.5 : 1}
          />
        );
      })}
    </Svg>
  );
}

/** One day that is counted down to, pressed: when it is, and for whoever may change the board the way to stop counting. */
function CountSheet({ board, count, onClose }: { board: Counts; count: Count | null; onClose: () => void }) {
  const changes = useBoardChanges(board);
  const close = () => {
    changes.forget();
    onClose();
  };
  return (
    <Sheet visible={count !== null} onClose={close} title={count ? (count.sleeps === 0 ? say.today(count.title) : say.spoken(count.sleeps, count.title)) : undefined} subtitle={count ? words.common.join([formatWeekdayDay(count.day), count.yearly ? say.everyYear : null, count.note, count.tearer?.name ? say.tearer(count.tearer.name) : null]) : undefined}>
      {count ? (
        <View style={{ gap: 10, paddingTop: 6, paddingHorizontal: layout.rowGutter }}>
          {changes.problem ? (
            <Txt variant="caption" color="danger" accessibilityLiveRegion="polite">
              {changes.problem}
            </Txt>
          ) : null}
          {board.canEdit ? <Button label={say.remove} variant="soft" size="lg" block loading={changes.busy} onPress={() => void changes.remove(count.id).then((gone) => (gone ? close() : undefined))} /> : null}
        </View>
      ) : null}
    </Sheet>
  );
}

/** Something new to count down to: what comes after "sleeps until", the day, a picture, and who tears the links off. */
function AddSheet({ board, visible, onClose }: { board: Counts; visible: boolean; onClose: () => void }) {
  const circle = useCircles().find((one) => one.id === board.circleId);
  const people = circle ? membersOf(circle).filter((member) => member.kind !== 'pet') : [];
  return (
    <Sheet visible={visible} onClose={onClose} title={say.add.title} subtitle={say.add.lead}>
      {visible ? <AddCount board={board} people={people} onClose={onClose} /> : null}
    </Sheet>
  );
}

function AddCount({ board, people, onClose }: { board: Counts; people: MemberResponse[]; onClose: () => void }) {
  const changes = useBoardChanges(board);
  const clientId = useRef(newClientId());
  // Children tear the links off: they stand first.
  const order = [...people.filter((member) => member.kind === 'child'), ...people.filter((member) => member.kind !== 'child')];
  const [title, setTitle] = useState('');
  const [day, setDay] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [emoji, setEmoji] = useState<string>(PICTURES.cake);
  const [yearly, setYearly] = useState(false);
  const [tearer, setTearer] = useState<string | null>(null);
  const fields = { title: title.trim(), day, emoji, yearly, tearerMemberId: tearer ?? undefined };
  return (
    <View style={{ gap: 12, paddingTop: 6 }}>
      <View style={{ gap: 12, paddingHorizontal: layout.rowGutter }}>
        <Field label={say.add.what} value={title} onChangeText={setTitle} maxLength={120} autoFocus autoCapitalize="none" placeholder={say.add.whatPlaceholder} error={changes.problem} />
        <View style={{ flexDirection: 'row' }}>
          <FieldButton label={say.add.day} value={day ? formatWeekdayDay(day) : say.add.choose} onPress={() => setPicking(true)} />
        </View>
        <PicturePick label={say.add.picture} options={OFFERED} value={emoji} onChange={setEmoji} />
        <CheckRow label={say.add.yearly} checked={yearly} onChange={setYearly} />
      </View>
      {order.length ? (
        <View>
          <Txt variant="label" color="muted" style={{ marginBottom: 8, marginHorizontal: layout.gutter }}>
            {say.add.tearer}
          </Txt>
          <PersonChips inset people={order} value={tearer} onChange={(id) => setTearer(id === tearer ? null : id)} />
        </View>
      ) : null}
      <View style={{ paddingHorizontal: layout.rowGutter }}>
        <Button label={say.add.save} size="lg" block disabled={!title.trim() || !day} loading={changes.busy} onPress={() => void changes.add('count', fields, clientId.current).then((added) => (added ? onClose() : undefined))} />
      </View>
      <DayPicker visible={picking} onClose={() => setPicking(false)} title={say.add.day} value={day ?? addDays(today(), 7)} min={today()} byYear onChange={setDay} />
    </View>
  );
}

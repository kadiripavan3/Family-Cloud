import { Book, Check, Moon, Plus, Star, Sun, Undo2 } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { View } from 'react-native';

import type { HabitChartsCellResponse, HabitChartsChartResponse, HabitChartsResponse, HabitChartsRowResponse, HabitChartsSettings } from '@/api/generated/homeport';
import { useCircles } from '@/features/circles/current';
import { membersOf } from '@/features/circles/members';
import { BoardFrame, type MenuRow } from '@/features/templates/BoardFrame';
import type { Board, BoardScreenProps } from '@/features/templates/types';
import { type BoardChanges, useBoardChanges, useBoardPart } from '@/features/templates/useBoard';
import { addDays, formatRange, formatWeekdayLong, today } from '@/lib/dates';
import { newClientId } from '@/lib/ids';
import { layout, radius, useTheme } from '@/theme';
import { Avatar } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { EmptyState } from '@/ui/EmptyState';
import { Field } from '@/ui/Field';
import { Tap } from '@/ui/Motion';
import { NoteBox } from '@/ui/NoteBox';
import { RoundButton } from '@/ui/RoundButton';
import { Segmented } from '@/ui/Segmented';
import { Sheet } from '@/ui/Sheet';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

import { ItemTile, Label, PeoplePick, type Picture, PicturePick, PICTURES, Up } from '../parts';

type Charts = Board<HabitChartsResponse, HabitChartsSettings>;
type Chart = HabitChartsChartResponse;
const say = words.perks.habitCharts;
const TICK = '✅';
const OFFERED: readonly Picture[] = ['tick', 'books', 'phone', 'screen', 'bath', 'run', 'salad', 'moon'];
/** The days of the week as the API names them, Monday first. */
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
/** The picture the app has for a row's word: the sun for the morning, the moon for the evening, a book. A word it doesn't know gets a tick. */
const ROW_ICONS: Partial<Record<string, typeof Sun>> = { sun: Sun, moon: Moon, book: Book };
/** A tick can be given for today or one of the seven days before it. */
const mayTick = (cell: HabitChartsCellResponse) => cell.due && cell.day <= today() && cell.day >= addDays(today(), -7);

/**
 * 16.7 Habit charts. A tick a day: bed made, bag packed, twenty minutes of reading. A chart whose ticks are
 * stars is a card with its week in a grid, a cell for each day of each row; pressing a cell ticks it (a
 * child's tick is pressed on a parent's phone), for today or one of the last seven days. The grown-ups' own
 * are rows with one tick for today. A missed day is a gap: nothing resets, and the page says so.
 */
export function HabitCharts({ board: opened }: BoardScreenProps<HabitChartsResponse, HabitChartsSettings>) {
  /** A day of another week that is being looked at, in place of this one. */
  const [week, setWeek] = useState<string | undefined>(undefined);
  const { board, problem: partProblem } = useBoardPart(opened, week);
  const view = board.view;
  const changes = useBoardChanges(board);
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const other = week !== undefined && view.weekStart !== opened.view.weekStart;
  const looked = view.charts.find((chart) => chart.id === openId) ?? null;

  const cards = view.charts.filter((chart) => chart.earnsStars || chart.rows.length > 1);
  const rows = view.charts.filter((chart) => !cards.includes(chart));
  const menu: MenuRow[] = [{ icon: (color) => <Undo2 size={20} color={color} />, label: week ? say.thisWeek : say.lastWeek, onPress: () => setWeek(week ? undefined : addDays(opened.view.weekStart, -7)) }];

  return (
    <BoardFrame
      board={board}
      title={board.title}
      subtitle={other ? say.weekOf(formatRange(view.weekStart, view.weekEnd)) : undefined}
      chip="menu"
      menu={menu}
      actions={board.canEdit ? <RoundButton label={say.add.button} onPress={() => setAdding(true)} icon={(color) => <Plus size={20} color={color} />} /> : undefined}
      problem={changes.problem ?? partProblem}>
      {view.charts.length === 0 ? (
        <View style={{ flex: 1, justifyContent: 'center', paddingBottom: 60 }}>
          <EmptyState emoji={board.emoji || TICK} title={say.empty.title} body={say.empty.body} action={board.canEdit ? <Button label={say.add.button} icon={(color) => <Plus size={19} color={color} />} onPress={() => setAdding(true)} /> : undefined} />
        </View>
      ) : (
        <>
          {cards.map((chart) => (
            <Card key={chart.id} style={{ gap: 13, marginHorizontal: layout.barGutter, marginBottom: 10, padding: 14 }}>
              <Tap accessibilityRole="button" accessibilityLabel={words.common.spoken([chart.title, words.common.join([chart.who, chart.line]), chart.stars === null ? null : say.stars(chart.stars)])} scaleTo={0.99} onPress={() => setOpenId(chart.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                {chart.people.length === 1 ? <Avatar uri={chart.people[0]!.avatarUrl} name={chart.people[0]!.name ?? ''} size={34} /> : <ItemTile emoji={chart.emoji ?? TICK} size={34} />}
                <View style={{ flex: 1 }}>
                  <Txt variant="item" weight={800} numberOfLines={1}>
                    {chart.title}
                  </Txt>
                  <Txt variant="footnote" color="muted" numberOfLines={1}>
                    {words.common.join([chart.who, chart.line])}
                  </Txt>
                </View>
                {chart.stars === null ? null : <StarCount stars={chart.stars} />}
              </Tap>
              <Grid chart={chart} changes={changes} />
            </Card>
          ))}
          {rows.length ? <Label>{say.grownUps}</Label> : null}
          {rows.map((chart) => (
            <Up
              key={chart.id}
              split
              leading={<ItemTile emoji={chart.emoji ?? TICK} />}
              title={chart.title}
              line={words.common.join([chart.who, chart.line])}
              trailing={<TodayTick chart={chart} changes={changes} />}
              onPress={() => setOpenId(chart.id)}
            />
          ))}
          <View style={{ height: 16 }} />
          <NoteBox soft icon={(color) => <Star size={20} color={color} />} title={say.gap.title} style={{ marginHorizontal: layout.barGutter }}>
            {say.gap.body}
          </NoteBox>
        </>
      )}
      <ChartSheet board={board} chart={looked} onClose={() => setOpenId(null)} />
      <AddSheet board={board} visible={adding} onClose={() => setAdding(false)} />
    </BoardFrame>
  );
}

/** A child's stars at the end of their chart's head: every tick is one more. */
function StarCount({ stars }: { stars: number }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <Star size={14} color={colors.accent} fill={colors.accent} />
      <Txt variant="caption" weight={800}>
        {stars}
      </Txt>
    </View>
  );
}

/** A chart's week: the days' letters, then a line of seven cells for each of its rows, with the row's picture first. */
function Grid({ chart, changes }: { chart: Chart; changes: BoardChanges }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 5 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
        <View style={{ width: 22 }} />
        {words.dates.weekdayInitials.map((letter, index) => (
          <Txt key={index} variant="micro" weight={700} color="muted" center accessible={false} style={{ flex: 1 }}>
            {letter}
          </Txt>
        ))}
      </View>
      {chart.rows.map((row) => {
        const Icon = ROW_ICONS[row.icon ?? ''] ?? Check;
        return (
          <View key={row.row} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <View style={{ width: 22, alignItems: 'center' }}>
              <Icon size={13} color={colors.muted} />
            </View>
            {row.cells.map((cell) => (
              <Cell key={cell.day} chart={chart} row={row} cell={cell} changes={changes} />
            ))}
          </View>
        );
      })}
    </View>
  );
}

/** One day of one row: ticked, open for today, or plain. Pressing it gives the tick, or takes it back. */
function Cell({ chart, row, cell, changes }: { chart: Chart; row: HabitChartsRowResponse; cell: HabitChartsCellResponse; changes: BoardChanges }) {
  const { colors } = useTheme();
  const open = mayTick(cell);
  const todays = cell.today && cell.due && !cell.done;
  return (
    <Tap
      accessibilityRole="checkbox"
      accessibilityLabel={say.cell(row.label ?? chart.title, formatWeekdayLong(cell.day))}
      accessibilityState={{ checked: cell.done, disabled: !open }}
      aria-checked={cell.done}
      disabled={!open || changes.busy}
      scaleTo={0.9}
      onPress={() => void changes.act('tick', { chartId: chart.id, row: row.row, day: cell.day, done: !cell.done })}
      style={{ flex: 1, aspectRatio: 1.25, alignItems: 'center', justifyContent: 'center', borderRadius: radius.chip, borderWidth: 2, borderColor: cell.done ? colors.accent : todays ? colors.accent : colors.fill, backgroundColor: cell.done ? colors.accent : todays ? colors.bg : colors.fill, opacity: cell.due ? 1 : 0.4 }}>
      {cell.done ? <Check size={13} color={colors.onAccent} strokeWidth={3} /> : null}
    </Tap>
  );
}

/** The round tick at the end of a grown-up's chart: today's, for its one row. */
function TodayTick({ chart, changes }: { chart: Chart; changes: BoardChanges }) {
  const { colors } = useTheme();
  const on = chart.doneToday;
  return (
    <Tap
      accessibilityRole="checkbox"
      accessibilityLabel={say.today(chart.title)}
      accessibilityState={{ checked: on, disabled: !chart.dueToday }}
      aria-checked={on}
      disabled={!chart.dueToday || changes.busy}
      hitSlop={10}
      scaleTo={0.85}
      onPress={() => void changes.act('tick', { chartId: chart.id, row: 0, day: today(), done: !on })}
      style={{ width: 24, height: 24, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', borderWidth: on ? 0 : 2, borderColor: colors.lineStrong, backgroundColor: on ? colors.accent : 'transparent', opacity: chart.dueToday ? 1 : 0.4 }}>
      {on ? <Check size={14} color={colors.onAccent} strokeWidth={3} /> : null}
    </Tap>
  );
}

/** A chart, pressed: its week to tick in (a grown-up's row has only today's tick on the page), and taking it down. */
function ChartSheet({ board, chart, onClose }: { board: Charts; chart: Chart | null; onClose: () => void }) {
  const changes = useBoardChanges(board);
  const close = () => {
    changes.forget();
    onClose();
  };
  return (
    <Sheet visible={chart !== null} onClose={close} title={chart?.title} subtitle={chart ? words.common.join([chart.who, chart.line, chart.stars === null ? null : say.stars(chart.stars)]) : undefined}>
      {chart ? (
        <View style={{ gap: 12, paddingTop: 6, paddingHorizontal: layout.rowGutter }}>
          <Grid chart={chart} changes={changes} />
          {changes.problem ? (
            <Txt variant="caption" color="danger" accessibilityLiveRegion="polite">
              {changes.problem}
            </Txt>
          ) : null}
          {board.canEdit ? (
            <>
              <Button label={say.chart.takeDown} variant="soft" size="lg" block disabled={changes.busy} onPress={() => void changes.remove(chart.id).then((gone) => (gone ? close() : undefined))} />
              <Txt variant="footnote" color="muted" center>
                {say.chart.takeDownNote}
              </Txt>
            </>
          ) : null}
        </View>
      ) : null}
    </Sheet>
  );
}

/** A new chart: what it is called, who it is for, once a day or morning and evening, and on which days. */
function AddSheet({ board, visible, onClose }: { board: Charts; visible: boolean; onClose: () => void }) {
  return (
    <Sheet visible={visible} onClose={onClose} title={say.add.title} subtitle={say.add.lead}>
      {visible ? <AddChart board={board} onClose={onClose} /> : null}
    </Sheet>
  );
}

function AddChart({ board, onClose }: { board: Charts; onClose: () => void }) {
  const { colors } = useTheme();
  const changes = useBoardChanges(board);
  const clientId = useRef(newClientId());
  const circle = useCircles().find((one) => one.id === board.circleId);
  const people = circle ? membersOf(circle).filter((member) => member.kind !== 'pet') : [];
  // Children's charts are made most: they stand first.
  const order = [...people.filter((member) => member.kind === 'child'), ...people.filter((member) => member.kind !== 'child')];
  const [title, setTitle] = useState('');
  const [who, setWho] = useState<string[]>([]);
  const [often, setOften] = useState<'once' | 'twice'>('once');
  const [days, setDays] = useState<readonly string[]>(DAYS);
  const [emoji, setEmoji] = useState<string>(PICTURES.tick);
  const form = say.add;
  const fields = {
    title: title.trim(),
    emoji,
    people: who,
    rows: often === 'twice' ? [{ label: form.morning, icon: 'sun' }, { label: form.evening, icon: 'moon' }] : undefined,
    // Every day is the chart's own "every day": nothing is sent for it.
    days: days.length === DAYS.length ? undefined : DAYS.filter((day) => days.includes(day)),
  };
  return (
    <View style={{ gap: 12, paddingTop: 6 }}>
      <View style={{ gap: 12, paddingHorizontal: layout.rowGutter }}>
        <Field label={form.name} value={title} onChangeText={setTitle} maxLength={120} autoFocus placeholder={form.namePlaceholder} error={changes.problem} />
        <PicturePick label={form.picture} options={OFFERED} value={emoji} onChange={setEmoji} />
      </View>
      <View>
        <Txt variant="label" color="muted" style={{ marginBottom: 8, marginHorizontal: layout.gutter }}>
          {form.who}
        </Txt>
        <PeoplePick people={order} value={who} onChange={setWho} everyone={form.everyone} />
      </View>
      <View>
        <Txt variant="label" color="muted" style={{ marginBottom: 8, marginHorizontal: layout.gutter }}>
          {form.often}
        </Txt>
        <Segmented label={form.often} value={often} onChange={setOften} options={[{ id: 'once', label: form.once }, { id: 'twice', label: form.twice }]} />
      </View>
      <View>
        <Txt variant="label" color="muted" style={{ marginBottom: 8, marginHorizontal: layout.gutter }}>
          {form.days}
        </Txt>
        <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: layout.rowGutter }}>
          {DAYS.map((day, index) => {
            const on = days.includes(day);
            return (
              <Tap
                key={day}
                accessibilityRole="checkbox"
                accessibilityLabel={words.dates.weekdayLong((index + 1) % 7)}
                aria-checked={on}
                scaleTo={0.9}
                onPress={() => setDays(on ? days.filter((one) => one !== day) : [...days, day])}
                style={{ flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: radius.tile, backgroundColor: on ? colors.text : colors.fill }}>
                <Txt variant="caption" weight={800} style={{ color: on ? colors.bg : colors.muted }}>
                  {words.dates.weekdayInitials[index]}
                </Txt>
              </Tap>
            );
          })}
        </View>
      </View>
      <View style={{ gap: 10, paddingHorizontal: layout.rowGutter }}>
        <Txt variant="footnote" color="muted">
          {form.starsNote}
        </Txt>
        <Button label={form.save} size="lg" block disabled={!title.trim() || days.length === 0} loading={changes.busy} onPress={() => void changes.add('chart', fields, clientId.current).then((added) => (added ? onClose() : undefined))} />
      </View>
    </View>
  );
}

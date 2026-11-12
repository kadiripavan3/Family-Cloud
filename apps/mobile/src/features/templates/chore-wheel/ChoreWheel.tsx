import { Check, Plus, Star, Undo2 } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import type { ChoreWheelJob, ChoreWheelSettings, ChoreWheelView } from '@/api/generated/homeport';
import { addDays, formatDay, formatTime, today } from '@/lib/dates';
import { newClientId } from '@/lib/ids';
import { formatMoney } from '@/lib/money';
import { layout, radius, useTheme } from '@/theme';
import { Avatar } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { Emoji } from '@/ui/Emoji';
import { EmptyState } from '@/ui/EmptyState';
import { Field } from '@/ui/Field';
import { Tap } from '@/ui/Motion';
import { NoteBox } from '@/ui/NoteBox';
import { Sheet } from '@/ui/Sheet';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

import { BoardFrame, type MenuRow } from '../BoardFrame';
import type { Board, BoardScreenProps } from '../types';
import { useBoardChanges, useBoardPart } from '../useBoard';
import { pointAt, sliceMiddles, slicePath } from './wheel';

type Wheel = Board<ChoreWheelView, ChoreWheelSettings>;
const say = words.templates.choreWheel;

/** The wheel as drawn: 218 across in a box 262 high, the jobs on a ring inside it and the people on an oval around it. */
const BOX = { width: 320, height: 262 };
const CENTRE = { x: BOX.width / 2, y: 131 };
const RIM = 109;
const HOLE = 41;

/**
 * 5.8 The chore wheel. The jobs sit on the wheel and the people around it; every Monday it turns by one, so
 * each job moves to the next person. Under it, this week's jobs with whose they are: a row ticks its job for
 * today (a child's row shows their stars, which go up with every tick). Tapping the wheel turns it to next
 * week, to see who gets what.
 */
export function ChoreWheel({ board: opened }: BoardScreenProps<ChoreWheelView, ChoreWheelSettings>) {
  const [nextWeek, setNextWeek] = useState(false);
  const { board, problem: partProblem } = useBoardPart(opened, nextWeek ? addDays(opened.view.weekStart, 7) : undefined);
  const view = board.view;
  const changes = useBoardChanges(board);
  const [adding, setAdding] = useState(false);
  /** Next week's jobs are shown only once they are there: until then the wheel stays as it was. */
  const turned = nextWeek && view.weekStart !== opened.view.weekStart;

  const tick = (job: ChoreWheelJob) => {
    if (job.doneToday) return void changes.act('tick', { jobId: job.id, done: false });
    // A job that is done for the week has no tick left to give: pressing takes its last one back.
    const last = job.doneOn[job.doneOn.length - 1];
    if (job.complete && last) return void changes.act('tick', { jobId: job.id, done: false, day: last });
    return void changes.act('tick', { jobId: job.id, done: true, day: today() });
  };

  const menu: MenuRow[] = [
    ...(board.canEdit ? [{ icon: (color: string) => <Plus size={20} color={color} />, label: say.add.title, onPress: () => setAdding(true) }] : []),
    { icon: (color: string) => <Undo2 size={20} color={color} />, label: nextWeek ? say.thisWeek : say.nextWeek, onPress: () => setNextWeek(!nextWeek) },
  ];
  const starsOf = new Map(view.people.map((one) => [one.person.memberId, one]));

  return (
    <BoardFrame board={board} title={board.title} subtitle={turned ? say.nextWeekFrom(formatDay(view.weekStart)) : say.turns} menu={menu} problem={changes.problem ?? partProblem}>
      {view.jobs.length === 0 ? (
        <View style={{ flex: 1, justifyContent: 'center', paddingBottom: 60 }}>
          <EmptyState emoji="🧹" title={say.empty.title} body={say.empty.body} action={board.canEdit ? <Button label={say.add.title} icon={(color) => <Plus size={19} color={color} />} onPress={() => setAdding(true)} /> : undefined} />
        </View>
      ) : (
        <>
          <WheelPicture view={view} turned={turned} onTurn={() => setNextWeek(!nextWeek)} />
          <View>
            {view.jobs.map((job) => {
              const who = job.who;
              const child = who ? starsOf.get(who.memberId)?.kind === 'child' : false;
              const stars = who ? (starsOf.get(who.memberId)?.stars ?? 0) : 0;
              const line = words.common.join([who?.name, turned ? job.when : say.jobLine(job, job.lastDoneAt ? formatTime(job.lastDoneAt) : null, job.lastDoneAt ? new Date(job.lastDoneAt).getHours() < 12 : false)]);
              const done = job.doneToday || job.complete;
              return (
                <Tap
                  key={job.id}
                  accessibilityRole="checkbox"
                  accessibilityLabel={words.common.spoken([job.name, line, child ? say.stars(stars) : null])}
                  aria-checked={!turned && done}
                  disabled={turned || !board.canEdit || changes.busy}
                  scaleTo={0.99}
                  onPress={() => tick(job)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 54, paddingVertical: 7, paddingHorizontal: layout.rowGutter }}>
                  <Avatar uri={who?.avatarUrl} name={who?.name ?? job.name} size={40} />
                  <View style={{ flex: 1 }}>
                    <Txt variant="item" numberOfLines={1}>
                      {job.name}
                    </Txt>
                    <Txt variant="caption" weight={500} color="muted" numberOfLines={1}>
                      {line}
                    </Txt>
                  </View>
                  {child ? <StarCount stars={stars} /> : turned ? null : <Tick on={done} />}
                </Tap>
              );
            })}
          </View>
          {view.stars ? (
            <NoteBox soft icon={(color) => <Star size={20} color={color} />} title={say.starsRule.title} style={{ marginTop: 8, marginHorizontal: layout.barGutter }}>
              {say.starsRule.body(view.stars.stars, formatMoney(view.stars.cents, view.stars.currency), view.stars.into)}
            </NoteBox>
          ) : null}
        </>
      )}
      <AddJobSheet board={board} visible={adding} onClose={() => setAdding(false)} />
    </BoardFrame>
  );
}

/** The round tick at the end of a grown-up's job. */
function Tick({ on }: { on: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={{ width: 24, height: 24, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', borderWidth: on ? 0 : 2, borderColor: colors.lineStrong, backgroundColor: on ? colors.accent : 'transparent' }}>
      {on ? <Check size={14} color={colors.onAccent} strokeWidth={3} /> : null}
    </View>
  );
}

/** A child's stars at the end of their job: every tick is one more. */
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

/** The wheel itself: a slice for each job with its emoji, the week's number in the middle, and each job's person beside its slice. */
function WheelPicture({ view, turned, onTurn }: { view: ChoreWheelView; turned: boolean; onTurn: () => void }) {
  const { colors, shadow } = useTheme();
  const middles = sliceMiddles(view.jobs.length);
  const slice = 360 / Math.max(view.jobs.length, 1);
  return (
    <Tap accessibilityRole="button" accessibilityLabel={turned ? say.wheelNext(view.week) : say.wheel(view.week)} scaleTo={0.99} onPress={onTurn} style={{ alignSelf: 'center', width: BOX.width, height: BOX.height, marginTop: 4 }}>
      <Svg width={BOX.width} height={BOX.height} style={{ position: 'absolute' }}>
        <Circle cx={CENTRE.x} cy={CENTRE.y} r={RIM + 6.75} stroke={colors.line} strokeWidth={1.5} fill="none" />
        {view.jobs.length === 1 ? (
          <Circle cx={CENTRE.x} cy={CENTRE.y} r={RIM} fill={colors.accentSoft} />
        ) : (
          view.jobs.map((job, index) => <Path key={job.id} d={slicePath(CENTRE, RIM, index * slice, (index + 1) * slice)} fill={index % 2 === 0 ? colors.accentSoft : colors.fill} />)
        )}
      </Svg>
      <View style={{ position: 'absolute', left: CENTRE.x - HOLE, top: CENTRE.y - HOLE, width: HOLE * 2, height: HOLE * 2, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg, boxShadow: shadow.sm }}>
        <Txt variant="title">
          {view.week}
        </Txt>
        <Txt variant="tiny" color="muted">
          {say.week}
        </Txt>
      </View>
      {view.jobs.map((job, index) => {
        const at = pointAt(CENTRE, middles[index]!, 63.6);
        return (
          <View key={job.id} style={{ position: 'absolute', left: at.x - 18, top: at.y - 18, width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}>
            <Emoji char={job.emoji ?? '🧹'} size={36} />
          </View>
        );
      })}
      {view.jobs.map((job, index) => {
        if (!job.who) return null;
        const at = pointAt(CENTRE, middles[index]!, 143, 123);
        return (
          <View key={job.id} style={{ position: 'absolute', left: at.x - 25, top: at.y - 25, borderRadius: radius.pill, borderWidth: 3, borderColor: colors.bg, boxShadow: shadow.float }}>
            <Avatar uri={job.who.avatarUrl} name={job.who.name ?? ''} size={44} />
          </View>
        );
      })}
    </Tap>
  );
}

/** A new job for the wheel: what it is, when it is done, and how often in a week. */
function AddJobSheet({ board, visible, onClose }: { board: Wheel; visible: boolean; onClose: () => void }) {
  return (
    <Sheet visible={visible} onClose={onClose} title={say.add.title} subtitle={say.add.lead}>
      {visible ? <AddJob board={board} onClose={onClose} /> : null}
    </Sheet>
  );
}

function AddJob({ board, onClose }: { board: Wheel; onClose: () => void }) {
  const changes = useBoardChanges(board);
  const clientId = useRef(newClientId());
  const [name, setName] = useState('');
  const [when, setWhen] = useState('');
  const [times, setTimes] = useState('1');
  const often = Math.min(Math.max(Number.parseInt(times, 10) || 1, 1), 7);
  return (
    <View style={{ gap: 12, paddingTop: 6, paddingHorizontal: layout.rowGutter }}>
      <Field label={say.add.name} value={name} onChangeText={setName} maxLength={80} autoFocus placeholder={say.add.namePlaceholder} error={changes.problem} />
      <Field label={say.add.when} value={when} onChangeText={setWhen} maxLength={80} placeholder={say.add.whenPlaceholder} />
      <Field label={say.add.times} value={times} onChangeText={(typed) => setTimes(typed.replace(/[^1-7]/g, '').slice(0, 1))} keyboardType="number-pad" maxLength={1} note={say.add.timesNote} />
      <Button label={say.add.save} size="lg" block disabled={!name.trim()} loading={changes.busy} onPress={() => void changes.add('job', { name: name.trim(), when: when.trim() || undefined, timesAWeek: often }, clientId.current).then((added) => (added ? onClose() : undefined))} />
    </View>
  );
}

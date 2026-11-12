import { Check, Euro, Eye, EyeOff, KeyRound, MapPin, Plus, RefreshCw, Sparkles, Users } from 'lucide-react-native';
import { type ReactNode, useRef, useState } from 'react';
import { View } from 'react-native';

import type { MysteryDateClueResponse, MysteryDateDateResponse, MysteryDateLineResponse, MysteryDateResponse, MysteryDateSettings } from '@/api/generated/homeport';
import { useCircles } from '@/features/circles/current';
import { membersOf } from '@/features/circles/members';
import { readTime } from '@/features/plan/times';
import { BoardFrame } from '@/features/templates/BoardFrame';
import { BoardRow, Face } from '@/features/templates/parts/Rows';
import type { Board, BoardScreenProps } from '@/features/templates/types';
import { useBoardChanges } from '@/features/templates/useBoard';
import { addDays, atTime, formatMonthName, formatTime, formatTimeOfDay, formatWeekdayDay, toISODate, today } from '@/lib/dates';
import { newClientId } from '@/lib/ids';
import { firstName } from '@/lib/names';
import { layout, radius, useTheme } from '@/theme';
import { Button } from '@/ui/Button';
import { ConfirmSheet } from '@/ui/ConfirmSheet';
import { DayPicker } from '@/ui/DayPicker';
import { Field, FieldButton } from '@/ui/Field';
import { GroupLabel } from '@/ui/Heading';
import { RoundButton } from '@/ui/RoundButton';
import { RowGroup, ToggleRow } from '@/ui/Rows';
import { Segmented } from '@/ui/Segmented';
import { Sheet } from '@/ui/Sheet';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

import { AccentCard, CardButton } from '../parts/AccentCard';
import { UpRow } from '../parts/UpRow';

type Dates = Board<MysteryDateResponse, MysteryDateSettings>;
type Coming = MysteryDateDateResponse;
/** What the + adds: a line of the plan, a clue, an idea for the jar. */
type Adds = 'line' | 'clue' | 'idea';
/** The pictures a line of the plan can have, by the API's word for each. */
type LineIcon = 'pin' | 'euro' | 'users';
const say = words.couple.mysteryDate;

const isIcon = (icon: string | null): icon is LineIcon => icon === 'pin' || icon === 'euro' || icon === 'users';

function lineIcon(icon: string | null, color: string): ReactNode {
  if (icon === 'pin') return <MapPin size={20} color={color} />;
  if (icon === 'euro') return <Euro size={20} color={color} />;
  if (icon === 'users') return <Users size={20} color={color} />;
  return <Sparkles size={20} color={color} />;
}

/** All the other one gets before the date: the time and the hint, as one line. Null when there is neither. */
function knownOf(date: Coming): string | null {
  return [date.time ? formatTimeOfDay(date.time) : null, date.hint].filter(Boolean).join('. ') || null;
}

/**
 * 17.6 Mystery date. The two take turns planning. Whoever plans sees the plan, its clues and the jar of
 * ideas; the other one gets a time and a hint, and the clues as each one's moment comes, and the API sends
 * them nothing else until the date is revealed. Under it, the dates there have been and who planned each.
 */
export function MysteryDate({ board }: BoardScreenProps<MysteryDateResponse, MysteryDateSettings>) {
  const view = board.view;
  const next = view.next;
  const changes = useBoardChanges(board);
  const circle = useCircles().find((one) => one.id === board.circleId);
  /** The first names of everyone else: who the plan is hidden from. */
  const others = circle
    ? membersOf(circle)
        .filter((member) => member.kind === 'person' && !member.you)
        .map((member) => firstName(member.name))
    : [];
  const [planning, setPlanning] = useState(false);
  const [adding, setAdding] = useState<Adds | null>(null);
  const [jar, setJar] = useState(false);
  const [revealing, setRevealing] = useState(false);
  const [lineId, setLineId] = useState<string | null>(null);
  const [clueId, setClueId] = useState<string | null>(null);
  const yours = !!next?.yours;
  const hidden = yours && !next?.revealed;
  const line = next?.plan.find((one) => one.id === lineId) ?? null;
  const clue = next?.clues.find((one) => one.id === clueId) ?? null;

  const shake = async () => {
    if (await changes.act('shake')) setJar(true);
  };

  return (
    <BoardFrame
      board={board}
      title={board.title}
      chip="menu"
      problem={jar ? null : changes.problem}
      actions={<RoundButton label={next ? (yours ? say.add.button : say.jar.add) : say.plan.button} onPress={() => (next ? setAdding(yours ? 'line' : 'idea') : setPlanning(true))} icon={(color) => <Plus size={20} color={color} />} />}
      menu={hidden && next ? [{ icon: (color) => <Eye size={20} color={color} />, label: say.reveal.menu, note: say.reveal.note(others), onPress: () => setRevealing(true) }] : undefined}>
      {next ? (
        <AccentCard eyebrow={say.card.eyebrow(formatWeekdayDay(next.day), yours, next.planner?.name ?? '')} title={titleOf(next, others)} line={underOf(next, others)}>
          {hidden ? (
            <>
              <CardButton label={say.card.change} onPress={() => setPlanning(true)} />
              <CardButton soft label={say.card.shake} icon={(color) => <RefreshCw size={16} color={color} />} loading={changes.busy && !jar} onPress={() => void shake()} />
            </>
          ) : null}
        </AccentCard>
      ) : (
        <AccentCard eyebrow={say.none.eyebrow(view.yourTurn, view.turn?.name ?? '')} title={say.none.title(view.yourTurn)} line={say.none.line}>
          <CardButton label={say.plan.button} onPress={() => setPlanning(true)} />
        </AccentCard>
      )}

      {next && next.plan.length > 0 ? (
        <>
          <GroupLabel style={{ marginHorizontal: layout.gutter }}>{yours ? say.plan.yours : say.plan.theirs}</GroupLabel>
          <RowGroup>
            {next.plan.map((one, index) => (
              <PlanRow key={one.id} line={one} first={index === 0} hiddenFrom={hidden && index === 0 ? others : null} onPress={yours ? () => setLineId(one.id) : undefined} />
            ))}
          </RowGroup>
        </>
      ) : null}

      {next && (next.clues.length > 0 || (!yours && next.cluesToCome > 0)) ? (
        <>
          <GroupLabel style={{ marginHorizontal: layout.gutter }}>{say.clues.label}</GroupLabel>
          <RowGroup>
            {next.clues.map((one, index) => (
              <BoardRow
                key={one.id}
                first={index === 0}
                leading={<Lead>{(color) => <KeyRound size={20} color={color} />}</Lead>}
                title={one.text}
                line={yours ? clueLine(one) : null}
                onPress={yours ? () => setClueId(one.id) : undefined}
              />
            ))}
            {!yours && next.cluesToCome > 0 ? <BoardRow first={next.clues.length === 0} leading={<Lead>{(color) => <EyeOff size={20} color={color} />}</Lead>} title={say.clues.toCome(next.cluesToCome)} line={say.clues.toComeLine} /> : null}
          </RowGroup>
        </>
      ) : null}

      <GroupLabel style={{ marginHorizontal: layout.gutter }}>{say.turns.label(view.thisYear)}</GroupLabel>
      {view.past.length === 0 ? (
        <Txt variant="callout" color="muted" style={{ marginHorizontal: layout.gutter }}>
          {say.turns.none}
        </Txt>
      ) : (
        view.past.map((past) => (
          <UpRow key={past.id} leading={<Face uri={past.planner?.avatarUrl} name={past.planner?.name ?? ''} size={44} />} title={past.title ?? say.turns.untitled} line={say.turns.planned(past.yours ? null : (past.planner?.name ?? ''), formatMonthName(past.day))} />
        ))
      )}

      <DateSheet board={board} visible={planning} date={next} onClose={() => setPlanning(false)} />
      <AddSheet board={board} date={next} what={adding} mayPlan={yours} onClose={() => setAdding(null)} />
      <JarSheet board={board} visible={jar} onClose={() => setJar(false)} />
      <LineSheet board={board} line={line} onClose={() => setLineId(null)} />
      <ClueSheet board={board} clue={clue} onClose={() => setClueId(null)} />
      <ConfirmSheet
        visible={revealing}
        onClose={() => setRevealing(false)}
        title={say.reveal.title}
        body={say.reveal.body(others)}
        confirm={say.reveal.confirm}
        busy={changes.busy}
        problem={changes.problem}
        onConfirm={() => (next ? void changes.act('reveal', { entryId: next.id }).then((shown) => (shown ? setRevealing(false) : undefined)) : undefined)}
      />
    </BoardFrame>
  );
}

/** The card's large words: what the other one can see, for the planner; the time and the hint, for the other one; what it is, once revealed. */
function titleOf(date: Coming, others: readonly string[]): string {
  const known = knownOf(date);
  if (date.revealed) return date.title ?? known ?? say.card.noHint;
  if (date.yours) return known ? say.card.allTheySee(others, known) : say.card.onlyTheDay(others);
  return known ? say.quoted(known) : say.card.noHint;
}

function underOf(date: Coming, others: readonly string[]): string {
  if (date.revealed) return say.card.revealed;
  return date.yours ? say.card.hiddenFrom(others) : say.card.allYouGet;
}

function clueLine(clue: MysteryDateClueResponse): string {
  if (clue.open) return say.clues.open;
  return clue.opensAt ? say.clues.opens(formatWeekdayDay(toISODate(new Date(clue.opensAt))), formatTime(clue.opensAt)) : say.clues.open;
}

/** A bare icon at the start of a row, as wide as the others so the titles line up. */
function Lead({ children }: { children: (color: string) => ReactNode }) {
  const { colors } = useTheme();
  return <View style={{ width: 22, alignItems: 'center' }}>{children(colors.text)}</View>;
}

/** One line of the plan: its picture, what it is and a note, who it is hidden from, and a tick once it is sorted. */
function PlanRow({ line, first, hiddenFrom, onPress }: { line: MysteryDateLineResponse; first: boolean; hiddenFrom: readonly string[] | null; onPress?: () => void }) {
  const { colors } = useTheme();
  return (
    <BoardRow
      first={first}
      leading={<Lead>{(color) => lineIcon(line.icon, color)}</Lead>}
      title={line.title}
      line={line.note}
      spoken={words.common.spoken([line.title, line.note, hiddenFrom ? say.plan.notFor(hiddenFrom) : null, line.ready ? say.line.sorted : null])}
      onPress={onPress}
      trailing={
        hiddenFrom || line.ready ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {hiddenFrom ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 26, paddingLeft: 7, paddingRight: 9, borderRadius: radius.pill, backgroundColor: colors.accentSoft }}>
                <EyeOff size={13} color={colors.accentText} />
                <Txt variant="small" weight={700} color="accentText" numberOfLines={1}>
                  {say.plan.notFor(hiddenFrom)}
                </Txt>
              </View>
            ) : null}
            {line.ready ? <Check size={20} color={colors.ok} strokeWidth={2.6} /> : null}
          </View>
        ) : undefined
      }
    />
  );
}

/** Planning a date, or changing the one that is coming: the day, the time, the hint the other one gets, and what it is. */
function DateSheet({ board, visible, date, onClose }: { board: Dates; visible: boolean; date: Coming | null; onClose: () => void }) {
  return (
    <Sheet visible={visible} onClose={onClose} title={date ? say.plan.change : say.plan.title} subtitle={say.plan.lead}>
      {visible ? <Planning board={board} date={date} onClose={onClose} /> : null}
    </Sheet>
  );
}

function Planning({ board, date, onClose }: { board: Dates; date: Coming | null; onClose: () => void }) {
  const changes = useBoardChanges(board);
  const clientId = useRef(newClientId());
  const [day, setDay] = useState(date?.day ?? addDays(today(), 7));
  const [time, setTime] = useState(date?.time ?? '');
  const [hint, setHint] = useState(date?.hint ?? '');
  const [title, setTitle] = useState(date?.title ?? '');
  const [picking, setPicking] = useState(false);
  const read = readTime(time);
  const badTime = time.trim().length > 0 && !read;

  const save = async () => {
    // The moment it starts is told by this phone's clock, so it is revealed when the evening really begins.
    const at = read ? atTime(day, read)?.toISOString() : undefined;
    const fields = { day, time: read ?? '', at, hint: hint.trim(), title: title.trim() };
    const saved = date ? await changes.change(date.id, fields) : await changes.add('date', fields, clientId.current);
    if (saved) onClose();
  };

  return (
    <View style={{ gap: 12, paddingTop: 6, paddingHorizontal: layout.rowGutter }}>
      <View style={{ flexDirection: 'row' }}>
        <FieldButton label={say.plan.day} value={formatWeekdayDay(day)} onPress={() => setPicking(true)} />
      </View>
      <Field label={say.plan.time} value={time} onChangeText={setTime} maxLength={8} placeholder={say.plan.timePlaceholder} autoCapitalize="none" autoCorrect={false} error={badTime ? say.plan.notATime : null} />
      <Field label={say.plan.hint} value={hint} onChangeText={setHint} maxLength={200} placeholder={say.plan.hintPlaceholder} note={say.plan.hintNote} />
      <Field label={say.plan.what} value={title} onChangeText={setTitle} maxLength={200} placeholder={say.plan.whatPlaceholder} note={say.plan.whatNote} />
      {changes.problem ? (
        <Txt variant="caption" color="danger" accessibilityLiveRegion="polite">
          {changes.problem}
        </Txt>
      ) : null}
      <Button label={date ? say.plan.save : say.plan.start} size="lg" block disabled={badTime} loading={changes.busy} onPress={() => void save()} />
      {date ? <Button label={say.plan.callOff} variant="quiet" block disabled={changes.busy} onPress={() => void changes.remove(date.id).then((gone) => (gone ? onClose() : undefined))} /> : null}
      <DayPicker visible={picking} onClose={() => setPicking(false)} title={say.plan.day} value={day} min={today()} onChange={setDay} />
    </View>
  );
}

/** What the + adds: a line of the plan or a clue (the planner's), or an idea for the jar (anyone's). */
function AddSheet({ board, date, what, mayPlan, onClose }: { board: Dates; date: Coming | null; what: Adds | null; mayPlan: boolean; onClose: () => void }) {
  return (
    <Sheet visible={what !== null} onClose={onClose} title={mayPlan ? say.add.title : say.jar.add} subtitle={mayPlan ? undefined : say.jar.lead}>
      {what ? <Adding key={what} board={board} date={date} startsAs={what} mayPlan={mayPlan} onClose={onClose} /> : null}
    </Sheet>
  );
}

function Adding({ board, date, startsAs, mayPlan, onClose }: { board: Dates; date: Coming | null; startsAs: Adds; mayPlan: boolean; onClose: () => void }) {
  const changes = useBoardChanges(board);
  const clientId = useRef(newClientId());
  const [what, setWhat] = useState<Adds>(startsAs);
  const [text, setText] = useState('');
  const [note, setNote] = useState('');
  const [icon, setIcon] = useState<LineIcon>('pin');
  const [day, setDay] = useState<string | null>(null);
  const [time, setTime] = useState('');
  const [picking, setPicking] = useState(false);
  const opensAt = what === 'clue' && day ? atTime(day, readTime(time) ?? '') : null;
  const ready = text.trim().length > 0 && (what !== 'clue' || !day || opensAt !== null);

  const save = async () => {
    const typed = text.trim();
    const added =
      what === 'idea'
        ? await changes.add('idea', { text: typed }, clientId.current)
        : what === 'clue'
          ? await changes.add('clue', { dateId: date?.id, text: typed, opensAt: opensAt?.toISOString() }, clientId.current)
          : await changes.add('line', { dateId: date?.id, title: typed, note: note.trim() || undefined, icon }, clientId.current);
    if (added) onClose();
  };

  return (
    <View style={{ gap: 12, paddingTop: 6 }}>
      {mayPlan ? (
        <Segmented
          label={say.add.what}
          value={what}
          onChange={setWhat}
          options={[
            { id: 'line', label: say.add.kinds.line },
            { id: 'clue', label: say.add.kinds.clue },
            { id: 'idea', label: say.add.kinds.idea },
          ]}
        />
      ) : null}
      <View style={{ gap: 12, paddingHorizontal: layout.rowGutter }}>
        <Field label={say.add.labels[what]} value={text} onChangeText={setText} maxLength={what === 'clue' ? 300 : 200} autoFocus placeholder={say.add.placeholders[what]} note={say.add.notes[what]} />
        {what === 'line' ? <Field label={say.line.note} value={note} onChangeText={setNote} maxLength={200} placeholder={say.line.notePlaceholder} /> : null}
      </View>
      {what === 'line' ? <IconChoice value={icon} onChange={setIcon} /> : null}
      <View style={{ gap: 12, paddingHorizontal: layout.rowGutter }}>
        {what === 'clue' ? (
          <>
            <View style={{ flexDirection: 'row' }}>
              <FieldButton label={say.clues.opensOn} value={day ? formatWeekdayDay(day) : say.clues.atOnce} onPress={() => setPicking(true)} />
            </View>
            {day ? <Field label={say.clues.opensAt} value={time} onChangeText={setTime} maxLength={8} placeholder={say.plan.timePlaceholder} autoCapitalize="none" autoCorrect={false} error={time.trim() && !readTime(time) ? say.plan.notATime : null} /> : null}
          </>
        ) : null}
        {changes.problem ? (
          <Txt variant="caption" color="danger" accessibilityLiveRegion="polite">
            {changes.problem}
          </Txt>
        ) : null}
        <Button label={say.add.save[what]} size="lg" block disabled={!ready} loading={changes.busy} onPress={() => void save()} />
      </View>
      <DayPicker visible={picking} onClose={() => setPicking(false)} title={say.clues.opensOn} value={day ?? date?.day ?? today()} min={today()} max={date?.day} onChange={setDay} />
    </View>
  );
}

/** The picture a line of the plan gets: a place, money, people. */
function IconChoice({ value, onChange }: { value: LineIcon; onChange: (icon: LineIcon) => void }) {
  return (
    <Segmented
      label={say.line.icon}
      value={value}
      onChange={onChange}
      options={[
        { id: 'pin', label: say.line.icons.pin },
        { id: 'euro', label: say.line.icons.euro },
        { id: 'users', label: say.line.icons.users },
      ]}
    />
  );
}

/** What the jar gave: the idea, and whether to make it the plan, shake again, or put another idea in. */
function JarSheet({ board, visible, onClose }: { board: Dates; visible: boolean; onClose: () => void }) {
  const changes = useBoardChanges(board);
  const clientId = useRef(newClientId());
  const date = board.view.next;
  const idea = date?.suggestion ?? null;
  const use = async () => {
    if (!date || !idea) return;
    // The idea becomes what the date is, and the first line of its plan.
    if (!(await changes.add('line', { dateId: date.id, title: idea, icon: 'pin' }, clientId.current))) return;
    clientId.current = newClientId();
    if (await changes.change(date.id, { title: idea })) onClose();
  };
  return (
    <Sheet visible={visible} onClose={onClose} title={idea ?? say.jar.empty} subtitle={say.jar.count(board.view.ideas)}>
      <View style={{ gap: 10, paddingTop: 6, paddingHorizontal: layout.rowGutter }}>
        {changes.problem ? (
          <Txt variant="caption" color="danger" accessibilityLiveRegion="polite">
            {changes.problem}
          </Txt>
        ) : null}
        {idea ? <Button label={say.jar.use} size="lg" block loading={changes.busy} onPress={() => void use()} /> : null}
        <Button label={say.jar.again} variant="soft" size="lg" block disabled={changes.busy} icon={(color) => <RefreshCw size={18} color={color} />} onPress={() => void changes.act('shake')} />
      </View>
    </Sheet>
  );
}

/** A line of the plan, pressed: what it is, its note and picture, whether it is sorted, and the way to take it out. */
function LineSheet({ board, line, onClose }: { board: Dates; line: MysteryDateLineResponse | null; onClose: () => void }) {
  return (
    <Sheet visible={line !== null} onClose={onClose} title={say.line.title}>
      {line ? <Lining key={line.id} board={board} line={line} onClose={onClose} /> : null}
    </Sheet>
  );
}

function Lining({ board, line, onClose }: { board: Dates; line: MysteryDateLineResponse; onClose: () => void }) {
  const changes = useBoardChanges(board);
  const [title, setTitle] = useState(line.title);
  const [note, setNote] = useState(line.note ?? '');
  const [icon, setIcon] = useState<LineIcon>(isIcon(line.icon) ? line.icon : 'pin');
  const [ready, setReady] = useState(line.ready);
  return (
    <View style={{ gap: 12, paddingTop: 6 }}>
      <View style={{ gap: 12, paddingHorizontal: layout.rowGutter }}>
        <Field label={say.add.labels.line} value={title} onChangeText={setTitle} maxLength={200} />
        <Field label={say.line.note} value={note} onChangeText={setNote} maxLength={200} placeholder={say.line.notePlaceholder} />
      </View>
      <IconChoice value={icon} onChange={setIcon} />
      <ToggleRow first label={say.line.sorted} note={say.line.sortedNote} value={ready} onChange={setReady} />
      <View style={{ gap: 10, paddingHorizontal: layout.rowGutter }}>
        {changes.problem ? (
          <Txt variant="caption" color="danger" accessibilityLiveRegion="polite">
            {changes.problem}
          </Txt>
        ) : null}
        <Button label={say.line.save} size="lg" block disabled={!title.trim()} loading={changes.busy} onPress={() => void changes.change(line.id, { title: title.trim(), note: note.trim(), icon, ready }).then((saved) => (saved ? onClose() : undefined))} />
        <Button label={say.line.remove} variant="quiet" block disabled={changes.busy} onPress={() => void changes.remove(line.id).then((gone) => (gone ? onClose() : undefined))} />
      </View>
    </View>
  );
}

/** A clue, pressed by its planner: its words, and the way to take it out. */
function ClueSheet({ board, clue, onClose }: { board: Dates; clue: MysteryDateClueResponse | null; onClose: () => void }) {
  return (
    <Sheet visible={clue !== null} onClose={onClose} title={say.clues.title} subtitle={clue ? clueLine(clue) : undefined}>
      {clue ? <Cluing key={clue.id} board={board} clue={clue} onClose={onClose} /> : null}
    </Sheet>
  );
}

function Cluing({ board, clue, onClose }: { board: Dates; clue: MysteryDateClueResponse; onClose: () => void }) {
  const changes = useBoardChanges(board);
  const [text, setText] = useState(clue.text);
  return (
    <View style={{ gap: 10, paddingTop: 6, paddingHorizontal: layout.rowGutter }}>
      <Field label={say.add.labels.clue} value={text} onChangeText={setText} maxLength={300} error={changes.problem} />
      <Button label={say.clues.save} size="lg" block disabled={!text.trim() || text.trim() === clue.text} loading={changes.busy} onPress={() => void changes.change(clue.id, { text: text.trim() }).then((saved) => (saved ? onClose() : undefined))} />
      <Button label={say.clues.remove} variant="quiet" block disabled={changes.busy} onPress={() => void changes.remove(clue.id).then((gone) => (gone ? onClose() : undefined))} />
    </View>
  );
}

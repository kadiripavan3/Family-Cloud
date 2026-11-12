import { Check, Hourglass, Plus, SlidersHorizontal } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { View } from 'react-native';

import type { CircleResponse, FairerSplitSettings, FairerSplitShareResponse, FairerSplitSplitResponse, FairerSplitVersionResponse, FairerSplitViewResponse } from '@/api/generated/homeport';
import { membersOf } from '@/features/circles/members';
import { readCents } from '@/features/plan/times';
import { BoardFrame } from '@/features/templates/BoardFrame';
import { PersonChips } from '@/features/templates/parts/People';
import type { Board, BoardScreenProps } from '@/features/templates/types';
import { useBoardChanges } from '@/features/templates/useBoard';
import { addDays, addMonths, formatDayFull, formatDayOfYear, formatRange, formatWeekdayDay, monthOf, today } from '@/lib/dates';
import { newClientId } from '@/lib/ids';
import { formatMoney } from '@/lib/money';
import { firstName } from '@/lib/names';
import { layout, radius, useTheme } from '@/theme';
import { Avatar } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { Chip } from '@/ui/Chip';
import { DayPicker } from '@/ui/DayPicker';
import { Field, FieldButton } from '@/ui/Field';
import { GroupLabel } from '@/ui/Heading';
import { Tap } from '@/ui/Motion';
import { NoteBox } from '@/ui/NoteBox';
import { Segmented } from '@/ui/Segmented';
import { Sheet } from '@/ui/Sheet';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

import { exactMoney, roundMoney } from '../money';
import { called, isMe, useFlat } from '../people';
import { centsAt, move, placeOf, rangeOf, stepOf } from './shares';
import { ShareSlider } from './ShareSlider';

type Splits = Board<FairerSplitViewResponse, FairerSplitSettings>;
type Split = FairerSplitSplitResponse;
type Version = FairerSplitVersionResponse;
type Share = FairerSplitShareResponse;
/** The tabs a split stands under. "Other" is drawn only when something is under it. */
type Group = 'rent' | 'bills' | 'kitty' | 'other';
type Way = 'equal' | 'room' | 'nights' | 'use';
const GROUPS: readonly Group[] = ['rent', 'bills', 'kitty', 'other'];
const WAYS: readonly Way[] = ['equal', 'room', 'nights', 'use'];
const say = words.flat.split;

const groupOf = (split: Split): Group => (GROUPS as readonly string[]).includes(split.group) ? (split.group as Group) : 'other';
const wayOf = (version: Version) => (version.way in say.by ? (version.way as keyof typeof say.by) : 'own');
/** The day everyone had said yes: "1 September", with its year when that isn't this one. */
const agreedDay = (day: string) => (day.slice(0, 4) === today().slice(0, 4) ? formatDayOfYear(day) : formatDayFull(day));
/** What a share goes by, and the few words the flat wrote about it: "18 m², the big room". */
const about = (share: Share, version: Version) => [share.measure === null ? null : say.measure(wayOf(version), share.measure), share.note].filter(Boolean).join(', ');

/**
 * 18.4 A fairer split. The tabs are what the flat splits: the rent, the bills, the kitty. Something that is
 * split the same way every month is drawn with a slider for each person: dragging one moves the others to
 * keep the total, and the new numbers are a proposal that counts only once everyone has said yes. Until
 * then the split that was agreed before stays in force, and the page says so. A bill that is paid once is
 * drawn as bars, the largest share first; pressing it shows the exact amounts and who has paid their share.
 * Under the rent the newest bill stands too, as the drawing has it.
 */
export function FairerSplit({ board }: BoardScreenProps<FairerSplitViewResponse, FairerSplitSettings>) {
  const view = board.view;
  const { circle, me } = useFlat(board.circleId);
  const has = (group: Group) => view.splits.some((split) => groupOf(split) === group);
  const [tab, setTab] = useState<Group>(() => GROUPS.find(has) ?? 'rent');
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const tabs = GROUPS.filter((group) => group !== 'other' || has('other') || tab === 'other');
  const here = view.splits.filter((split) => groupOf(split) === tab);
  // Bills come and go: the newest stands first. What is split every month keeps the order it was added in.
  const shown = tab === 'bills' ? [...here].reverse() : here;
  const newestBill = tab === 'bills' ? undefined : [...view.splits].reverse().find((split) => !split.repeats && groupOf(split) !== tab && (split.agreed ?? split.proposed));
  const opened = view.splits.find((split) => split.id === openId) ?? null;

  return (
    <BoardFrame board={board} title={board.title} chip="menu" menu={board.canEdit ? [{ icon: (color) => <Plus size={20} color={color} />, label: say.add.open, onPress: () => setAdding(true) }] : undefined}>
      <Segmented label={say.tabsLabel} options={tabs.map((id) => ({ id, label: say.tabs[id] }))} value={tab} onChange={setTab} />
      {shown.map((split) => (split.repeats ? <Sliders key={split.id} board={board} split={split} me={me} /> : <Bill key={split.id} split={split} me={me} onPress={() => setOpenId(split.id)} />))}
      {shown.length === 0 ? (
        <View style={{ alignItems: 'center', gap: 14, paddingTop: 28, paddingHorizontal: layout.gutter }}>
          <Txt variant="callout" color="muted" center>
            {say.empty[tab]}
          </Txt>
          {board.canEdit ? <Button label={say.add.open} variant="soft" inline onPress={() => setAdding(true)} /> : null}
        </View>
      ) : null}
      {newestBill ? <Bill split={newestBill} me={me} onPress={() => setOpenId(newestBill.id)} /> : null}

      <BillSheet board={board} split={opened} me={me} onClose={() => setOpenId(null)} />
      <AddSheet
        key={tab}
        board={board}
        circle={circle}
        group={tab}
        visible={adding}
        onClose={() => setAdding(false)}
        onAdded={(group) => {
          setAdding(false);
          setTab(group);
        }}
      />
    </BoardFrame>
  );
}

/** Where a split stands, under its numbers: agreed and since when, or proposed and who it waits for, with the yes or the way to take it back. */
function Standing({ board, split, me, hint }: { board: Splits; split: Split; me: string | null; hint?: string }) {
  const changes = useBoardChanges(board);
  const { agreed, proposed } = split;
  if (proposed) {
    const others = proposed.waitingFor.filter((person) => !isMe(person, me)).map((person) => person.name ?? '');
    const counts = agreed?.agreedOn ? say.pending.until(agreedDay(agreed.agreedOn), say.pending.shares(agreed.shares.map((share) => ({ name: called(share.person, me), amount: roundMoney(share.cents, split.currency) })))) : say.pending.first;
    return (
      <View style={{ gap: 10, marginTop: 16, marginHorizontal: layout.barGutter }}>
        <NoteBox icon={(color) => <Hourglass size={20} color={color} />} title={proposed.yours ? say.pending.yours : say.pending.theirs(proposed.proposedBy?.name ?? '')}>
          {say.pending.line(say.pending.waiting(others, proposed.needsYou), counts)}
        </NoteBox>
        {changes.problem ? (
          <Txt variant="caption" color="danger" accessibilityLiveRegion="polite">
            {changes.problem}
          </Txt>
        ) : null}
        {proposed.needsYou || proposed.yours ? (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {proposed.needsYou ? <Button label={say.pending.yes} size="sm" loading={changes.busy} onPress={() => void changes.act('agree', { proposalId: proposed.id })} /> : null}
            {proposed.yours && board.canEdit ? <Button label={say.pending.takeBack} variant="soft" size="sm" loading={changes.busy} onPress={() => void changes.remove(proposed.id)} /> : null}
          </View>
        ) : null}
      </View>
    );
  }
  if (!agreed?.agreedOn) return null;
  return (
    <NoteBox soft icon={(color) => <Check size={20} color={color} />} title={say.agreed(agreed.agreedBy.length, agreedDay(agreed.agreedOn))} style={{ marginTop: 16, marginHorizontal: layout.barGutter }}>
      {hint ?? say.counts}
    </NoteBox>
  );
}

/**
 * Something split the same way every month: a slider for each person, the total under them, and where it
 * stands. What the sliders show is what is on the table: a proposal that waits, or else what was agreed.
 * Dragged numbers are the viewer's own until they propose them.
 */
function Sliders({ board, split, me }: { board: Splits; split: Split; me: string | null }) {
  const { colors } = useTheme();
  const changes = useBoardChanges(board);
  const version = split.proposed ?? split.agreed;
  /** The viewer's own numbers, while they differ from what is on the table. */
  const [draft, setDraft] = useState<number[] | null>(null);
  /** Where every share stood when the drag that is going on began. */
  const grabbedAt = useRef<number[] | null>(null);
  if (!version) return <Nothing board={board} split={split} />;

  const table = version.shares.map((share) => share.cents);
  const cents = draft && draft.length === table.length ? draft : table;
  const range = rangeOf(table);
  const locked = !board.canEdit || table.length < 2 || version.shares.some((share) => !share.person);
  const set = (next: number[]) => setDraft(next.every((one, index) => one === table[index]) ? null : next);
  const propose = () =>
    void changes
      .act('propose', { splitId: split.id, parts: version.shares.map((share, index) => ({ memberId: share.person?.memberId, cents: cents[index], measure: share.measure ?? undefined, note: share.note ?? undefined })) })
      .then((saved) => (saved ? setDraft(null) : undefined));

  return (
    <View>
      <View style={{ gap: 1, marginTop: 14, marginHorizontal: layout.rowGutter }}>
        {version.shares.map((share, index) => {
          const who = called(share.person, me);
          const amount = formatMoney(cents[index]!, split.currency);
          return (
            <View key={share.person?.memberId ?? index}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: -4 }}>
                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Avatar uri={share.person?.avatarUrl} name={share.person?.name ?? ''} size={22} />
                  <Txt variant="caption" color="muted" numberOfLines={1} style={{ flex: 1 }}>
                    {words.common.join([who, about(share, version)])}
                  </Txt>
                </View>
                <Txt variant="headline" weight={800} style={{ fontVariant: ['tabular-nums'] }}>
                  {amount}
                </Txt>
              </View>
              <ShareSlider
                label={say.sliderOf(split.name, share.you ? null : who)}
                valueText={amount}
                place={placeOf(cents[index]!, range)}
                locked={locked}
                onGrab={() => {
                  grabbedAt.current = cents;
                }}
                onDrop={() => {
                  grabbedAt.current = null;
                }}
                onMove={(place) => set(move(grabbedAt.current ?? cents, index, centsAt(place, range), range))}
                onNudge={(by) => set(move(cents, index, cents[index]! + by * stepOf(version.totalCents), range))}
              />
            </View>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginTop: 1, marginHorizontal: layout.rowGutter, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.line }}>
        <Txt variant="callout" weight={700}>
          {say.total(split.name)}
        </Txt>
        <Txt variant="callout" weight={700} style={{ fontVariant: ['tabular-nums'] }}>
          {formatMoney(version.totalCents, split.currency)}
        </Txt>
      </View>
      {draft ? (
        <View style={{ gap: 10, marginTop: 16, marginHorizontal: layout.barGutter }}>
          <NoteBox icon={(color) => <SlidersHorizontal size={20} color={color} />} title={say.draft.title}>
            {say.draft.body}
          </NoteBox>
          {changes.problem ? (
            <Txt variant="caption" color="danger" accessibilityLiveRegion="polite">
              {changes.problem}
            </Txt>
          ) : null}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button label={say.draft.propose} size="sm" loading={changes.busy} onPress={propose} />
            <Button label={say.draft.back} variant="soft" size="sm" onPress={() => setDraft(null)} />
          </View>
        </View>
      ) : (
        <Standing board={board} split={split} me={me} hint={locked ? undefined : say.howTo} />
      )}
    </View>
  );
}

/** A split with nothing on the table: its only proposal was taken back before anyone agreed. Whoever added it can take it away. */
function Nothing({ board, split }: { board: Splits; split: Split }) {
  const changes = useBoardChanges(board);
  return (
    <View style={{ gap: 10, marginTop: 16, marginHorizontal: layout.barGutter }}>
      <NoteBox icon={(color) => <Hourglass size={20} color={color} />} title={split.title}>
        {changes.problem ?? say.nothing}
      </NoteBox>
      {board.canEdit ? <Button label={say.remove} variant="soft" size="sm" loading={changes.busy} onPress={() => void changes.remove(split.id)} /> : null}
    </View>
  );
}

/** A bill that is paid once, as bars: who pays the most first, each bar against the largest share. */
function Bill({ split, me, onPress }: { split: Split; me: string | null; onPress: () => void }) {
  const { colors } = useTheme();
  const version = split.agreed ?? split.proposed;
  if (!version) return null;
  const shares = [...version.shares].sort((a, b) => b.cents - a.cents);
  const most = Math.max(shares[0]?.cents ?? 0, 1);
  const heading = say.billHeading(split.title, say.by[wayOf(version)]);
  return (
    <Tap accessibilityRole="button" accessibilityLabel={words.common.spoken([heading, ...shares.map((share) => say.shareSpoken(called(share.person, me), roundMoney(share.cents, split.currency)))])} scaleTo={0.99} onPress={onPress}>
      <GroupLabel style={{ marginHorizontal: layout.gutter }}>{heading}</GroupLabel>
      {shares.map((share, index) => (
        <View key={share.person?.memberId ?? index} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 7, paddingHorizontal: layout.rowGutter }}>
          <Avatar uri={share.person?.avatarUrl} name={share.person?.name ?? ''} size={34} />
          <Txt variant="control">{called(share.person, me)}</Txt>
          <View style={{ flex: 1, height: 6, borderRadius: radius.pill, overflow: 'hidden', backgroundColor: colors.fill2 }}>
            <View style={{ width: `${(Math.max(share.cents, 0) / most) * 100}%`, height: 6, borderRadius: radius.pill, backgroundColor: colors.accent }} />
          </View>
          <Txt variant="footnote" weight={600} color="muted" style={{ minWidth: 46, textAlign: 'right' }}>
            {roundMoney(share.cents, split.currency)}
          </Txt>
        </View>
      ))}
      {split.proposed ? (
        <Txt variant="footnote" color="muted" style={{ marginTop: 4, marginHorizontal: layout.gutter }}>
          {say.pending.short}
        </Txt>
      ) : null}
    </Tap>
  );
}

/** A bill, pressed: the exact shares, who has paid theirs (a tick each person sets for themselves, and whoever paid the bill for anyone), and where it stands. */
function BillSheet({ board, split, me, onClose }: { board: Splits; split: Split | null; me: string | null; onClose: () => void }) {
  const { colors } = useTheme();
  const changes = useBoardChanges(board);
  const version = split ? (split.agreed ?? split.proposed) : null;
  const iPaidIt = !!split && isMe(split.payer, me);
  /** A share can be ticked once the split counts; the share of whoever paid the bill is paid by that. */
  const canTick = (share: Share) => !!split?.agreed && !split.repeats && !isMe(share.person, split.payer?.memberId ?? null) && (share.you || iPaidIt);
  const mine = split?.agreed?.shares.find((share) => share.you && !share.paid && canTick(share));
  return (
    <Sheet
      visible={split !== null}
      onClose={onClose}
      title={split?.title}
      subtitle={split && version ? words.common.join([exactMoney(version.totalCents, split.currency), split.from && split.to ? formatRange(split.from, split.to) : null, split.payer ? say.paidBy(called(split.payer, me)) : null]) : undefined}>
      {split && version ? (
        <View style={{ gap: 12, paddingTop: 6 }}>
          <View style={{ gap: 12, paddingHorizontal: layout.rowGutter }}>
            {version.shares.map((share, index) => {
              const who = called(share.person, me);
              return (
                <View key={share.person?.memberId ?? index} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 }}>
                  <Avatar uri={share.person?.avatarUrl} name={share.person?.name ?? ''} size={34} />
                  <View style={{ flex: 1 }}>
                    <Txt variant="item">{who}</Txt>
                    <Txt variant="footnote" color="muted">
                      {words.common.join([exactMoney(share.cents, split.currency), about(share, version)])}
                    </Txt>
                  </View>
                  {split.agreed && !split.repeats ? (
                    <Tap
                      accessibilityRole="checkbox"
                      accessibilityLabel={say.paidTick(share.you ? null : who)}
                      accessibilityState={{ checked: share.paid, disabled: !canTick(share) }}
                      // Said this way, a browser hears whether it is ticked as well: the web takes no `accessibilityState`.
                      aria-checked={share.paid}
                      disabled={!canTick(share) || changes.busy}
                      hitSlop={10}
                      onPress={() => void changes.act('paid', { splitId: split.id, memberId: share.person?.memberId, paid: !share.paid })}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, opacity: canTick(share) || share.paid ? 1 : 0.45 }}>
                      <Txt variant="footnote" weight={700} color={share.paid ? 'ok' : 'muted'}>
                        {share.paid ? say.paid : say.notPaid}
                      </Txt>
                      <View style={{ width: 24, height: 24, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', borderWidth: share.paid ? 0 : 2, borderColor: colors.lineStrong, backgroundColor: share.paid ? colors.accent : 'transparent' }}>
                        {share.paid ? <Check size={14} color={colors.onAccent} strokeWidth={3} /> : null}
                      </View>
                    </Tap>
                  ) : null}
                </View>
              );
            })}
            {changes.problem ? (
              <Txt variant="caption" color="danger" accessibilityLiveRegion="polite">
                {changes.problem}
              </Txt>
            ) : null}
            {mine ? <Button label={say.payMine(exactMoney(mine.cents, split.currency))} size="lg" block loading={changes.busy} onPress={() => void changes.act('paid', { splitId: split.id })} /> : null}
          </View>
          <Standing board={board} split={split} me={me} hint={split.settled ? say.settled : say.countsBill} />
        </View>
      ) : null}
    </Sheet>
  );
}

type AddProps = { board: Splits; circle: CircleResponse | null; group: Group; visible: boolean; onClose: () => void; onAdded: (group: Group) => void };

/**
 * Something new to split: what it is, which tab it stands under, how much there is, and the rule. By room
 * size it asks for each room and the shared space; by nights at home for the days the bill is for (the
 * nights away are counted from Heads-up); by use for what each one used. Adding it is the first proposal:
 * everyone is asked, and it counts once they have all said yes.
 */
function AddSheet({ board, circle, group, visible, onClose, onAdded }: AddProps) {
  const changes = useBoardChanges(board);
  const clientId = useRef(newClientId());
  // Whoever speaks for themselves has a share: in the flat now, with a sign-in of their own.
  const people = circle ? membersOf(circle).filter((member) => member.kind !== 'pet' && member.status === 'joined') : [];
  const lastMonth = addMonths(monthOf(today()), -1);
  const [name, setName] = useState('');
  const [under, setUnder] = useState<Group>(group);
  const [total, setTotal] = useState('');
  const [way, setWay] = useState<Way>(group === 'rent' ? 'room' : group === 'bills' ? 'nights' : 'equal');
  const [measures, setMeasures] = useState<Record<string, string>>({});
  const [shared, setShared] = useState('');
  const [from, setFrom] = useState(`${lastMonth}-01`);
  const [to, setTo] = useState(addDays(`${monthOf(today())}-01`, -1));
  const [payer, setPayer] = useState<string | null>(null);
  const [picking, setPicking] = useState<'from' | 'to' | null>(null);

  const totalCents = readCents(total);
  const whole = (typed: string | undefined) => (typed && /^\d{1,6}$/.test(typed.trim()) ? Number(typed.trim()) : null);
  const measured = people.map((person) => whole(measures[person.id]));
  const once = under === 'bills' || under === 'other';
  const ready =
    !!name.trim() && !!totalCents && (way === 'equal' || (way === 'nights' && to >= from) || (way === 'room' && measured.every((one) => one !== null && one >= 1)) || (way === 'use' && measured.every((one) => one !== null) && measured.some((one) => (one ?? 0) > 0)));

  const add = async () => {
    const fields = {
      name: name.trim(),
      group: under,
      way,
      totalCents,
      shared: way === 'room' ? (whole(shared) ?? 0) : undefined,
      from: way === 'nights' ? from : undefined,
      to: way === 'nights' ? to : undefined,
      payerMemberId: once ? (payer ?? undefined) : undefined,
      parts: way === 'room' || way === 'use' ? people.map((person, index) => ({ memberId: person.id, measure: measured[index] })) : undefined,
    };
    if (!(await changes.add('split', fields, clientId.current))) return;
    clientId.current = newClientId();
    onAdded(under);
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={say.add.title} subtitle={say.add.lead}>
      <View style={{ gap: 12, paddingTop: 6 }}>
        <View style={{ gap: 12, paddingHorizontal: layout.rowGutter }}>
          <Field label={say.add.name} value={name} onChangeText={setName} maxLength={80} placeholder={say.add.namePlaceholder[under]} />
          <Field label={say.add.total} value={total} onChangeText={setTotal} keyboardType="decimal-pad" maxLength={12} error={total.trim() && !totalCents ? say.add.badTotal : null} />
        </View>
        <Segmented label={say.add.under} options={GROUPS.map((id) => ({ id, label: say.tabs[id] }))} value={under} onChange={setUnder} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: layout.rowGutter }}>
          {WAYS.map((one) => (
            <Chip key={one} tone="filter" label={say.add.ways[one]} selected={way === one} onPress={() => setWay(one)} />
          ))}
        </View>
        <View style={{ gap: 12, paddingHorizontal: layout.rowGutter }}>
          {way === 'room' || way === 'use'
            ? people.map((person) => (
                <Field
                  key={person.id}
                  label={way === 'room' ? say.add.room(person.you ? null : firstName(person.name)) : say.add.used(person.you ? null : firstName(person.name))}
                  value={measures[person.id] ?? ''}
                  onChangeText={(typed) => setMeasures((now) => ({ ...now, [person.id]: typed }))}
                  keyboardType="number-pad"
                  maxLength={6}
                />
              ))
            : null}
          {way === 'room' ? <Field label={say.add.shared} value={shared} onChangeText={setShared} keyboardType="number-pad" maxLength={5} /> : null}
          {way === 'nights' ? (
            <>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <FieldButton label={say.add.from} value={formatWeekdayDay(from)} onPress={() => setPicking('from')} />
                <FieldButton label={say.add.to} value={formatWeekdayDay(to)} onPress={() => setPicking('to')} />
              </View>
              <Txt variant="footnote" color="muted">
                {say.add.nightsNote}
              </Txt>
            </>
          ) : null}
          {way === 'equal' ? (
            <Txt variant="footnote" color="muted">
              {say.add.equalNote}
            </Txt>
          ) : null}
        </View>
        {once && people.length ? (
          <View style={{ gap: 8 }}>
            <Txt variant="caption" color="muted" style={{ marginHorizontal: layout.rowGutter }}>
              {say.add.payer}
            </Txt>
            <PersonChips inset people={people} value={payer} onChange={(id) => setPayer(id === payer ? null : id)} />
          </View>
        ) : null}
        <View style={{ gap: 10, paddingHorizontal: layout.rowGutter }}>
          {changes.problem ? (
            <Txt variant="caption" color="danger" accessibilityLiveRegion="polite">
              {changes.problem}
            </Txt>
          ) : null}
          <Button label={say.add.save} size="lg" block disabled={!ready} loading={changes.busy} onPress={() => void add()} />
        </View>
      </View>
      <DayPicker visible={picking === 'from'} onClose={() => setPicking(null)} title={say.add.from} value={from} max={today()} byYear onChange={setFrom} />
      <DayPicker visible={picking === 'to'} onClose={() => setPicking(null)} title={say.add.to} value={to} min={from} byYear onChange={setTo} />
    </Sheet>
  );
}

import { ArrowLeftRight, CalendarDays, Check, ListChecks, Minus, Plus } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { View } from 'react-native';

import type { FairShareJobResponse, FairSharePersonResponse, FairShareResponse, FairShareSettings } from '@/api/generated/homeport';
import { Tick } from '@/features/plan/Tick';
import { BoardFrame, type MenuRow } from '@/features/templates/BoardFrame';
import { Foot } from '@/features/templates/parts/Bars';
import type { Board, BoardScreenProps } from '@/features/templates/types';
import { type BoardChanges, useBoardChanges, useBoardPart } from '@/features/templates/useBoard';
import { formatMonthName } from '@/lib/dates';
import { newClientId } from '@/lib/ids';
import { type Colors, layout, radius, useTheme } from '@/theme';
import { Avatar } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Emoji } from '@/ui/Emoji';
import { EmptyState } from '@/ui/EmptyState';
import { Field } from '@/ui/Field';
import { Tap } from '@/ui/Motion';
import { NoteBox } from '@/ui/NoteBox';
import { Sheet } from '@/ui/Sheet';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

type Share = Board<FairShareResponse, FairShareSettings>;
const say = words.couple.fairShare;
const SCALES = '🧮';
/** The colours that tell the others apart on the bar; the person looking is the accent. */
const TINTS = ['tint2', 'tint3', 'tint4', 'tint5', 'tint1'] as const satisfies readonly (keyof Colors)[];

/** Each person's colour on the bar and in its legend, in the order of the people. */
function coloursOf(people: readonly FairSharePersonResponse[], colors: Colors): string[] {
  let other = 0;
  return people.map((person) => (person.you ? colors.accent : colors[TINTS[other++ % TINTS.length]!]));
}

/**
 * 17.8 The fair share. The work nobody sees, counted from the jobs each person ticked in a month, with
 * their own guess of the hours: one bar, each side's jobs, and the one swap that would bring it close. It is
 * a mirror, not a score. Everyone ticks only for themselves; a swap is suggested by one and answered by the
 * other. More holds the other months.
 */
export function FairShare({ board }: BoardScreenProps<FairShareResponse, FairShareSettings>) {
  const { colors } = useTheme();
  const [month, setMonth] = useState<string | undefined>(undefined);
  const part = useBoardPart(board, month);
  const view = part.board.view;
  const changes = useBoardChanges(board);
  const [ticking, setTicking] = useState(false);
  const both = view.people.length === 2;
  const tints = coloursOf(view.people, colors);
  const youAreIn = view.people.some((person) => person.you);

  const menu: MenuRow[] = [];
  if (view.canTick && youAreIn) menu.push({ icon: (color) => <ListChecks size={20} color={color} />, label: say.tick.menu, note: say.tick.menuNote(view.monthName), onPress: () => setTicking(true) });
  for (const other of view.months) {
    if (other !== view.month) menu.push({ icon: (color) => <CalendarDays size={20} color={color} />, label: say.show(formatMonthName(other)), onPress: () => setMonth(other) });
  }

  return (
    <BoardFrame board={board} title={board.title} subtitle={view.monthName} chip="menu" menu={menu} problem={changes.problem ?? part.problem} footer={<Foot fine={say.fine(both && board.chip.audience === 'circle')} />}>
      {view.totalHours === 0 ? (
        <View style={{ flex: 1, justifyContent: 'center', paddingBottom: 40 }}>
          <EmptyState emoji={SCALES} title={say.empty.title(view.monthName)} body={say.empty.body} action={view.canTick && youAreIn ? <Button label={say.tick.menu} onPress={() => setTicking(true)} /> : undefined} />
        </View>
      ) : (
        <>
          <View style={{ marginTop: 6, marginHorizontal: 20 }}>
            <View accessible accessibilityRole="image" accessibilityLabel={say.barSpoken(view.people.map((person) => ({ name: person.you ? null : (person.person.name ?? ''), percent: person.percent })))} style={{ flexDirection: 'row', gap: 3, height: 22, marginBottom: 8, borderRadius: radius.pill, overflow: 'hidden', backgroundColor: colors.fill2 }}>
              {view.people.map((person, index) => (person.percent > 0 ? <View key={person.person.memberId ?? index} style={{ width: `${person.percent}%`, flexGrow: 1, backgroundColor: tints[index] }} /> : null))}
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 6 }}>
              {view.people.map((person, index) => (
                <View key={person.person.memberId ?? index} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={{ width: 9, height: 9, borderRadius: radius.pill, backgroundColor: tints[index] }} />
                  <Txt variant="footnote" weight={600}>
                    {say.legend(person.you ? null : (person.person.name ?? ''), person.hours)}
                  </Txt>
                </View>
              ))}
            </View>
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 14, marginHorizontal: layout.barGutter }}>
            {view.people.map((person, index) => (
              <Column key={person.person.memberId ?? index} person={person} onPress={person.you && view.canTick ? () => setTicking(true) : undefined} />
            ))}
          </View>

          <View style={{ marginTop: 16, marginHorizontal: layout.barGutter }}>
            <Swap view={view} changes={changes} both={both} />
          </View>
        </>
      )}
      <TickSheet board={board} view={view} visible={ticking} onClose={() => setTicking(false)} />
    </BoardFrame>
  );
}

/** One person's side: their face and name, and the jobs they ticked with the hours of each, the biggest first. */
function Column({ person, onPress }: { person: FairSharePersonResponse; onPress?: () => void }) {
  const { colors } = useTheme();
  const name = person.you ? say.you : (person.person.name ?? '');
  const content = (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <Avatar uri={person.person.avatarUrl} name={person.person.name ?? ''} size={28} />
        <Txt variant="item" weight={800} numberOfLines={1} style={{ flex: 1 }}>
          {name}
        </Txt>
      </View>
      {person.jobs.length === 0 ? (
        <Txt variant="caption" color="muted" style={{ paddingVertical: 5 }}>
          {say.nothingTicked}
        </Txt>
      ) : (
        person.jobs.map((job) => (
          <View key={job.jobId} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8, paddingVertical: 5, borderTopWidth: 1, borderTopColor: colors.line }}>
            <Txt variant="caption" weight={600} numberOfLines={1} style={{ flex: 1 }}>
              {job.name}
            </Txt>
            <Txt variant="small" weight={500} color="muted">
              {say.hours(job.hours)}
            </Txt>
          </View>
        ))
      )}
    </>
  );
  return (
    <Card style={{ flexGrow: 1, flexBasis: '45%', borderRadius: radius.card }}>
      {onPress ? (
        <Tap accessibilityRole="button" accessibilityLabel={say.columnSpoken(name, person.hours)} scaleTo={0.99} onPress={onPress} style={{ padding: 12 }}>
          {content}
        </Tap>
      ) : (
        <View accessible accessibilityLabel={say.legend(person.you ? null : (person.person.name ?? ''), person.hours)} style={{ padding: 12 }}>
          {content}
        </View>
      )}
    </Card>
  );
}

/**
 * The one swap that would bring it close, and where it stands: offered by the board, suggested by one of
 * them and waiting, to be answered by the other, or answered.
 */
function Swap({ view, changes, both }: { view: FairShareResponse; changes: BoardChanges; both: boolean }) {
  const offered = view.offered;
  const others = view.people.filter((person) => !person.you).map((person) => person.person.name ?? '');
  const swapIcon = (color: string) => <ArrowLeftRight size={20} color={color} />;
  if (offered) {
    const by = offered.by?.name ?? '';
    if (offered.accepted === null && !offered.yours) {
      return (
        <NoteBox
          soft
          icon={swapIcon}
          title={say.swap.theirs(by)}
          trailing={
            <View style={{ gap: 6, alignSelf: 'center' }}>
              <Button label={say.swap.yes} spoken={say.swap.yesSpoken} size="sm" inline loading={changes.busy} onPress={() => void changes.act('answer', { entryId: offered.id, yes: true })} />
              <Button label={say.swap.no} spoken={say.swap.noSpoken} size="sm" variant="soft" inline disabled={changes.busy} onPress={() => void changes.act('answer', { entryId: offered.id, yes: false })} />
            </View>
          }>
          {offered.line}
        </NoteBox>
      );
    }
    const title = offered.accepted === null ? say.swap.waiting(others) : offered.accepted ? say.swap.agreed : offered.yours ? say.swap.theyDeclined(others) : say.swap.youDeclined;
    return (
      <NoteBox soft icon={offered.accepted ? (color) => <Check size={20} color={color} /> : swapIcon} title={title}>
        {offered.line}
      </NoteBox>
    );
  }
  if (view.swap) {
    return (
      <NoteBox soft icon={swapIcon} title={say.swap.title} trailing={view.canTick ? <Button label={say.swap.suggest} size="sm" inline loading={changes.busy} style={{ alignSelf: 'center' }} onPress={() => void changes.act('suggest', { month: view.month })} /> : undefined}>
        {view.swap.line}
      </NoteBox>
    );
  }
  return (
    <NoteBox soft icon={(color) => <Check size={20} color={color} />} title={view.close ? say.close.title : say.uneven.title}>
      {view.close ? say.close.line(both) : say.uneven.line}
    </NoteBox>
  );
}

/** Every job on the list, to tick the ones that were this person's in the month shown and guess the hours of each. */
function TickSheet({ board, view, visible, onClose }: { board: Share; view: FairShareResponse; visible: boolean; onClose: () => void }) {
  return (
    <Sheet visible={visible} onClose={onClose} title={say.tick.title(view.monthName)} subtitle={say.tick.lead} tall>
      {visible ? <Ticking board={board} view={view} /> : null}
    </Sheet>
  );
}

function Ticking({ board, view }: { board: Share; view: FairShareResponse }) {
  const { colors } = useTheme();
  const changes = useBoardChanges(board);
  const adding = useBoardChanges(board);
  const clientId = useRef(newClientId());
  const [name, setName] = useState('');
  const tick = (job: FairShareJobResponse, fields: { mine?: boolean; hours?: number }) => void changes.act('tick', { jobId: job.id, month: view.month, ...fields });
  const round = { width: 32, height: 32, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.fill } as const;

  return (
    <View style={{ gap: 4, paddingTop: 6 }}>
      {changes.problem ? (
        <Txt variant="caption" color="danger" accessibilityLiveRegion="polite" style={{ marginHorizontal: layout.gutter, marginBottom: 6 }}>
          {changes.problem}
        </Txt>
      ) : null}
      {view.jobs.map((job) => {
        const mine = job.yourHours !== null;
        const hours = job.yourHours ?? 0;
        return (
          <View key={job.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingVertical: 8, paddingHorizontal: layout.gutter }}>
            <Tick label={say.tick.mine(job.name)} done={mine} onChange={(next) => tick(job, { mine: next })} />
            {job.emoji ? <Emoji char={job.emoji} size={22} /> : null}
            <Txt variant="item" weight={600} numberOfLines={1} style={{ flex: 1 }}>
              {job.name}
            </Txt>
            {mine ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Tap accessibilityRole="button" accessibilityLabel={say.tick.less(job.name)} accessibilityState={{ disabled: hours <= 1 }} aria-disabled={hours <= 1} disabled={hours <= 1} hitSlop={6} onPress={() => tick(job, { hours: hours - 1 })} style={[round, { opacity: hours <= 1 ? 0.4 : 1 }]}>
                  <Minus size={16} color={colors.text} strokeWidth={2.6} />
                </Tap>
                <Txt variant="callout" weight={700} center style={{ minWidth: 38 }}>
                  {say.hours(hours)}
                </Txt>
                <Tap accessibilityRole="button" accessibilityLabel={say.tick.more(job.name)} hitSlop={6} onPress={() => tick(job, { hours: hours + 1 })} style={round}>
                  <Plus size={16} color={colors.text} strokeWidth={2.6} />
                </Tap>
              </View>
            ) : null}
          </View>
        );
      })}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 10, paddingHorizontal: layout.rowGutter }}>
        <View style={{ flex: 1 }}>
          <Field label={say.job.label} value={name} onChangeText={setName} maxLength={80} placeholder={say.job.placeholder} error={adding.problem} returnKeyType="done" />
        </View>
        <Button
          label={say.job.add}
          spoken={say.job.addSpoken}
          variant="soft"
          disabled={!name.trim()}
          loading={adding.busy}
          style={{ marginTop: 4 }}
          onPress={() =>
            void adding.add('job', { name: name.trim() }, clientId.current).then((added) => {
              if (!added) return;
              clientId.current = newClientId();
              setName('');
            })
          }
        />
      </View>
    </View>
  );
}

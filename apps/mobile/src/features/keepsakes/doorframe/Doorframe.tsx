import { Plus, Ruler, Sparkles } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { View } from 'react-native';

import type { DoorframeSettings, DoorframeView, MemberResponse } from '@/api/generated/homeport';
import { useCircles } from '@/features/circles/current';
import { membersOf } from '@/features/circles/members';
import { BoardFrame, type MenuRow } from '@/features/templates/BoardFrame';
import { Foot } from '@/features/templates/parts/Bars';
import { PersonChips } from '@/features/templates/parts/People';
import type { Board, BoardScreenProps } from '@/features/templates/types';
import { useBoardChanges } from '@/features/templates/useBoard';
import { formatDayLong, formatMonthAndYear, today } from '@/lib/dates';
import { newClientId } from '@/lib/ids';
import { type Colors, layout, radius, useTheme } from '@/theme';
import { Avatar } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { DayPicker } from '@/ui/DayPicker';
import { EmptyState } from '@/ui/EmptyState';
import { Field, FieldButton } from '@/ui/Field';
import { GroupLabel } from '@/ui/Heading';
import { NoteBox } from '@/ui/NoteBox';
import { Sheet } from '@/ui/Sheet';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

import { inCm, labelled, placeOf, toMm, windowOf } from './ruler';

type Frame = Board<DoorframeView, DoorframeSettings>;
const say = words.keepsakes.doorframe;

/** The ruler as drawn: 500 points tall, a 40-point bar with a tick every centimetre and a longer line at each mark. */
const RULER = 500;
const LABEL = 18;
/** How wide a mark's line and words may be together: the ruler's column and the gap before the cards. */
const LABELS = 170;
const RULER_EMOJI = '📏';

/** The colour that tells one child's marks from another's: their own tint in the circle. */
function tintOf(colors: Colors, member: MemberResponse | undefined): string {
  const tints = [colors.tint1, colors.tint2, colors.tint3, colors.tint4, colors.tint5];
  return member ? (tints[(member.tint - 1) % tints.length] ?? colors.accent) : colors.accent;
}

/**
 * 15.7 The doorframe. The pencil marks on the kitchen door, kept for good: a ruler with every mark at its
 * height, its date beside it; a card for each child with how tall they are and the comparisons the API
 * words ("6 cm since the last birthday"); and the sentences that compare them with each other.
 */
export function Doorframe({ board }: BoardScreenProps<DoorframeView, DoorframeSettings>) {
  const { colors } = useTheme();
  const view = board.view;
  const circle = useCircles().find((one) => one.id === board.circleId);
  const members = circle ? membersOf(circle) : [];
  const memberOf = (memberId: string | undefined) => members.find((member) => member.id === memberId);
  const [adding, setAdding] = useState<'mark' | 'landmark' | null>(null);

  const window = windowOf(view.marks.map((mark) => mark.heightMm));
  const worded = labelled(view.marks, window, RULER, LABEL);
  const centimetres = (window.to - window.from) / 10;
  const menu: MenuRow[] = board.canEdit ? [{ icon: (color) => <Ruler size={20} color={color} />, label: say.landmark.title, note: say.landmark.note, onPress: () => setAdding('landmark') }] : [];

  return (
    <BoardFrame
      board={board}
      title={board.title}
      menu={menu}
      footer={board.canEdit ? <Foot>{<Button label={say.add.button} size="lg" block icon={(color) => <Plus size={19} color={color} />} onPress={() => setAdding('mark')} />}</Foot> : undefined}>
      {view.marks.length === 0 ? (
        <View style={{ flex: 1, justifyContent: 'center', paddingBottom: 40 }}>
          <EmptyState emoji={RULER_EMOJI} title={say.empty.title} body={say.empty.body} />
        </View>
      ) : (
        <View style={{ flexDirection: 'row', gap: 12, marginTop: 6, marginHorizontal: layout.rowGutter }}>
          <View accessibilityRole="list" accessibilityLabel={say.ruler} style={{ width: LABELS - 12, height: RULER }}>
            <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 40, borderRadius: radius.tile, overflow: 'hidden', backgroundColor: colors.fill }}>
              {Array.from({ length: Math.floor(centimetres) + 1 }, (_, index) => (
                <View key={index} style={{ position: 'absolute', left: 0, right: 0, bottom: (index / centimetres) * RULER, height: 1.5, backgroundColor: colors.lineStrong }} />
              ))}
            </View>
            {view.marks.map((mark) => {
              const who = mark.person?.name ?? '';
              const up = placeOf(mark.heightMm, window) * RULER;
              return (
                // A long label (a height with a half centimetre) may use the gap before the cards and no more: the end of
                // its date is cut with three dots sooner than hidden under a card. The number itself is never cut.
                <View key={mark.id} accessible accessibilityLabel={say.markSpoken(who, inCm(mark.heightMm), formatDayLong(mark.day))} style={{ position: 'absolute', left: 0, width: LABELS, bottom: up - 9, height: 18, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ width: 52, height: 3.5, borderRadius: radius.pill, backgroundColor: tintOf(colors, memberOf(mark.person?.memberId)) }} />
                  {worded.has(mark.id) ? (
                    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Txt variant="callout" weight={800} numberOfLines={1} style={{ flexShrink: 0 }}>
                        {inCm(mark.heightMm)}
                      </Txt>
                      <Txt variant="tiny" weight={600} color="muted" numberOfLines={1} style={{ flexShrink: 1 }}>
                        {say.markLine(who, formatMonthAndYear(mark.day))}
                      </Txt>
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
          <View style={{ flex: 1, gap: 10 }}>
            {view.children.map((child) => (
              <Card key={child.person.memberId} style={{ gap: 3, padding: 12, borderRadius: radius.card }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <Avatar uri={child.person.avatarUrl} name={child.person.name ?? ''} size={34} />
                  <Txt variant="item" weight={800}>
                    {child.person.name}
                  </Txt>
                  <View style={{ width: 9, height: 9, borderRadius: radius.pill, backgroundColor: tintOf(colors, memberOf(child.person.memberId)) }} />
                </View>
                <Txt variant="item" weight={800}>
                  {say.cm(inCm(child.heightMm))}
                </Txt>
                {child.lines.map((line) => (
                  // The API's own sentences: "6 cm since the last birthday".
                  <Txt key={line} variant="footnote" color="muted">
                    {line}
                  </Txt>
                ))}
              </Card>
            ))}
            {view.comparisons.map((sentence) => (
              <NoteBox key={sentence} soft icon={(color) => <Sparkles size={20} color={color} />}>
                {sentence}
              </NoteBox>
            ))}
          </View>
        </View>
      )}
      <AddSheet board={board} what={adding} people={members.filter((member) => member.kind !== 'pet')} onClose={() => setAdding(null)} />
    </BoardFrame>
  );
}

/** A new mark (whose, how tall, which day), or a line of the family's own to measure against ("Up to Grandma's shoulder"). */
function AddSheet({ board, what, people, onClose }: { board: Frame; what: 'mark' | 'landmark' | null; people: MemberResponse[]; onClose: () => void }) {
  return (
    <Sheet visible={what !== null} onClose={onClose} title={what === 'landmark' ? say.landmark.title : say.add.title} subtitle={what === 'landmark' ? say.landmark.lead : undefined}>
      {what === 'mark' ? <AddMark board={board} people={people} onClose={onClose} /> : what === 'landmark' ? <AddLandmark board={board} onClose={onClose} /> : null}
    </Sheet>
  );
}

function AddMark({ board, people, onClose }: { board: Frame; people: MemberResponse[]; onClose: () => void }) {
  const changes = useBoardChanges(board);
  const clientId = useRef(newClientId());
  // Children are measured most: they stand first, and the one measured last is chosen to begin with.
  const order = [...people.filter((member) => member.kind === 'child'), ...people.filter((member) => member.kind !== 'child')];
  const [who, setWho] = useState<string | null>(board.view.children[0]?.person.memberId ?? order[0]?.id ?? null);
  const [height, setHeight] = useState('');
  const [day, setDay] = useState(today());
  const [picking, setPicking] = useState(false);
  const mm = toMm(height);
  return (
    <View style={{ gap: 12, paddingTop: 6 }}>
      <View>
        <GroupLabel style={{ marginTop: 0, marginHorizontal: layout.gutter }}>{say.add.who}</GroupLabel>
        <PersonChips inset people={order} value={who} onChange={setWho} />
      </View>
      <View style={{ gap: 12, paddingHorizontal: layout.rowGutter }}>
        <Field label={say.add.height} value={height} onChangeText={setHeight} keyboardType="decimal-pad" maxLength={6} autoFocus placeholder={say.add.heightPlaceholder} error={changes.problem} note={height.trim() && mm === null ? say.add.heightNote : null} />
        <View style={{ flexDirection: 'row' }}>
          <FieldButton label={say.add.day} value={formatDayLong(day)} onPress={() => setPicking(true)} />
        </View>
        <Button label={say.add.save} size="lg" block disabled={!who || mm === null} loading={changes.busy} onPress={() => void changes.add('mark', { memberId: who, heightMm: mm, day }, clientId.current).then((added) => (added ? onClose() : undefined))} />
      </View>
      <DayPicker visible={picking} onClose={() => setPicking(false)} title={say.add.day} value={day} max={today()} byYear onChange={setDay} />
    </View>
  );
}

function AddLandmark({ board, onClose }: { board: Frame; onClose: () => void }) {
  const changes = useBoardChanges(board);
  const clientId = useRef(newClientId());
  const [text, setText] = useState('');
  const [height, setHeight] = useState('');
  const mm = toMm(height);
  return (
    <View style={{ gap: 12, paddingTop: 6, paddingHorizontal: layout.rowGutter }}>
      <Field label={say.landmark.text} value={text} onChangeText={setText} maxLength={80} autoFocus placeholder={say.landmark.textPlaceholder} error={changes.problem} />
      <Field label={say.add.height} value={height} onChangeText={setHeight} keyboardType="decimal-pad" maxLength={6} placeholder={say.add.heightPlaceholder} note={height.trim() && mm === null ? say.add.heightNote : null} />
      <Button label={say.landmark.save} size="lg" block disabled={!text.trim() || mm === null} loading={changes.busy} onPress={() => void changes.add('landmark', { text: text.trim(), heightMm: mm }, clientId.current).then((added) => (added ? onClose() : undefined))} />
    </View>
  );
}

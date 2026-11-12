import { Check, Clock, Lock, Pencil, X } from 'lucide-react-native';
import { type ReactNode, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';

import type { PersonBrief, PredictionsItemResponse, PredictionsSettings, PredictionsViewResponse, PredictionsWriterResponse } from '@/api/generated/homeport';
import { BoardFrame } from '@/features/templates/BoardFrame';
import { Foot } from '@/features/templates/parts/Bars';
import { BlobHead } from '@/features/templates/parts/Heads';
import { Notice } from '@/features/templates/parts/Notice';
import { BoardRow, Face } from '@/features/templates/parts/Rows';
import type { Board, BoardScreenProps } from '@/features/templates/types';
import { useBoardChanges } from '@/features/templates/useBoard';
import { formatDay, formatDayFull, toISODate } from '@/lib/dates';
import { newClientId } from '@/lib/ids';
import { layout, radius, useTheme } from '@/theme';
import { Avatar } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Chip } from '@/ui/Chip';
import { Field } from '@/ui/Field';
import { GroupLabel } from '@/ui/Heading';
import { Tap } from '@/ui/Motion';
import { NoteBox } from '@/ui/NoteBox';
import { RowGroup } from '@/ui/Rows';
import { Sheet } from '@/ui/Sheet';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

type Sealed = Board<PredictionsViewResponse, PredictionsSettings>;
const say = words.crew.predictions;
const CRYSTAL_BALL = '🔮';

/** The others first, whoever has written most on top; this person's own row comes last, as the drawing has it. */
function inOrder(writers: readonly PredictionsWriterResponse[]): PredictionsWriterResponse[] {
  return [...writers.filter((one) => !one.you).sort((a, b) => b.written - a.written), ...writers.filter((one) => one.you)];
}

/**
 * 19.7 Predictions. Everyone writes one about each of the others, and they are sealed until a day years
 * away. Until then this screen knows what the API tells it and no more: who has written how many, this
 * person's own envelopes (not their words, once sealed), and their own drafts. From the day on, everyone
 * reads all of them and says who was right.
 */
export function Predictions({ board }: BoardScreenProps<PredictionsViewResponse, PredictionsSettings>) {
  const { colors } = useTheme();
  const view = board.view;
  const changes = useBoardChanges(board);
  const opens = formatDayFull(view.opensOn);
  const me = view.writers.find((one) => one.you) ?? null;
  const [writing, setWriting] = useState(false);
  const [mine, setMine] = useState(false);
  const [told, setTold] = useState<{ title: string; text: string } | null>(null);

  if (view.open) return <Opened board={board} />;

  const firstDone = inOrder(view.writers).find((one) => !one.you && one.written >= one.of && one.of > 0);
  const toGo = me?.stillAbout.length ?? 0;

  return (
    <BoardFrame
      board={board}
      problem={changes.problem}
      footer={
        <Foot fine={say.fine}>
          {me && toGo > 0 ? (
            <Button label={say.write.button(me.written, toGo)} size="lg" block icon={(color) => <Pencil size={19} color={color} />} onPress={() => setWriting(true)} />
          ) : me && me.drafts > 0 ? (
            <Button label={say.sealDrafts(me.drafts)} size="lg" block icon={(color) => <Lock size={19} color={color} />} loading={changes.busy} onPress={() => void changes.act('seal')} />
          ) : null}
        </Foot>
      }>
      <BlobHead tight emoji={board.emoji || CRYSTAL_BALL} title={board.title} line={say.sealedUntil(view.occasion, opens)} />
      <RowGroup>
        {inOrder(view.writers).map((one, index) => {
          const name = one.person.name ?? '';
          if (one.you) {
            const line = toGo > 0 ? say.toGo(toGo, one.stillAbout.map((person) => person.name ?? '')) : one.drafts > 0 ? say.drafts(one.drafts) : null;
            return <MyRow key={one.person.memberId ?? name} first={index === 0} writer={one} line={line} onPress={() => setMine(true)} />;
          }
          return (
            <BoardRow
              key={one.person.memberId ?? name}
              first={index === 0}
              leading={<Face uri={one.person.avatarUrl} name={name} />}
              title={say.wrote(name, one.written, one.of)}
              line={one === firstDone ? say.oneEach : null}
              trailing={one.written > 0 ? <Lock size={18} color={colors.muted} /> : <Clock size={18} color={colors.muted} />}
              spoken={words.common.spoken([say.wrote(name, one.written, one.of), one.written > 0 ? say.sealedWord : null])}
              onPress={() => setTold({ title: say.theirs.title(name), text: one.written > 0 ? say.theirs.sealed(name, opens) : say.theirs.none(name) })}
            />
          );
        })}
      </RowGroup>

      <WriteSheet board={board} visible={writing} onClose={() => setWriting(false)} />
      <MineSheet board={board} visible={mine} onClose={() => setMine(false)} onWrite={() => setWriting(true)} />
      <Notice title={told?.title} text={told?.text ?? null} onClose={() => setTold(null)} />
    </BoardFrame>
  );
}

/**
 * This person's own row: how many they have written and, in the warning colour, what is still to do. It is
 * the one row that opens something of theirs, so it carries the pencil.
 */
function MyRow({ writer, line, first, onPress }: { writer: PredictionsWriterResponse; line: string | null; first: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  const title = say.youWrote(writer.written, writer.of);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={words.common.spoken([title, line, say.yours.open])}
      onPress={onPress}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 54, paddingVertical: 14, paddingHorizontal: 16, borderTopWidth: first ? 0 : 1, borderTopColor: colors.line, backgroundColor: pressed ? colors.fill : 'transparent' })}>
      <Face uri={writer.person.avatarUrl} name={writer.person.name ?? ''} />
      <View style={{ flex: 1, gap: 1 }}>
        <Txt variant="item" weight={600}>
          {title}
        </Txt>
        {line ? (
          <Txt variant="footnote" weight={700} color="warn">
            {line}
          </Txt>
        ) : null}
      </View>
      <Pencil size={18} color={colors.muted} />
    </Pressable>
  );
}

/** A new prediction: about which of the others, and the words. Sealed at once, or kept as a draft only its writer sees. */
function WriteSheet({ board, visible, onClose }: { board: Sealed; visible: boolean; onClose: () => void }) {
  return (
    <Sheet visible={visible} onClose={onClose} title={say.write.title} subtitle={say.write.lead(formatDayFull(board.view.opensOn))}>
      {visible ? <Writing board={board} onClose={onClose} /> : null}
    </Sheet>
  );
}

function Writing({ board, onClose }: { board: Sealed; onClose: () => void }) {
  const changes = useBoardChanges(board);
  const clientId = useRef(newClientId());
  const left = board.view.writers.find((one) => one.you)?.stillAbout ?? [];
  const [about, setAbout] = useState<string | null>(left[0]?.memberId ?? null);
  const [text, setText] = useState('');
  const who = left.find((person) => person.memberId === about);
  const add = async (seal: boolean) => {
    if (await changes.add('prediction', { aboutMemberId: about, text: text.trim(), seal }, clientId.current)) onClose();
  };
  return (
    <View style={{ gap: 12, paddingTop: 6 }}>
      {left.length > 1 ? (
        <View>
          <GroupLabel style={{ marginTop: 0, marginHorizontal: layout.gutter }}>{say.write.about}</GroupLabel>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: layout.rowGutter }}>
            {left.map((person) => (
              <Chip key={person.memberId} tone="filter" label={person.name ?? ''} selected={person.memberId === about} onPress={() => setAbout(person.memberId ?? null)} icon={<Avatar uri={person.avatarUrl} name={person.name ?? ''} size={22} />} />
            ))}
          </View>
        </View>
      ) : null}
      <View style={{ gap: 12, paddingHorizontal: layout.rowGutter }}>
        <Field label={say.write.label(who?.name ?? null)} value={text} onChangeText={setText} multiline maxLength={2000} autoFocus placeholder={say.write.placeholder} />
        <NoteBox icon={(color) => <Lock size={20} color={color} />}>{say.write.sealNote}</NoteBox>
        {changes.problem ? (
          <Txt variant="caption" color="danger" accessibilityLiveRegion="polite">
            {changes.problem}
          </Txt>
        ) : null}
        <Button label={say.write.seal} size="lg" block disabled={!about || !text.trim()} loading={changes.busy} onPress={() => void add(true)} />
        <Button label={say.write.draft} variant="soft" size="lg" block disabled={!about || !text.trim() || changes.busy} onPress={() => void add(false)} />
      </View>
    </View>
  );
}

type MineProps = { board: Sealed; visible: boolean; onClose: () => void; onWrite: () => void };

/**
 * This person's own predictions: an envelope for each one that is sealed (who it is about and when it was
 * sealed; the words are not on the phone), and their drafts, which they still read and change. A sheet
 * with two faces: the list, and one of them.
 */
function MineSheet({ board, visible, onClose, onWrite }: MineProps) {
  const { colors } = useTheme();
  const view = board.view;
  const opens = formatDayFull(view.opensOn);
  const [openId, setOpenId] = useState<string | null>(null);
  const own = view.items.filter((item) => item.mine);
  const item = own.find((one) => one.id === openId) ?? null;
  const left = view.writers.find((one) => one.you)?.stillAbout ?? [];
  const close = () => {
    setOpenId(null);
    onClose();
  };

  if (item) {
    return (
      <Sheet visible={visible} onClose={close} title={say.about(item.about?.name ?? '')} subtitle={item.draft ? say.yours.draftNote : say.yours.sealedNote(sealedDay(item), opens)}>
        <OneOfMine key={item.id} board={board} item={item} onDone={() => setOpenId(null)} />
      </Sheet>
    );
  }
  return (
    <Sheet visible={visible} onClose={close} title={say.yours.title} subtitle={own.length ? say.yours.lead : say.yours.none}>
      <View style={{ paddingTop: 4 }}>
        {own.map((one, index) => (
          <BoardRow
            key={one.id}
            first={index === 0}
            leading={<Face uri={one.about?.avatarUrl} name={one.about?.name ?? ''} />}
            title={say.about(one.about?.name ?? '')}
            line={one.draft ? say.yours.draft : say.yours.sealed(sealedDay(one))}
            trailing={one.draft ? <Pencil size={18} color={colors.muted} /> : <Lock size={18} color={colors.muted} />}
            onPress={() => setOpenId(one.id)}
          />
        ))}
        {left.length ? (
          <View style={{ paddingTop: 10, paddingHorizontal: layout.rowGutter }}>
            <Button
              label={say.yours.write(left.map((person) => person.name ?? ''))}
              variant="soft"
              size="lg"
              block
              icon={(color) => <Pencil size={18} color={color} />}
              onPress={() => {
                close();
                onWrite();
              }}
            />
          </View>
        ) : null}
      </View>
    </Sheet>
  );
}

/** The day a prediction was sealed, short. */
function sealedDay(item: PredictionsItemResponse): string | null {
  return item.sealedAt ? formatDay(toISODate(new Date(item.sealedAt))) : null;
}

/** One of this person's own: a draft is changed, sealed or taken out; a sealed one can only be taken out, unread. */
function OneOfMine({ board, item, onDone }: { board: Sealed; item: PredictionsItemResponse; onDone: () => void }) {
  const changes = useBoardChanges(board);
  const [text, setText] = useState(item.text ?? '');
  const then = (done: unknown) => (done ? onDone() : undefined);
  return (
    <View style={{ gap: 12, paddingTop: 6, paddingHorizontal: layout.rowGutter }}>
      {item.draft ? <Field label={say.write.label(item.about?.name ?? null)} value={text} onChangeText={setText} multiline maxLength={2000} /> : null}
      {changes.problem ? (
        <Txt variant="caption" color="danger" accessibilityLiveRegion="polite">
          {changes.problem}
        </Txt>
      ) : null}
      {item.draft ? (
        <>
          <Button label={say.write.seal} size="lg" block disabled={!text.trim()} loading={changes.busy} icon={(color) => <Lock size={18} color={color} />} onPress={() => void changes.change(item.id, { text: text.trim(), seal: true }).then(then)} />
          <Button label={say.yours.saveDraft} variant="soft" size="lg" block disabled={!text.trim() || text.trim() === item.text || changes.busy} onPress={() => void changes.change(item.id, { text: text.trim(), seal: false }).then(then)} />
        </>
      ) : null}
      <Button label={item.draft ? say.yours.removeDraft : say.yours.remove} variant="soft" size="lg" block disabled={changes.busy} onPress={() => void changes.remove(item.id).then(then)} />
      <Button label={say.yours.back} variant="quiet" size="sm" inline onPress={onDone} />
    </View>
  );
}

/**
 * From the day they open: every prediction in full, under the person it is about, with who wrote it. The
 * others say whether it came true (nobody marks their own), and the board shows how it stands.
 */
function Opened({ board }: { board: Sealed }) {
  const view = board.view;
  const changes = useBoardChanges(board);
  const abouts: PersonBrief[] = [];
  for (const item of view.items) {
    if (item.about && !abouts.some((person) => person.memberId === item.about?.memberId)) abouts.push(item.about);
  }
  return (
    <BoardFrame board={board} problem={changes.problem} footer={<Foot fine={say.opened.fine} />}>
      <BlobHead tight emoji={board.emoji || CRYSTAL_BALL} title={board.title} line={say.opened.line(view.occasion, formatDayFull(view.opensOn))} />
      {view.items.length === 0 ? (
        <Txt variant="callout" color="muted" center style={{ marginHorizontal: layout.gutter }}>
          {say.opened.none}
        </Txt>
      ) : null}
      {abouts.map((person, index) => (
        <View key={person.memberId ?? index}>
          <GroupLabel style={{ marginTop: index === 0 ? 4 : 18, marginHorizontal: layout.gutter }}>{say.about(person.name ?? '')}</GroupLabel>
          {view.items
            .filter((item) => item.about?.memberId === person.memberId)
            .map((item) => (
              <OpenedCard key={item.id} item={item} busy={changes.busy} onMark={(right) => void changes.act('mark', { predictionId: item.id, right })} />
            ))}
        </View>
      ))}
    </BoardFrame>
  );
}

/** One opened prediction: the words, who wrote them, how the crew has marked it, and this person's own say. */
function OpenedCard({ item, busy, onMark }: { item: PredictionsItemResponse; busy: boolean; onMark: (right: boolean | null) => void }) {
  const { colors } = useTheme();
  const by = item.by?.name ?? '';
  return (
    <Card style={{ gap: 10, marginHorizontal: layout.barGutter, marginBottom: 10, padding: 14 }}>
      <Txt variant="body">{item.text}</Txt>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Avatar uri={item.by?.avatarUrl} name={by} size={24} />
        <Txt variant="footnote" color="muted" numberOfLines={1} style={{ flex: 1 }}>
          {words.common.join([item.mine ? say.opened.byYou : say.opened.by(by), say.opened.marks(item.right, item.wrong)])}
        </Txt>
        {item.verdict ? (
          <View style={{ paddingVertical: 3, paddingHorizontal: 9, borderRadius: radius.chip, backgroundColor: item.verdict === 'right' ? colors.accentSoft : colors.fill }}>
            <Txt variant="tiny" weight={800}>
              {item.verdict === 'right' ? say.opened.right : say.opened.wrong}
            </Txt>
          </View>
        ) : null}
      </View>
      {item.mine ? null : (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Mark label={say.opened.sayRight} spoken={say.opened.sayRightSpoken(by)} on={item.yourMark === true} disabled={busy} icon={(color) => <Check size={15} color={color} strokeWidth={3} />} onPress={() => onMark(item.yourMark === true ? null : true)} />
          <Mark label={say.opened.sayWrong} spoken={say.opened.sayWrongSpoken(by)} on={item.yourMark === false} disabled={busy} icon={(color) => <X size={15} color={color} strokeWidth={3} />} onPress={() => onMark(item.yourMark === false ? null : false)} />
        </View>
      )}
    </Card>
  );
}

type MarkProps = { label: string; spoken: string; on: boolean; disabled: boolean; icon: (color: string) => ReactNode; onPress: () => void };

/** "Came true" or "Didn't": pressed again, this person's say is taken back. */
function Mark({ label, spoken, on, disabled, icon, onPress }: MarkProps) {
  const { colors } = useTheme();
  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel={spoken}
      accessibilityState={{ selected: on, disabled }}
      aria-pressed={on}
      disabled={disabled}
      hitSlop={4}
      onPress={onPress}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: on ? colors.text : colors.fill }}>
      {icon(on ? colors.bg : colors.text)}
      <Txt variant="callout" weight={700} style={{ color: on ? colors.bg : colors.text }}>
        {label}
      </Txt>
    </Tap>
  );
}

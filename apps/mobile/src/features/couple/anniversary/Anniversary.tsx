import { Check, CircleHelp, History, Lock } from 'lucide-react-native';
import { type ReactNode, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';

import type { AnniversaryNextResponse, AnniversaryQuestionResponse, AnniversaryResponse, AnniversarySettings } from '@/api/generated/homeport';
import { BoardFrame, type MenuRow } from '@/features/templates/BoardFrame';
import type { Board, BoardScreenProps } from '@/features/templates/types';
import { useBoardChanges, useBoardPart } from '@/features/templates/useBoard';
import { formatDayFull, formatDayOfYear } from '@/lib/dates';
import { newClientId } from '@/lib/ids';
import { layout, radius, useTheme } from '@/theme';
import { Avatar } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Chip } from '@/ui/Chip';
import { EmptyState } from '@/ui/EmptyState';
import { Field } from '@/ui/Field';
import { GlassBar } from '@/ui/GlassBar';
import { NoteBox } from '@/ui/NoteBox';
import { Sheet } from '@/ui/Sheet';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

type Questions = Board<AnniversaryResponse, AnniversarySettings>;
const say = words.couple.anniversary;
const SEALED = '💌';

/** The names of the others who answer, by whether each has finished: never what they wrote. */
function othersLine(next: AnniversaryNextResponse): string | null {
  const done = next.others.filter((one) => one.done).map((one) => one.person.name ?? '');
  const writing = next.others.filter((one) => !one.done).map((one) => one.person.name ?? '');
  if (next.others.length === 0) return null;
  return writing.length === 0 ? say.next.othersSealed(done, next.youAreDone) : say.next.othersWriting(writing);
}

/**
 * 17.5 The anniversary questions. Each year everyone who answers writes their own answers to the same few
 * questions, apart. Nobody reads anyone else's until the day has come and all have answered; then the year
 * opens, side by side, and stays as it is. The page shows the newest year that has opened; the bar at the
 * end is the year that is being written: when it opens, whether yours are in, and whether the others have
 * finished. The API hands this screen nobody else's unopened words.
 */
export function Anniversary({ board }: BoardScreenProps<AnniversaryResponse, AnniversarySettings>) {
  const [year, setYear] = useState<number | null>(null);
  const part = useBoardPart(board, year === null ? undefined : String(year));
  const view = part.board.view;
  const shown = view.shown;
  // The year that is being written is the same whichever opened year is on the page.
  const next = board.view.next;
  const [writing, setWriting] = useState(false);
  const [asking, setAsking] = useState(false);
  const both = view.people.length === 2;

  const menu: MenuRow[] = [];
  if (board.canEdit) menu.push({ icon: (color) => <CircleHelp size={20} color={color} />, label: say.ask.menu, note: say.ask.note(next.year), onPress: () => setAsking(true) });
  // A bar has no room for a row of years: one that isn't on the page is a row here.
  for (const other of view.years) {
    if (view.years.length <= 4 || other === shown?.year) continue;
    menu.push({ icon: (color) => <History size={20} color={color} />, label: say.year(other), onPress: () => setYear(other) });
  }

  const mine = !board.view.youAnswer ? null : next.youAreDone ? say.next.sealed : next.answered > 0 ? say.next.some(next.answered, next.yours.length) : say.next.none;
  return (
    <BoardFrame
      board={board}
      title={shown ? formatDayFull(shown.day) : board.title}
      subtitle={shown ? say.year(shown.year) : undefined}
      chip="menu"
      menu={menu}
      problem={part.problem}
      floating={
        <NextBar title={next.dayHasCome ? say.next.waits(next.year, both) : say.next.opens(next.year, formatDayOfYear(next.opensOn))} line={[mine, othersLine(next)].filter(Boolean).join(' ')}>
          {board.view.youAnswer ? <Button label={next.youAreDone ? say.write.change : say.write.button} size="sm" inline onPress={() => setWriting(true)} /> : null}
        </NextBar>
      }>
      {view.years.length > 1 && view.years.length <= 4 ? (
        <View style={{ marginBottom: 14 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: layout.barGutter }}>
            {view.years.map((one) => (
              <Chip key={one} tone="filter" label={say.year(one)} selected={one === shown?.year} onPress={() => setYear(one)} />
            ))}
          </ScrollView>
        </View>
      ) : null}
      {shown ? (
        shown.questions.map((question) => <Question key={question.id} question={question} both={both} />)
      ) : (
        <View style={{ flex: 1, justifyContent: 'center', paddingBottom: 40 }}>
          <EmptyState emoji={SEALED} title={say.empty.title} body={say.empty.body(formatDayOfYear(next.opensOn))} />
        </View>
      )}
      <WriteSheet board={board} visible={writing} onClose={() => setWriting(false)} />
      <AskSheet board={board} visible={asking} onClose={() => setAsking(false)} />
    </BoardFrame>
  );
}

/**
 * The glass bar that floats over the end of the page: the year that is being written, and its one button.
 * (The frame's own `CtaBar` keeps its title to one line; "Year thirteen opens when you have both answered"
 * needs two.)
 */
function NextBar({ title, line, children }: { title: string; line: string; children?: ReactNode }) {
  return (
    <GlassBar radius="sheet" contentStyle={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingLeft: 20, paddingRight: 10, minHeight: 56 }}>
      <View style={{ flex: 1 }}>
        <Txt variant="item" weight={800} numberOfLines={2}>
          {title}
        </Txt>
        {line ? (
          <Txt variant="footnote" color="muted" numberOfLines={2}>
            {line}
          </Txt>
        ) : null}
      </View>
      {children}
    </GlassBar>
  );
}

/** One question of a year that has opened: everyone's answer side by side, and the word they share when they do. */
function Question({ question, both }: { question: AnniversaryQuestionResponse; both: boolean }) {
  const { colors } = useTheme();
  return (
    <Card style={{ gap: 10, marginHorizontal: layout.barGutter, marginBottom: 10, padding: 14 }}>
      <Txt variant="headline" weight={800} accessibilityRole="header">
        {question.text}
      </Txt>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {question.answers.map((answer, index) => (
          <View
            key={answer.person?.memberId ?? index}
            accessible
            accessibilityLabel={say.answerSpoken(answer.yours ? null : (answer.person?.name ?? ''), answer.text)}
            style={{ flexGrow: 1, flexBasis: '45%', gap: 6, padding: 10, borderRadius: radius.thumb, backgroundColor: colors.fill }}>
            <Avatar uri={answer.person?.avatarUrl} name={answer.person?.name ?? ''} size={24} />
            <Txt variant="note" weight={500}>
              {answer.text}
            </Txt>
          </View>
        ))}
      </View>
      {question.same ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Check size={14} color={colors.ok} strokeWidth={3} />
          <Txt variant="footnote" weight={700} color="ok">
            {say.same(question.same, both)}
          </Txt>
        </View>
      ) : null}
    </Card>
  );
}

/** This year's questions with this person's own answers: written, changed, or taken out, until the year opens. */
function WriteSheet({ board, visible, onClose }: { board: Questions; visible: boolean; onClose: () => void }) {
  const next = board.view.next;
  return (
    <Sheet visible={visible} onClose={onClose} title={say.write.title(next.year)} subtitle={say.write.lead} tall>
      {visible ? <Writing board={board} onClose={onClose} /> : null}
    </Sheet>
  );
}

function Writing({ board, onClose }: { board: Questions; onClose: () => void }) {
  const next = board.view.next;
  const changes = useBoardChanges(board);
  const clientIds = useRef<Record<string, string>>({});
  const [typed, setTyped] = useState<Record<string, string>>(() => Object.fromEntries(next.yours.map((one) => [one.questionId, one.answer ?? ''])));
  const changed = next.yours.filter((one) => (typed[one.questionId] ?? '').trim() !== (one.answer ?? ''));
  const others = next.others.map((one) => one.person.name ?? '');

  const save = async () => {
    for (const one of changed) {
      const text = (typed[one.questionId] ?? '').trim();
      // An answer that was emptied is taken out; one that was written or reworded replaces what was there.
      if (!text) {
        if (one.answerId && !(await changes.remove(one.answerId))) return;
        continue;
      }
      const clientId = (clientIds.current[one.questionId] ??= newClientId());
      if (!(await changes.add('answer', { questionId: one.questionId, text }, clientId))) return;
      delete clientIds.current[one.questionId];
    }
    onClose();
  };

  return (
    <View style={{ gap: 14, paddingTop: 6, paddingHorizontal: layout.rowGutter }}>
      {next.yours.map((one) => (
        <Field key={one.questionId} label={one.question} value={typed[one.questionId] ?? ''} onChangeText={(text) => setTyped((old) => ({ ...old, [one.questionId]: text }))} multiline maxLength={2000} placeholder={say.write.placeholder} />
      ))}
      <NoteBox icon={(color) => <Lock size={20} color={color} />}>{say.write.sealed(others)}</NoteBox>
      {changes.problem ? (
        <Txt variant="caption" color="danger" accessibilityLiveRegion="polite">
          {changes.problem}
        </Txt>
      ) : null}
      <Button label={say.write.save} size="lg" block disabled={changed.length === 0} loading={changes.busy} onPress={() => void save()} />
    </View>
  );
}

/** One more question, asked from the year that is being written. */
function AskSheet({ board, visible, onClose }: { board: Questions; visible: boolean; onClose: () => void }) {
  return (
    <Sheet visible={visible} onClose={onClose} title={say.ask.title} subtitle={say.ask.lead(board.view.next.year)}>
      {visible ? <Asking board={board} onClose={onClose} /> : null}
    </Sheet>
  );
}

function Asking({ board, onClose }: { board: Questions; onClose: () => void }) {
  const changes = useBoardChanges(board);
  const clientId = useRef(newClientId());
  const [text, setText] = useState('');
  return (
    <View style={{ gap: 12, paddingTop: 6, paddingHorizontal: layout.rowGutter }}>
      <Field label={say.ask.label} value={text} onChangeText={setText} maxLength={300} autoFocus placeholder={say.ask.placeholder} error={changes.problem} />
      <Button label={say.ask.save} size="lg" block disabled={!text.trim()} loading={changes.busy} onPress={() => void changes.add('question', { text: text.trim() }, clientId.current).then((added) => (added ? onClose() : undefined))} />
    </View>
  );
}

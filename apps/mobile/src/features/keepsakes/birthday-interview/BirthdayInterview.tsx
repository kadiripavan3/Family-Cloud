import { useRef, useState } from 'react';
import { View } from 'react-native';

import { messageFor } from '@/api/fetcher';
import type { BirthdayInterviewQuestion, BirthdayInterviewSettings, BirthdayInterviewView } from '@/api/generated/homeport';
import { BoardFrame } from '@/features/templates/BoardFrame';
import { uploadSound } from '@/features/templates/media';
import { AddBar, CtaBar } from '@/features/templates/parts/Bars';
import { PersonHead } from '@/features/templates/parts/Heads';
import { Notice } from '@/features/templates/parts/Notice';
import { PlayButton } from '@/features/templates/parts/Play';
import { pickSound, sound } from '@/features/templates/sound';
import type { LocalSound } from '@/features/templates/soundFile';
import type { Board, BoardScreenProps } from '@/features/templates/types';
import { useBoardChanges } from '@/features/templates/useBoard';
import { formatDayOfYear } from '@/lib/dates';
import { newClientId } from '@/lib/ids';
import { layout, radius, useTheme } from '@/theme';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Field } from '@/ui/Field';
import { Tap } from '@/ui/Motion';
import { Sheet, SheetRow } from '@/ui/Sheet';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

type Interview = Board<BirthdayInterviewView, BirthdayInterviewSettings>;
const say = words.keepsakes.interview;

/**
 * 15.2 The birthday interview. The same questions on every birthday, in their own words and, where there is
 * one, their own voice. Each question is a card with its answers lined up by age, the newest round marked.
 * A card opens the question to write this year's answer; the bar at the end says how far the next birthday
 * is and opens the list of questions, where another can be added.
 */
export function BirthdayInterview({ board }: BoardScreenProps<BirthdayInterviewView, BirthdayInterviewSettings>) {
  const view = board.view;
  const name = view.person?.name ?? '';
  const [openId, setOpenId] = useState<string | null>(null);
  const [listing, setListing] = useState(false);
  const question = view.questions.find((one) => one.id === openId) ?? null;

  return (
    <BoardFrame
      board={board}
      floating={
        view.next ? (
          // The API's own line: "Mia's 10th is in 23 days".
          <CtaBar title={view.next.line} line={say.ready(view.questions.length)}>
            <Button label={say.getReady} size="sm" inline onPress={() => setListing(true)} />
          </CtaBar>
        ) : undefined
      }>
      <PersonHead uri={view.person?.avatarUrl} name={name} title={board.title} line={say.lead(view.questions.length, view.birthday ? formatDayOfYear(view.birthday) : null)} />
      {view.questions.map((one) => (
        <QuestionCard key={one.id} question={one} name={name} onPress={() => setOpenId(one.id)} />
      ))}
      <QuestionsSheet board={board} visible={listing} onClose={() => setListing(false)} onQuestion={(id) => setOpenId(id)} />
      <AnswerSheet board={board} question={question} name={name} onClose={() => setOpenId(null)} />
    </BoardFrame>
  );
}

/** One question with its answers by age: the age on a small round badge (the newest round in the accent colour), and a play button where there is a recording. */
function QuestionCard({ question, name, onPress }: { question: BirthdayInterviewQuestion; name: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Card style={{ marginHorizontal: layout.barGutter, marginBottom: 10 }}>
      <Tap accessibilityRole="button" accessibilityLabel={say.questionSpoken(question.text, question.answers.length)} scaleTo={0.99} onPress={onPress} style={{ gap: 8, padding: 14 }}>
        <Txt variant="headline" weight={800}>
          {question.text}
        </Txt>
        {question.answers.length === 0 ? (
          <Txt variant="bodySmall" color="muted">
            {say.notAsked}
          </Txt>
        ) : (
          question.answers.map((answer) => (
            <View key={answer.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ width: 26, height: 26, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: answer.latest ? colors.accent : colors.fill }}>
                <Txt variant="small" weight={800} style={{ color: answer.latest ? colors.onAccent : colors.text }}>
                  {answer.age}
                </Txt>
              </View>
              <Txt variant="bodySmall" weight={answer.latest ? 700 : 500} style={{ flex: 1, color: answer.latest ? colors.text : colors.muted }}>
                {answer.text}
              </Txt>
              {answer.voice ? <PlayButton media={answer.voice} label={say.playAnswer(name, answer.age)} /> : null}
            </View>
          ))
        )}
      </Tap>
    </Card>
  );
}

/** The questions, one under another, with a box to add one more. A question opens its answer. */
function QuestionsSheet({ board, visible, onClose, onQuestion }: { board: Interview; visible: boolean; onClose: () => void; onQuestion: (id: string) => void }) {
  const adding = useBoardChanges(board);
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={say.questions.title}
      subtitle={say.questions.lead}
      tall
      footer={board.canEdit ? <AddBar placeholder={say.questions.add} busy={adding.busy} problem={adding.problem} maxLength={200} onSubmit={async (text) => (await adding.add('question', { text })) !== null} /> : undefined}>
      {board.view.questions.map((one, index) => (
        <SheetRow
          key={one.id}
          first={index === 0}
          label={one.text}
          note={say.answersSoFar(one.answers.length)}
          onPress={() => {
            onClose();
            onQuestion(one.id);
          }}
        />
      ))}
    </Sheet>
  );
}

/** One question, opened: what was said in earlier years, and this year's answer to write down, with a recording where there is one. */
function AnswerSheet({ board, question, name, onClose }: { board: Interview; question: BirthdayInterviewQuestion | null; name: string; onClose: () => void }) {
  return (
    <Sheet visible={question !== null} onClose={onClose} title={question?.text} subtitle={question ? say.answer.lead(name) : undefined}>
      {question ? <Answering key={question.id} board={board} question={question} name={name} onClose={onClose} /> : null}
    </Sheet>
  );
}

function Answering({ board, question, name, onClose }: { board: Interview; question: BirthdayInterviewQuestion; name: string; onClose: () => void }) {
  const changes = useBoardChanges(board);
  const clientId = useRef(newClientId());
  const [text, setText] = useState('');
  const [recording, setRecording] = useState<LocalSound | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const save = async () => {
    setProblem(null);
    setSending(true);
    try {
      const mediaId = recording ? await uploadSound(recording) : undefined;
      if (await changes.add('answer', { questionId: question.id, text: text.trim() || undefined, mediaId }, clientId.current)) onClose();
    } catch (error) {
      setProblem(messageFor(error));
    } finally {
      setSending(false);
    }
  };
  const chooseSound = async () => {
    if (!sound.canAdd) return setNotice(words.templates.sound.cantRecord);
    const picked = await pickSound();
    if (picked) setRecording(picked);
  };

  if (!board.canEdit) {
    return (
      <Txt variant="callout" color="muted" style={{ paddingTop: 6, paddingHorizontal: layout.gutter }}>
        {say.answer.viewOnly}
      </Txt>
    );
  }
  return (
    <View style={{ gap: 12, paddingTop: 6, paddingHorizontal: layout.rowGutter }}>
      <Field label={say.answer.label(name)} value={text} onChangeText={setText} multiline maxLength={2000} autoFocus />
      {recording ? (
        <Txt variant="callout" weight={700} accessibilityLiveRegion="polite">
          {words.templates.sound.attached(words.templates.sound.clock(recording.seconds ?? 0))}
        </Txt>
      ) : null}
      <Button label={recording ? say.answer.changeVoice : say.answer.addVoice(name)} variant="soft" block onPress={() => void chooseSound()} />
      {problem || changes.problem ? (
        <Txt variant="caption" color="danger" accessibilityLiveRegion="polite">
          {problem ?? changes.problem}
        </Txt>
      ) : null}
      <Button label={say.answer.save} size="lg" block disabled={!text.trim() && !recording} loading={sending || changes.busy} onPress={() => void save()} />
      <Notice text={notice} onClose={() => setNotice(null)} />
    </View>
  );
}

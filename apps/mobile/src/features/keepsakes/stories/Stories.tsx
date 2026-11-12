import { ChevronRight, Clock, Link2, MessageCirclePlus, Play, Route, Send } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { Share, View } from 'react-native';

import { messageFor } from '@/api/fetcher';
import type { StoriesQuestion, StoriesSettings, StoriesView } from '@/api/generated/homeport';
import { useCircles } from '@/features/circles/current';
import { membersOf } from '@/features/circles/members';
import { BoardFrame, type MenuRow } from '@/features/templates/BoardFrame';
import { pickPhoto, uploadPhoto } from '@/features/templates/media';
import { CtaBar } from '@/features/templates/parts/Bars';
import { PersonHead } from '@/features/templates/parts/Heads';
import { Notice } from '@/features/templates/parts/Notice';
import { PersonChips } from '@/features/templates/parts/People';
import { PlayButton } from '@/features/templates/parts/Play';
import type { Board, BoardScreenProps } from '@/features/templates/types';
import { useBoardChanges } from '@/features/templates/useBoard';
import { formatDay, formatWeekdayLong, timeAgo } from '@/lib/dates';
import { newClientId } from '@/lib/ids';
import { firstName } from '@/lib/names';
import { layout, radius, useTheme } from '@/theme';
import { Avatar } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { Eyebrow } from '@/ui/Eyebrow';
import { Field } from '@/ui/Field';
import { GroupLabel } from '@/ui/Heading';
import { LinkBox } from '@/ui/LinkBox';
import { Tap } from '@/ui/Motion';
import { Photo } from '@/ui/Photo';
import { Sheet } from '@/ui/Sheet';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

type Told = Board<StoriesView, StoriesSettings>;
const say = words.keepsakes.stories;

/** The bars of the little sound wave beside a play button, as the drawing has them (how tall each is, out of 100). */
const WAVE = [30, 60, 90, 50, 75, 40, 100, 65, 35, 80, 55, 25, 70, 45, 85, 60, 30, 50, 75, 40, 20, 55, 35, 65];

/**
 * 15.5 Grandma's stories. One question a week goes to someone outside the circle as a link; they open it
 * and talk, with no app and nothing to type, and the answer is kept here with their voice. This week's
 * question on top (its recording once it is answered, the link to send until then), what was told before,
 * and the questions still waiting to go out. Anyone in the circle can ask one.
 */
export function Stories({ board }: BoardScreenProps<StoriesView, StoriesSettings>) {
  const { colors } = useTheme();
  const view = board.view;
  const teller = firstName(view.tellerName);
  const [openId, setOpenId] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const everything = [view.thisWeek, ...view.toldBefore, ...view.waiting, ...view.unanswered].filter((one): one is StoriesQuestion => !!one);
  const opened = everything.find((one) => one.id === openId) ?? null;
  const week = view.thisWeek;

  const menu: MenuRow[] = board.canEdit ? [{ icon: (color) => <MessageCirclePlus size={20} color={color} />, label: say.ask.title, onPress: () => setAsking(true) }] : [];

  return (
    <BoardFrame
      board={board}
      menu={menu}
      floating={
        <CtaBar title={say.book.title} line={say.book.line(view.told, teller)}>
          <Button label={say.book.book} size="sm" variant="soft" inline onPress={() => setNotice(say.book.bookNote)} />
          <Button label={say.book.journey} size="sm" inline icon={(color) => <Route size={16} color={color} />} onPress={() => setNotice(say.book.journeyNote(teller))} />
        </CtaBar>
      }>
      <PersonHead name={view.tellerName} title={board.title} line={say.lead(view.told)} />

      {week ? (
        <View style={{ gap: 6, marginHorizontal: layout.barGutter, padding: 16, borderRadius: radius.panel, backgroundColor: colors.accentSoft }}>
          <Eyebrow>{say.thisWeek}</Eyebrow>
          {week.answered ? (
            <Tap accessibilityRole="button" accessibilityLabel={words.common.spoken([week.text, say.story.open])} scaleTo={0.99} onPress={() => setOpenId(week.id)}>
              <Txt variant="titleSmall">{week.text}</Txt>
            </Tap>
          ) : (
            <Txt variant="titleSmall">{week.text}</Txt>
          )}
          {week.recording ? (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 6, marginBottom: 2 }}>
                <PlayButton look="round" media={week.recording} label={say.play(week.text)} />
                <Wave />
                <Txt variant="footnote" weight={700}>
                  {words.templates.sound.clock(week.recording.seconds ?? 0)}
                </Txt>
              </View>
              <Txt variant="footnote" color="muted">
                {say.answered(teller, week.answeredAt ? timeAgo(week.answeredAt) : null)}
              </Txt>
            </>
          ) : (
            <Waiting question={week} teller={teller} />
          )}
        </View>
      ) : (
        <View style={{ gap: 10, marginHorizontal: layout.barGutter, padding: 16, borderRadius: radius.panel, backgroundColor: colors.accentSoft }}>
          <Eyebrow>{say.thisWeek}</Eyebrow>
          <Txt variant="titleSmall">{say.none.title}</Txt>
          <Txt variant="footnote" color="muted">
            {say.none.body(teller)}
          </Txt>
          {board.canEdit ? <Button label={say.ask.title} size="sm" onPress={() => setAsking(true)} /> : null}
        </View>
      )}

      {view.toldBefore.length ? <GroupLabel style={{ marginHorizontal: layout.gutter }}>{say.told}</GroupLabel> : null}
      {view.toldBefore.map((one) => (
        <StoryRow key={one.id} title={one.text} line={say.storyLine(one.recording?.seconds ?? null, one.transcript.length > 0, one.photos.length)} leading={<PlayTile />} trailing={<ChevronRight size={18} color={colors.muted} />} onPress={() => setOpenId(one.id)} />
      ))}

      {view.waiting.length || view.unanswered.length ? <GroupLabel style={{ marginHorizontal: layout.gutter }}>{say.coming}</GroupLabel> : null}
      {view.waiting.map((one) => (
        <StoryRow
          key={one.id}
          title={one.text}
          line={say.waitingLine(one.askedBy?.name ?? null, formatWeekdayLong(one.goesOut))}
          leading={<Avatar uri={one.askedBy?.avatarUrl} name={one.askedBy?.name ?? ''} size={44} />}
          trailing={<Clock size={18} color={colors.muted} />}
          onPress={() => setOpenId(one.id)}
        />
      ))}
      {view.unanswered.map((one) => (
        <StoryRow key={one.id} title={one.text} line={say.unansweredLine(formatDay(one.goesOut))} leading={<Avatar uri={one.askedBy?.avatarUrl} name={one.askedBy?.name ?? ''} size={44} />} trailing={<Link2 size={18} color={colors.muted} />} onPress={() => setOpenId(one.id)} />
      ))}

      <StorySheet board={board} question={opened} teller={teller} onClose={() => setOpenId(null)} />
      <AskSheet board={board} visible={asking} teller={teller} onClose={() => setAsking(false)} />
      <Notice text={notice} onClose={() => setNotice(null)} />
    </BoardFrame>
  );
}

/** The little sound wave beside a play button: decoration, the same for every recording. */
function Wave() {
  const { colors } = useTheme();
  return (
    <View accessible={false} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 36 }}>
      {WAVE.map((tall, index) => (
        <View key={index} style={{ width: 3, height: `${tall}%`, borderRadius: radius.pill, backgroundColor: colors.accentText }} />
      ))}
    </View>
  );
}

/** The grey tile with a play triangle at the start of a story that was told. */
function PlayTile() {
  const { colors } = useTheme();
  return (
    <View style={{ width: 44, height: 44, borderRadius: radius.thumb, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.fill }}>
      <Play size={20} color={colors.text} fill={colors.text} />
    </View>
  );
}

function StoryRow({ title, line, leading, trailing, onPress }: { title: string; line: string; leading: React.ReactNode; trailing: React.ReactNode; onPress: () => void }) {
  return (
    <Tap accessibilityRole="button" accessibilityLabel={words.common.spoken([title, line])} scaleTo={0.99} onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 58, paddingVertical: 7, paddingHorizontal: layout.rowGutter }}>
      {leading}
      <View style={{ flex: 1, gap: 3 }}>
        <Txt variant="item" numberOfLines={2}>
          {title}
        </Txt>
        <Txt variant="footnote" color="muted" numberOfLines={1}>
          {line}
        </Txt>
      </View>
      {trailing}
    </Tap>
  );
}

/** A question that is out and not answered: the link to send, by the phone's share sheet or by copying it. */
function Waiting({ question, teller }: { question: StoriesQuestion; teller: string }) {
  const [problem, setProblem] = useState(false);
  const link = question.link;
  if (!link) {
    return (
      <Txt variant="footnote" color="muted">
        {say.waitingFor(teller)}
      </Txt>
    );
  }
  const send = () => {
    setProblem(false);
    // Where there is no share sheet (a desktop browser), the link is there to copy.
    Share.share({ message: say.shareMessage(teller, question.text, link) }).catch(() => setProblem(true));
  };
  return (
    <View style={{ gap: 8, marginTop: 6 }}>
      <LinkBox url={link} icon={(color) => <Link2 size={16} color={color} />} copyLabel={say.copyLink} />
      <Button label={say.send(teller)} size="sm" icon={(color) => <Send size={16} color={color} />} onPress={send} />
      <Txt variant="footnote" color="muted" accessibilityLiveRegion="polite">
        {problem ? say.cantShare : say.linkNote(teller)}
      </Txt>
    </View>
  );
}

/** A question, opened. Told: the recording, the words typed out where there are any, the photos, and one more photo. Waiting: when it goes out, and "send it now". */
function StorySheet({ board, question, teller, onClose }: { board: Told; question: StoriesQuestion | null; teller: string; onClose: () => void }) {
  const changes = useBoardChanges(board);
  const clientId = useRef(newClientId());
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const addPhoto = async () => {
    if (!question) return;
    setProblem(null);
    try {
      const photo = await pickPhoto();
      if (!photo) return;
      setSending(true);
      const mediaId = await uploadPhoto(photo);
      if (await changes.add('photo', { questionId: question.id, mediaId }, clientId.current)) clientId.current = newClientId();
    } catch (error) {
      setProblem(messageFor(error));
    } finally {
      setSending(false);
    }
  };

  return (
    <Sheet visible={question !== null} onClose={onClose} title={question?.text} subtitle={question ? (question.answered ? say.story.told(teller, question.answeredAt ? timeAgo(question.answeredAt) : null) : question.out ? say.unansweredLine(formatDay(question.goesOut)) : say.waitingLine(question.askedBy?.name ?? null, formatWeekdayLong(question.goesOut))) : undefined}>
      {question ? (
        <View style={{ gap: 14, paddingTop: 6, paddingHorizontal: layout.gutter }}>
          {question.recording ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <PlayButton look="round" media={question.recording} label={say.play(question.text)} />
              <Wave />
              <Txt variant="footnote" weight={700}>
                {words.templates.sound.clock(question.recording.seconds ?? 0)}
              </Txt>
            </View>
          ) : null}
          {question.answered ? (
            question.transcript ? (
              <Txt variant="body">{question.transcript}</Txt>
            ) : (
              <Txt variant="footnote" color="muted">
                {say.story.noTranscript(teller)}
              </Txt>
            )
          ) : null}
          {question.photos.length ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {question.photos.map((photo) => (
                <Photo key={photo.id} uri={photo.thumbUrl ?? photo.url} radius="tile" style={{ width: 96, height: 96 }} label={say.story.photo} />
              ))}
            </View>
          ) : null}
          {problem || changes.problem ? (
            <Txt variant="caption" color="danger" accessibilityLiveRegion="polite">
              {problem ?? changes.problem}
            </Txt>
          ) : null}
          {question.answered && board.canEdit ? <Button label={say.story.addPhoto} variant="soft" size="lg" block loading={sending} onPress={() => void addPhoto()} /> : null}
          {!question.answered && question.out ? <Waiting question={question} teller={teller} /> : null}
          {!question.out && board.canEdit ? (
            <View style={{ gap: 10 }}>
              <Button label={say.sendNow} size="lg" block loading={changes.busy} onPress={() => void changes.act('send_now', { entryId: question.id }).then((sent) => (sent ? onClose() : undefined))} />
              <Button label={say.takeBack} variant="soft" size="lg" block onPress={() => void changes.remove(question.id).then((gone) => (gone ? onClose() : undefined))} />
            </View>
          ) : null}
        </View>
      ) : null}
    </Sheet>
  );
}

/** A new question: the words, and whose question it is (a child can ask through a grown-up's phone). */
function AskSheet({ board, visible, teller, onClose }: { board: Told; visible: boolean; teller: string; onClose: () => void }) {
  return (
    <Sheet visible={visible} onClose={onClose} title={say.ask.title} subtitle={say.ask.lead(teller)}>
      {visible ? <Asking board={board} onClose={onClose} /> : null}
    </Sheet>
  );
}

function Asking({ board, onClose }: { board: Told; onClose: () => void }) {
  const circle = useCircles().find((one) => one.id === board.circleId);
  const people = circle ? membersOf(circle).filter((member) => member.kind !== 'pet') : [];
  const changes = useBoardChanges(board);
  const clientId = useRef(newClientId());
  const [text, setText] = useState('');
  const [by, setBy] = useState<string | null>(circle?.myMemberId ?? null);
  return (
    <View style={{ gap: 12, paddingTop: 6 }}>
      <View style={{ paddingHorizontal: layout.rowGutter }}>
        <Field label={say.ask.question} value={text} onChangeText={setText} maxLength={300} autoFocus multiline placeholder={say.ask.placeholder} error={changes.problem} />
      </View>
      {people.length > 1 ? (
        <View>
          <GroupLabel style={{ marginTop: 4, marginHorizontal: layout.gutter }}>{say.ask.by}</GroupLabel>
          <PersonChips inset people={people} value={by} onChange={setBy} />
        </View>
      ) : null}
      <View style={{ paddingHorizontal: layout.rowGutter }}>
        <Button label={say.ask.save} size="lg" block disabled={!text.trim()} loading={changes.busy} onPress={() => void changes.add('question', { text: text.trim(), askedByMemberId: by ?? undefined }, clientId.current).then((added) => (added ? onClose() : undefined))} />
      </View>
    </View>
  );
}

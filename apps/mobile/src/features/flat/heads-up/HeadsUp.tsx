import { Check, History, MessageCircle, Moon, Plus } from 'lucide-react-native';
import { type ReactNode, useRef, useState } from 'react';
import { View } from 'react-native';

import { messageFor } from '@/api/fetcher';
import { type HeadsUpNoticeResponse, type HeadsUpSettings, type HeadsUpViewResponse, type PersonBrief, useGetBoardEntriesInfinite } from '@/api/generated/homeport';
import { paged, rows } from '@/api/pages';
import { BoardFrame, type MenuRow } from '@/features/templates/BoardFrame';
import { AddBar } from '@/features/templates/parts/Bars';
import { Notice } from '@/features/templates/parts/Notice';
import type { Board, BoardScreenProps } from '@/features/templates/types';
import { useBoardChanges } from '@/features/templates/useBoard';
import { addDays, formatDayFull, formatRange, formatWeekday, today } from '@/lib/dates';
import { newClientId } from '@/lib/ids';
import { layout, useTheme } from '@/theme';
import { Avatar } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { DayPicker } from '@/ui/DayPicker';
import { EmptyState } from '@/ui/EmptyState';
import { Field, FieldButton } from '@/ui/Field';
import { Loading } from '@/ui/Loading';
import { MoreButton } from '@/ui/MoreButton';
import { Tap } from '@/ui/Motion';
import { NoteBox } from '@/ui/NoteBox';
import { RoundButton } from '@/ui/RoundButton';
import { Segmented } from '@/ui/Segmented';
import { Sheet } from '@/ui/Sheet';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

import { writtenAgo } from '../days';
import { called, calledAll, isMe, useFlat } from '../people';

type Notices = Board<HeadsUpViewResponse, HeadsUpSettings>;
type One = HeadsUpNoticeResponse;
type What = 'note' | 'guests' | 'away';
type Says = 'fine' | 'talk';
const WHATS: readonly What[] = ['note', 'guests', 'away'];
const say = words.flat.headsUp;
const WAVE = '👋';

/** The days a notice is about: "13 to 15 November", or the one day it starts on. Null for a notice without days. */
const daysOf = (notice: One) => (notice.fromDay && notice.untilDay ? formatRange(notice.fromDay, notice.untilDay) : notice.fromDay ? formatWeekday(notice.fromDay) : null);
/** The small line under a notice: who wrote it, and the few words more, the nights it takes off the bills, or how long ago it was written. */
const under = (notice: One, me: string | null) => words.common.join([called(notice.from, me), notice.detail ?? (notice.nightsAway ? say.nightsOff(notice.nightsAway, notice.mine) : writtenAgo(notice.writtenAt))]);

/**
 * 18.5 Heads-up. One line to tell the flat something, and a tap from each of the others: it's fine, or
 * let's talk first. A notice that waits for the viewer's answer stands out and carries the two buttons; the
 * others show who said what. Nobody answers for anybody else, and nobody answers their own. The box at the
 * end is the one line; the plus is the whole notice (guests, or time away with its days, which is what the
 * bills count off). The line that always stands (quiet hours) is the board's own setting.
 */
export function HeadsUp({ board }: BoardScreenProps<HeadsUpViewResponse, HeadsUpSettings>) {
  const view = board.view;
  const { me } = useFlat(board.circleId);
  const changes = useBoardChanges(board);
  const clientId = useRef(newClientId());
  const [sheet, setSheet] = useState<'write' | 'earlier' | 'standing' | null>(null);
  const [answering, setAnswering] = useState<{ id: string; says: Says } | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const opened = view.notices.find((one) => one.id === openId) ?? null;
  const answered = view.notices.find((one) => one.id === answering?.id) ?? null;

  const tell = async (text: string) => {
    if (!(await changes.add('notice', { text }, clientId.current))) return false;
    clientId.current = newClientId();
    return true;
  };
  const menu: MenuRow[] = [
    { icon: (color) => <History size={20} color={color} />, label: say.earlier.open, note: view.earlier ? say.earlier.count(view.earlier) : undefined, onPress: () => setSheet('earlier') },
    ...(board.canEdit ? [{ icon: (color: string) => <Moon size={20} color={color} />, label: say.standing.open, onPress: () => setSheet('standing') }] : []),
  ];

  return (
    <BoardFrame
      board={board}
      title={board.title}
      chip="menu"
      problem={changes.problem}
      menu={menu}
      actions={board.canEdit ? <RoundButton label={say.write.open} onPress={() => setSheet('write')} icon={(color) => <Plus size={20} color={color} />} /> : undefined}
      footer={board.canEdit ? <AddBar placeholder={say.add} maxLength={200} busy={changes.busy} onSubmit={tell} onMic={() => setNotice(say.micNote)} micLabel={say.mic} /> : undefined}>
      {view.notices.map((one) => (
        <NoticeCard
          key={one.id}
          notice={one}
          me={me}
          busy={changes.busy}
          onOpen={() => setOpenId(one.id)}
          onFine={() => void changes.act('answer', { noticeId: one.id, says: 'fine' })}
          onAnswer={(says) => setAnswering({ id: one.id, says })}
        />
      ))}
      {view.notices.length === 0 ? (
        <View style={{ paddingTop: 40, paddingBottom: 24 }}>
          <EmptyState emoji={WAVE} title={say.empty.title} body={say.empty.body} />
        </View>
      ) : null}
      {view.standing ? (
        <NoteBox icon={(color) => <Moon size={20} color={color} />} title={view.standing} style={{ marginTop: 8, marginHorizontal: layout.barGutter }}>
          {view.standingNote}
        </NoteBox>
      ) : null}

      <WriteSheet board={board} visible={sheet === 'write'} onClose={() => setSheet(null)} />
      <EarlierSheet board={board} me={me} visible={sheet === 'earlier'} onClose={() => setSheet(null)} />
      <StandingSheet board={board} visible={sheet === 'standing'} onClose={() => setSheet(null)} />
      <AnswerSheet key={answering ? `${answering.id}-${answering.says}` : 'none'} board={board} notice={answered} me={me} says={answering?.says ?? 'fine'} onClose={() => setAnswering(null)} />
      <NoticeSheet board={board} notice={opened} me={me} onClose={() => setOpenId(null)} />
      <Notice text={notice} onClose={() => setNotice(null)} />
    </BoardFrame>
  );
}

/** A few faces in a row, each a little over the one before. */
function Faces({ people }: { people: readonly (PersonBrief | null)[] }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row' }}>
      {people.slice(0, 5).map((person, index) => (
        <View key={person?.memberId ?? index} style={{ marginLeft: index === 0 ? 0 : -8 }}>
          <Avatar uri={person?.avatarUrl} name={person?.name ?? ''} size={22} ring={colors.surface} />
        </View>
      ))}
    </View>
  );
}

/** One line of answers. The viewer's own is pressed to change it or take it back; anyone else's is plain. */
function Own({ yours, spoken, onPress, children }: { yours: boolean; spoken: string; onPress: () => void; children: ReactNode }) {
  const row = { flexDirection: 'row', alignItems: 'center', gap: 8 } as const;
  if (!yours) return <View style={row}>{children}</View>;
  return (
    <Tap accessibilityRole="button" accessibilityLabel={words.common.spoken([spoken, say.change])} scaleTo={0.99} onPress={onPress} style={row}>
      {children}
    </Tap>
  );
}

type CardProps = { notice: One; me: string | null; busy: boolean; onOpen: () => void; onFine: () => void; onAnswer: (says: Says) => void };

/**
 * One notice: who wrote it and what, then how the others stand on it. Everyone who simply said fine is a
 * face and one sentence; a few words that came with an answer are a line of their own, and so is someone who
 * would rather talk. A notice that waits for the viewer has an accent ring and the two buttons.
 */
function NoticeCard({ notice, me, busy, onOpen, onFine, onAnswer }: CardProps) {
  const { colors } = useTheme();
  const who = notice.from?.name ?? '';
  const fine = notice.replies.filter((reply) => reply.says === 'fine' && !reply.text);
  const fineFaces = [...fine.filter((reply) => reply.yours), ...fine.filter((reply) => !reply.yours)].map((reply) => reply.who);
  const withWords = notice.replies.filter((reply) => reply.says === 'fine' && reply.text);
  const talk = notice.replies.filter((reply) => reply.says !== 'fine');
  const mayChange = !notice.mine && notice.yourAnswer !== null && !notice.over;
  const fineLine = fine.length ? say.fine(calledAll(fine.map((reply) => reply.who), me), fine.some((reply) => reply.yours)) : '';
  // The ring is drawn inside the card's own edge, so a notice that waits is no bigger than one that doesn't.
  const ring = notice.needsYou ? 2 : 0;
  return (
    <Card style={{ gap: 10, marginHorizontal: layout.barGutter, marginBottom: 10, padding: 14 - ring, borderWidth: ring, borderColor: colors.accent }}>
      <Tap accessibilityRole="button" accessibilityLabel={words.common.spoken([notice.text, under(notice, me), notice.needsYou ? say.needsYou : null])} scaleTo={0.99} onPress={onOpen} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
        <Avatar uri={notice.from?.avatarUrl} name={who} size={36} />
        <View style={{ flex: 1 }}>
          <Txt variant="item" weight={800}>
            {notice.text}
          </Txt>
          <Txt variant="footnote" color="muted">
            {under(notice, me)}
          </Txt>
        </View>
      </Tap>
      {withWords.map((reply) => (
        <Own key={reply.who?.memberId ?? reply.text} yours={reply.yours && mayChange} spoken={say.withWords(called(reply.who, me), reply.text ?? '')} onPress={() => onAnswer('fine')}>
          <Check size={20} color={colors.muted} />
          <Txt variant="footnote" weight={700} color="muted" style={{ flex: 1 }}>
            {say.withWords(called(reply.who, me), reply.text ?? '')}
          </Txt>
        </Own>
      ))}
      {talk.map((reply) => (
        <Own key={reply.who?.memberId ?? reply.says} yours={reply.yours && mayChange} spoken={say.wantsToTalk(reply.yours ? null : (reply.who?.name ?? ''), reply.text)} onPress={() => onAnswer('talk')}>
          <MessageCircle size={20} color={colors.accentText} />
          <Txt variant="footnote" weight={700} style={{ flex: 1, color: colors.accentText }}>
            {say.wantsToTalk(reply.yours ? null : (reply.who?.name ?? ''), reply.text)}
          </Txt>
        </Own>
      ))}
      {fine.length || notice.needsYou ? (
        <Own yours={mayChange && fine.some((reply) => reply.yours)} spoken={fineLine} onPress={() => onAnswer('fine')}>
          {fine.length ? <Faces people={fineFaces} /> : null}
          <Txt variant="footnote" weight={700} color="muted" numberOfLines={2} style={{ flex: 1 }}>
            {fineLine}
          </Txt>
          {notice.needsYou ? (
            <>
              <Button label={say.talk} variant="soft" size="sm" inline disabled={busy} onPress={() => onAnswer('talk')} />
              <Button label={say.fineByMe} size="sm" inline disabled={busy} onPress={onFine} />
            </>
          ) : null}
        </Own>
      ) : null}
    </Card>
  );
}

/** The viewer's own answer to someone's notice: fine or let's talk, a few words with it, or taking it back. */
function AnswerSheet({ board, notice, me, says: first, onClose }: { board: Notices; notice: One | null; me: string | null; says: Says; onClose: () => void }) {
  const changes = useBoardChanges(board);
  const mine = notice?.replies.find((reply) => reply.yours);
  const [says, setSays] = useState<Says>(first);
  const [text, setText] = useState(mine?.text ?? '');
  const send = (body: Record<string, unknown>) => void changes.act('answer', { noticeId: notice?.id, ...body }).then((saved) => (saved ? onClose() : undefined));
  return (
    <Sheet visible={notice !== null} onClose={onClose} title={notice?.text} subtitle={notice ? under(notice, me) : undefined}>
      <View style={{ gap: 12, paddingTop: 6 }}>
        <Segmented
          label={say.answer.label}
          options={[
            { id: 'fine', label: say.fineByMe },
            { id: 'talk', label: say.talk },
          ]}
          value={says}
          onChange={setSays}
        />
        <View style={{ gap: 10, paddingHorizontal: layout.rowGutter }}>
          <Field label={say.answer.words} value={text} onChangeText={setText} maxLength={120} placeholder={says === 'fine' ? say.answer.finePlaceholder : say.answer.talkPlaceholder} error={changes.problem} />
          <Button label={say.answer.send} size="lg" block loading={changes.busy} onPress={() => send({ says, text: text.trim() || null })} />
          {mine ? <Button label={say.answer.takeBack} variant="soft" size="lg" block disabled={changes.busy} onPress={() => send({ says: null })} /> : null}
        </View>
      </View>
    </Sheet>
  );
}

/** A notice, pressed: its days, everyone's answer and who hasn't answered yet, and, for whoever wrote it, taking it down. */
function NoticeSheet({ board, notice, me, onClose }: { board: Notices; notice: One | null; me: string | null; onClose: () => void }) {
  const changes = useBoardChanges(board);
  return (
    <Sheet visible={notice !== null} onClose={onClose} title={notice?.text} subtitle={notice ? words.common.join([called(notice.from, me), notice.detail, daysOf(notice), say.written(writtenAgo(notice.writtenAt))]) : undefined}>
      {notice ? (
        <View style={{ gap: 12, paddingTop: 6, paddingHorizontal: layout.rowGutter }}>
          {notice.nightsAway ? (
            <Txt variant="callout" color="muted">
              {say.nightsOff(notice.nightsAway, notice.mine)}
            </Txt>
          ) : null}
          {notice.replies.map((reply) => (
            <View key={reply.who?.memberId ?? reply.says} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Avatar uri={reply.who?.avatarUrl} name={reply.who?.name ?? ''} size={34} />
              <View style={{ flex: 1 }}>
                <Txt variant="item">{called(reply.who, me)}</Txt>
                <Txt variant="footnote" color="muted">
                  {words.common.join([reply.says === 'fine' ? say.saidFine : say.saidTalk, reply.text])}
                </Txt>
              </View>
            </View>
          ))}
          {notice.waitingFor.length ? (
            <Txt variant="callout" color="muted">
              {say.waitingFor(notice.waitingFor.filter((person) => !isMe(person, me)).map((person) => person.name ?? ''), notice.waitingFor.some((person) => isMe(person, me)))}
            </Txt>
          ) : null}
          {changes.problem ? (
            <Txt variant="caption" color="danger" accessibilityLiveRegion="polite">
              {changes.problem}
            </Txt>
          ) : null}
          {notice.mine && board.canEdit ? <Button label={say.remove} variant="soft" size="lg" block loading={changes.busy} onPress={() => void changes.remove(notice.id).then((gone) => (gone ? onClose() : undefined))} /> : null}
        </View>
      ) : null}
    </Sheet>
  );
}

/** The whole notice, from the plus: what it says, a few words more, what it is about, and its days. Time away needs both. */
function WriteSheet({ board, visible, onClose }: { board: Notices; visible: boolean; onClose: () => void }) {
  const changes = useBoardChanges(board);
  const clientId = useRef(newClientId());
  const [text, setText] = useState('');
  const [detail, setDetail] = useState('');
  const [what, setWhat] = useState<What>('note');
  const [from, setFrom] = useState<string | null>(null);
  const [until, setUntil] = useState<string | null>(null);
  const [picking, setPicking] = useState<'from' | 'until' | null>(null);
  const withDays = what !== 'note';
  const ready = !!text.trim() && (what !== 'away' || (!!from && !!until && until > from)) && (!from || !until || until >= from);

  const tell = async () => {
    const added = await changes.add('notice', { text: text.trim(), detail: detail.trim() || undefined, what, from: withDays ? (from ?? undefined) : undefined, until: withDays && from ? (until ?? undefined) : undefined }, clientId.current);
    if (!added) return;
    clientId.current = newClientId();
    setText('');
    setDetail('');
    setWhat('note');
    setFrom(null);
    setUntil(null);
    onClose();
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={say.write.title} subtitle={say.write.lead}>
      <View style={{ gap: 12, paddingTop: 6 }}>
        <View style={{ gap: 12, paddingHorizontal: layout.rowGutter }}>
          <Field label={say.write.text} value={text} onChangeText={setText} maxLength={200} placeholder={say.write.textPlaceholder[what]} />
          <Field label={say.write.detail} value={detail} onChangeText={setDetail} maxLength={120} placeholder={say.write.detailPlaceholder} />
        </View>
        <Segmented label={say.write.what} options={WHATS.map((id) => ({ id, label: say.write.whats[id] }))} value={what} onChange={setWhat} />
        {withDays ? (
          <View style={{ gap: 8, paddingHorizontal: layout.rowGutter }}>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <FieldButton label={what === 'away' ? say.write.leave : say.write.from} value={from ? formatDayFull(from) : say.write.noDay} onPress={() => setPicking('from')} />
              <FieldButton label={what === 'away' ? say.write.back : say.write.until} value={until ? formatDayFull(until) : say.write.noDay} onPress={() => setPicking('until')} />
            </View>
            {what === 'away' ? (
              <Txt variant="footnote" color="muted">
                {say.write.awayNote}
              </Txt>
            ) : null}
          </View>
        ) : null}
        <View style={{ gap: 10, paddingHorizontal: layout.rowGutter }}>
          {changes.problem ? (
            <Txt variant="caption" color="danger" accessibilityLiveRegion="polite">
              {changes.problem}
            </Txt>
          ) : null}
          <Button label={say.write.save} size="lg" block disabled={!ready} loading={changes.busy} onPress={() => void tell()} />
        </View>
      </View>
      <DayPicker
        visible={picking === 'from'}
        onClose={() => setPicking(null)}
        title={what === 'away' ? say.write.leave : say.write.from}
        value={from ?? today()}
        min={today()}
        onChange={(day) => {
          setFrom(day);
          if (until && until < day) setUntil(null);
        }}
      />
      <DayPicker visible={picking === 'until'} onClose={() => setPicking(null)} title={what === 'away' ? say.write.back : say.write.until} value={until ?? addDays(from ?? today(), 1)} min={from ? (what === 'away' ? addDays(from, 1) : from) : today()} onChange={setUntil} />
    </Sheet>
  );
}

/** The notices that are over, newest first, a page at a time. */
function EarlierSheet({ board, me, visible, onClose }: { board: Notices; me: string | null; visible: boolean; onClose: () => void }) {
  const asked = useGetBoardEntriesInfinite(board.id, { kind: 'notice', day: today() }, { query: { ...paged, enabled: visible } });
  // One template's list holds that template's own: on this board every entry that is listed is a notice.
  const all = rows(asked.data) as One[] | undefined;
  const over = all?.filter((one) => one.over);
  return (
    <Sheet visible={visible} onClose={onClose} title={say.earlier.title} tall>
      {asked.isError && !over ? (
        <Txt variant="callout" color="muted" center style={{ padding: 32 }}>
          {messageFor(asked.error)}
        </Txt>
      ) : !over ? (
        <View style={{ minHeight: 200 }}>
          <Loading />
        </View>
      ) : over.length === 0 && !asked.hasNextPage ? (
        <Txt variant="callout" color="muted" center style={{ padding: 32 }}>
          {say.earlier.none}
        </Txt>
      ) : (
        <View style={{ gap: 14, paddingTop: 6, paddingHorizontal: layout.rowGutter }}>
          {over.map((one) => (
            <View key={one.id} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
              <Avatar uri={one.from?.avatarUrl} name={one.from?.name ?? ''} size={34} />
              <View style={{ flex: 1 }}>
                <Txt variant="item">{one.text}</Txt>
                <Txt variant="footnote" color="muted">
                  {words.common.join([called(one.from, me), one.detail, daysOf(one), one.nightsAway ? say.nights(one.nightsAway) : null])}
                </Txt>
              </View>
            </View>
          ))}
          <MoreButton pages={asked} />
        </View>
      )}
    </Sheet>
  );
}

/** The line that always stands under the notices, and the line under it. Emptied, it goes. */
function StandingSheet({ board, visible, onClose }: { board: Notices; visible: boolean; onClose: () => void }) {
  const changes = useBoardChanges(board);
  const [standing, setStanding] = useState(board.settings.standing ?? '');
  const [note, setNote] = useState(board.settings.standingNote ?? '');
  return (
    <Sheet visible={visible} onClose={onClose} title={say.standing.title} subtitle={say.standing.lead}>
      <View style={{ gap: 12, paddingTop: 6, paddingHorizontal: layout.rowGutter }}>
        <Field label={say.standing.line} value={standing} onChangeText={setStanding} maxLength={120} placeholder={say.standing.linePlaceholder} />
        <Field label={say.standing.note} value={note} onChangeText={setNote} maxLength={120} placeholder={say.standing.notePlaceholder} error={changes.problem} />
        <Button label={say.standing.save} size="lg" block loading={changes.busy} onPress={() => void changes.set({ standing: standing.trim(), standingNote: standing.trim() ? note.trim() : '' }).then((saved) => (saved ? onClose() : undefined))} />
      </View>
    </Sheet>
  );
}

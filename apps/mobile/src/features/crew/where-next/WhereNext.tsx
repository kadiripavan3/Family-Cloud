import { CalendarClock, Check, ImagePlus, Lock, Plus, Route, Vote } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { View } from 'react-native';

import { messageFor } from '@/api/fetcher';
import type { WhereNextIdeaResponse, WhereNextSettings, WhereNextViewResponse } from '@/api/generated/homeport';
import { Faces } from '@/features/plan/Faces';
import { readCents, readCount } from '@/features/plan/times';
import { BoardFrame, type MenuRow } from '@/features/templates/BoardFrame';
import { type LocalPhoto, pickPhoto, uploadPhoto } from '@/features/templates/media';
import { Notice } from '@/features/templates/parts/Notice';
import type { Board, BoardScreenProps } from '@/features/templates/types';
import { useBoardChanges } from '@/features/templates/useBoard';
import { useOpenThing } from '@/features/things/open';
import { addDays, formatWeekday, today } from '@/lib/dates';
import { newClientId } from '@/lib/ids';
import { formatMoney } from '@/lib/money';
import { layout, radius, useTheme } from '@/theme';
import { Button } from '@/ui/Button';
import { ConfirmSheet } from '@/ui/ConfirmSheet';
import { DayPicker } from '@/ui/DayPicker';
import { EmptyState } from '@/ui/EmptyState';
import { Field, FieldButton } from '@/ui/Field';
import { Tap } from '@/ui/Motion';
import { NoteBox } from '@/ui/NoteBox';
import { Photo } from '@/ui/Photo';
import { RoundButton } from '@/ui/RoundButton';
import { Sheet } from '@/ui/Sheet';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

type Trip = Board<WhereNextViewResponse, WhereNextSettings>;
const say = words.crew.whereNext;
const GLOBE = '🌍';

/** The facts beside an idea: "4 days · about €310 each". */
function factsOf(idea: WhereNextIdeaResponse): string {
  return words.common.join([idea.days ? say.days(idea.days) : null, idea.costCents !== null ? say.each(formatMoney(idea.costCents, idea.currency)) : null]);
}

/**
 * 19.5 Where next? Ideas for the next trip with the facts beside them, a vote, and a winner. While the vote
 * is open the API says only who has voted, never for what, and this screen draws no more than that: no
 * bars, no faces, just this person's own tick. Once it is closed the counts and the voters are shown, the
 * winner first, and one tap makes it a trip: a folder in Notes to plan in.
 */
export function WhereNext({ board }: BoardScreenProps<WhereNextViewResponse, WhereNextSettings>) {
  const view = board.view;
  const changes = useBoardChanges(board);
  const open = useOpenThing();
  const [adding, setAdding] = useState(false);
  const [setting, setSetting] = useState(false);
  const [closing, setClosing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const idea = view.ideas.find((one) => one.id === openId) ?? null;
  const winner = view.ideas.find((one) => one.id === view.winnerId) ?? null;

  const menu: MenuRow[] =
    board.canEdit && !view.closed
      ? [
          { icon: (color) => <CalendarClock size={20} color={color} />, label: say.when.title, onPress: () => setSetting(true) },
          { icon: (color) => <Lock size={20} color={color} />, label: say.close.label, note: say.close.note, onPress: () => setClosing(true) },
        ]
      : [];

  return (
    <BoardFrame
      board={board}
      title={board.title}
      subtitle={words.common.join([view.when, view.ideas.length ? say.voted(view.voted, view.asked) : null])}
      chip="menu"
      menu={menu}
      problem={changes.problem}
      actions={<RoundButton label={say.add.button} onPress={() => (view.closed ? setNotice(say.closedNote) : board.canEdit ? setAdding(true) : setNotice(say.viewOnly))} icon={(color) => <Plus size={20} color={color} />} />}>
      {view.ideas.length === 0 ? (
        <View style={{ paddingTop: 48 }}>
          <EmptyState emoji={board.emoji || GLOBE} title={say.empty.title} body={say.empty.body} action={board.canEdit ? <Button label={say.add.button} onPress={() => setAdding(true)} /> : undefined} />
        </View>
      ) : (
        <>
          {view.ideas.map((one) => (
            <IdeaCard key={one.id} idea={one} closed={view.closed} onPress={() => setOpenId(one.id)} />
          ))}
          <View style={{ height: 8 }} />
          <Outcome board={board} winner={winner} busy={changes.busy} onMake={() => void changes.act('make_trip')} onOpen={() => open({ kind: 'folder', id: view.tripFolderId })} />
        </>
      )}

      <IdeaSheet board={board} idea={idea} onClose={() => setOpenId(null)} />
      <AddSheet board={board} visible={adding} onClose={() => setAdding(false)} />
      <WhenSheet board={board} visible={setting} onClose={() => setSetting(false)} />
      <ConfirmSheet
        visible={closing}
        onClose={() => {
          changes.forget();
          setClosing(false);
        }}
        title={say.close.title}
        body={say.close.body}
        confirm={say.close.confirm}
        busy={changes.busy}
        problem={changes.problem}
        onConfirm={() => void changes.act('close').then((closed) => (closed ? setClosing(false) : undefined))}
      />
      <Notice text={notice} onClose={() => setNotice(null)} />
    </BoardFrame>
  );
}

/**
 * One idea: its photo, its name and the facts. After the vote closed: its part of the votes as a bar, and
 * the faces of who voted for it. Before that there is nothing to draw but this person's own vote, which is
 * all the API sends. The idea this person voted for wears the dark outline.
 */
function IdeaCard({ idea, closed, onPress }: { idea: WhereNextIdeaResponse; closed: boolean; onPress: () => void }) {
  const { colors, shadow } = useTheme();
  const facts = factsOf(idea);
  const votes = idea.votes ?? 0;
  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel={words.common.spoken([idea.name, facts, closed ? say.votes(votes, idea.yours) : idea.yours ? say.yourVote : null, closed && idea.winner ? say.winnerWord : null])}
      scaleTo={0.99}
      onPress={onPress}
      // The outline is drawn inside the card, as in the drawing: the card keeps its size with or without it.
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: layout.barGutter, marginBottom: 10, padding: idea.yours ? 8 : 10, borderRadius: radius.cardLarge, borderWidth: idea.yours ? 2 : 0, borderColor: colors.text, backgroundColor: colors.surface, boxShadow: shadow.sm }}>
      <Photo uri={idea.photo?.thumbUrl ?? idea.photo?.url} radius="field" style={{ width: 76, height: 76 }} />
      <View style={{ flex: 1, gap: 4 }}>
        <Txt variant="headline" weight={800} numberOfLines={2}>
          {idea.name}
        </Txt>
        {facts ? (
          <Txt variant="footnote" color="muted" numberOfLines={1}>
            {facts}
          </Txt>
        ) : null}
        {closed ? (
          <>
            <View accessible accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: idea.percent ?? 0 }} style={{ height: 6, marginVertical: 2, borderRadius: radius.pill, overflow: 'hidden', backgroundColor: colors.fill2 }}>
              <View style={{ width: `${Math.min(Math.max(idea.percent ?? 0, 0), 100)}%`, height: 6, borderRadius: radius.pill, backgroundColor: colors.accent }} />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Faces people={idea.voters} most={5} />
              <Txt variant="footnote" weight={700}>
                {say.votes(votes, idea.yours)}
              </Txt>
            </View>
          </>
        ) : idea.yours ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Check size={14} color={colors.text} strokeWidth={3} />
            <Txt variant="footnote" weight={700}>
              {say.yourVote}
            </Txt>
          </View>
        ) : null}
      </View>
    </Tap>
  );
}

type OutcomeProps = { board: Trip; winner: WhereNextIdeaResponse | null; busy: boolean; onMake: () => void; onOpen: () => void };

/**
 * The box under the ideas: how far the vote is while it is open (and that it stays private), then the
 * winner with the button that makes it a trip, then the way to the trip's own space.
 */
function Outcome({ board, winner, busy, onMake, onOpen }: OutcomeProps) {
  const view = board.view;
  if (!view.closed) {
    const waiting = view.waitingFor.map((person) => person.name ?? '');
    return (
      <NoteBox soft icon={(color) => <Vote size={20} color={color} />} title={say.open.title(view.voted, view.asked)} style={{ marginHorizontal: layout.barGutter }}>
        {say.open.body(view.youVoted, waiting, view.closesOn ? formatWeekday(view.closesOn) : null)}
      </NoteBox>
    );
  }
  if (!winner) {
    return (
      <NoteBox icon={(color) => <Lock size={20} color={color} />} title={say.noWinner.title} style={{ marginHorizontal: layout.barGutter }}>
        {say.noWinner.body}
      </NoteBox>
    );
  }
  const made = view.tripFolderId !== null;
  return (
    <NoteBox
      soft
      icon={(color) => <Route size={20} color={color} />}
      title={say.winner.title(winner.name)}
      style={{ marginHorizontal: layout.barGutter }}
      trailing={made ? <Button label={say.winner.open} variant="soft" size="sm" inline onPress={onOpen} /> : board.canEdit ? <Button label={say.winner.make} spoken={say.winner.makeSpoken(winner.name)} size="sm" inline loading={busy} onPress={onMake} /> : null}>
      {made ? say.winner.made : say.winner.body(view.tied)}
    </NoteBox>
  );
}

/**
 * An idea, pressed. While the vote is open: the facts, and the button that gives it this person's one vote
 * (or takes it back); whoever added it can take it out. After: who voted for it.
 */
function IdeaSheet({ board, idea, onClose }: { board: Trip; idea: WhereNextIdeaResponse | null; onClose: () => void }) {
  const changes = useBoardChanges(board);
  const view = board.view;
  const close = () => {
    changes.forget();
    onClose();
  };
  const then = (done: unknown) => (done ? close() : undefined);
  return (
    <Sheet visible={idea !== null} onClose={close} title={idea?.name} subtitle={idea ? factsOf(idea) || undefined : undefined}>
      {idea ? (
        <View style={{ gap: 12, paddingTop: 6, paddingHorizontal: layout.rowGutter }}>
          {idea.photo ? <Photo uri={idea.photo.url} radius="photo" style={{ height: 180 }} label={say.photoOf(idea.name)} /> : null}
          {idea.note ? <Txt variant="body">{idea.note}</Txt> : null}
          <Txt variant="footnote" color="muted">
            {view.closed ? say.sheet.voters(idea.voters.map((person) => person.name ?? '')) : say.sheet.addedBy(idea.addedBy?.name ?? null, idea.mine)}
          </Txt>
          {changes.problem ? (
            <Txt variant="caption" color="danger" accessibilityLiveRegion="polite">
              {changes.problem}
            </Txt>
          ) : null}
          {view.closed ? null : idea.yours ? (
            <Button label={say.sheet.unvote} variant="soft" size="lg" block loading={changes.busy} onPress={() => void changes.act('unvote').then(then)} />
          ) : (
            <Button label={say.sheet.vote(idea.name)} size="lg" block loading={changes.busy} onPress={() => void changes.act('vote', { ideaId: idea.id }).then(then)} />
          )}
          {!view.closed && !idea.yours ? (
            <Txt variant="footnote" color="muted" center>
              {view.youVoted ? say.sheet.moves : say.sheet.private}
            </Txt>
          ) : null}
          {!view.closed && idea.mine && board.canEdit ? <Button label={say.sheet.remove} variant="soft" size="lg" block onPress={() => void changes.remove(idea.id).then(then)} /> : null}
        </View>
      ) : null}
    </Sheet>
  );
}

/** A new idea: where to, how many days, roughly what it costs each, a line about it and a photo. */
function AddSheet({ board, visible, onClose }: { board: Trip; visible: boolean; onClose: () => void }) {
  return (
    <Sheet visible={visible} onClose={onClose} title={say.add.title} subtitle={say.add.lead}>
      {visible ? <Adding board={board} onClose={onClose} /> : null}
    </Sheet>
  );
}

function Adding({ board, onClose }: { board: Trip; onClose: () => void }) {
  const changes = useBoardChanges(board);
  const clientId = useRef(newClientId());
  const [name, setName] = useState('');
  const [days, setDays] = useState('');
  const [cost, setCost] = useState('');
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<LocalPhoto | null>(null);
  const [tried, setTried] = useState(false);
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const count = days.trim() === '' ? undefined : readCount(days);
  const cents = cost.trim() === '' ? undefined : readCents(cost);
  const daysWrong = count === null || (typeof count === 'number' && (count < 1 || count > 365));

  const add = async () => {
    setTried(true);
    if (daysWrong || cents === null) return;
    setProblem(null);
    setSending(true);
    try {
      // The photo goes up first; the idea is handed what came of it.
      const mediaId = photo ? await uploadPhoto(photo) : undefined;
      if (await changes.add('idea', { name: name.trim(), days: count, costCents: cents, note: note.trim() || undefined, mediaId }, clientId.current)) onClose();
    } catch (error) {
      setProblem(messageFor(error));
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={{ gap: 12, paddingTop: 6, paddingHorizontal: layout.rowGutter }}>
      <Field label={say.add.name} value={name} onChangeText={setName} maxLength={80} autoFocus placeholder={say.add.namePlaceholder} />
      {/* One under the other: two boxes to type in side by side are wider than a narrow phone, and the sheet would slide sideways. */}
      <Field label={say.add.days} value={days} onChangeText={setDays} keyboardType="number-pad" placeholder="4" error={tried && daysWrong ? say.add.daysProblem : null} />
      <Field label={say.add.cost} value={cost} onChangeText={setCost} keyboardType="decimal-pad" placeholder="310" error={tried && cents === null ? say.add.costProblem : null} />
      <Field label={say.add.note} value={note} onChangeText={setNote} maxLength={200} placeholder={say.add.notePlaceholder} />
      {photo ? <Photo uri={photo.uri} radius="photo" style={{ height: 150 }} label={say.add.photoChosen} /> : null}
      <Button
        label={photo ? say.add.changePhoto : say.add.choosePhoto}
        variant="soft"
        block
        icon={(color) => <ImagePlus size={18} color={color} />}
        onPress={() =>
          void pickPhoto()
            .then((picked) => (picked ? setPhoto(picked) : undefined))
            .catch(() => setProblem(words.media.photosClosed))
        }
      />
      {problem || changes.problem ? (
        <Txt variant="caption" color="danger" accessibilityLiveRegion="polite">
          {problem ?? changes.problem}
        </Txt>
      ) : null}
      <Button label={say.add.save} size="lg" block disabled={!name.trim()} loading={sending || changes.busy} onPress={() => void add()} />
    </View>
  );
}

/** When the trip would be, in the crew's words, and the last day to vote, when there is one. While the vote is open. */
function WhenSheet({ board, visible, onClose }: { board: Trip; visible: boolean; onClose: () => void }) {
  return (
    <Sheet visible={visible} onClose={onClose} title={say.when.title} subtitle={say.when.lead}>
      {visible ? <Deciding board={board} onClose={onClose} /> : null}
    </Sheet>
  );
}

function Deciding({ board, onClose }: { board: Trip; onClose: () => void }) {
  const changes = useBoardChanges(board);
  const [when, setWhen] = useState(board.view.when ?? '');
  const [closesOn, setClosesOn] = useState<string | null>(board.view.closesOn);
  const [picking, setPicking] = useState(false);
  return (
    <View style={{ gap: 12, paddingTop: 6, paddingHorizontal: layout.rowGutter }}>
      <Field label={say.when.label} value={when} onChangeText={setWhen} maxLength={60} placeholder={say.when.placeholder} />
      <View style={{ flexDirection: 'row' }}>
        <FieldButton label={say.when.closesOn} value={closesOn ? formatWeekday(closesOn) : say.when.untilEveryone} onPress={() => setPicking(true)} />
      </View>
      {closesOn ? <Button label={say.when.noLastDay} variant="quiet" size="sm" onPress={() => setClosesOn(null)} /> : null}
      {changes.problem ? (
        <Txt variant="caption" color="danger" accessibilityLiveRegion="polite">
          {changes.problem}
        </Txt>
      ) : null}
      <Button label={say.when.save} size="lg" block loading={changes.busy} onPress={() => void changes.set({ when: when.trim() || null, closesOn }).then((saved) => (saved ? onClose() : undefined))} />
      <DayPicker visible={picking} onClose={() => setPicking(false)} title={say.when.closesOn} value={closesOn ?? addDays(today(), 7)} min={today()} onChange={setClosesOn} />
    </View>
  );
}

import { Check, Heart, History, ImagePlus, Undo2 } from 'lucide-react-native';
import { type ReactNode, useState } from 'react';
import { View } from 'react-native';

import { messageFor } from '@/api/fetcher';
import type { SecretMissionsMissionResponse, SecretMissionsResponse, SecretMissionsSettings } from '@/api/generated/homeport';
import { useCircles } from '@/features/circles/current';
import { BoardFrame, type MenuRow } from '@/features/templates/BoardFrame';
import { type LocalPhoto, pickPhoto, uploadPhoto } from '@/features/templates/media';
import type { Board, BoardScreenProps } from '@/features/templates/types';
import { useBoardChanges, useBoardPart } from '@/features/templates/useBoard';
import { addDays, formatRange, formatWeekdayLong } from '@/lib/dates';
import { layout, radius, useTheme, withAlpha } from '@/theme';
import { Avatar } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { Field } from '@/ui/Field';
import { Tap } from '@/ui/Motion';
import { Photo } from '@/ui/Photo';
import { rich } from '@/ui/rich';
import { Sheet } from '@/ui/Sheet';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

import { Label, standsInFor } from '../parts';

type Missions = Board<SecretMissionsResponse, SecretMissionsSettings>;
type Mission = SecretMissionsMissionResponse;
const say = words.perks.secretMissions;

/** Who did it and who it was for, as the row names them: the person looking is "You" and "you". */
const doerOf = (mission: Mission) => (mission.yours ? say.you : (mission.doer?.name ?? ''));
const targetOf = (mission: Mission) => (mission.forYou ? say.youTarget : (mission.target?.name ?? ''));

/**
 * 16.3 Secret missions. Every Monday each person gets one small kindness to do for someone else in the
 * circle. During the week the API hands a mission to its own person only (and a child's to the parent who
 * reads it to them), so this page never holds anyone else's: the card on top is yours, with Done and "A
 * different one". On Sunday what was done is revealed for everyone, and that is the list below; the one it
 * was for can give it a heart, and a line can be added under it.
 */
export function SecretMissions({ board: opened }: BoardScreenProps<SecretMissionsResponse, SecretMissionsSettings>) {
  /** A day of an earlier week whose missions are being looked at, in place of the last week revealed. */
  const [week, setWeek] = useState<string | undefined>(undefined);
  const { board, problem: partProblem } = useBoardPart(opened, week);
  const view = board.view;
  const [openId, setOpenId] = useState<string | null>(null);
  /** Whose mission is being ticked (by member id), while the sheet that asks what was done is up. */
  const [tellingFor, setTellingFor] = useState<string | null>(null);
  const telling = view.yours.find((one) => one.doer?.memberId === tellingFor) ?? null;
  const shownWeek = view.revealedWeekStart;
  const looked = view.revealed.find((one) => one.id !== null && one.id === openId) ?? null;
  const before = addDays(week ?? shownWeek ?? addDays(view.weekStart, -7), -7);

  const menu: MenuRow[] = [
    { icon: (color) => <History size={20} color={color} />, label: say.menu.before, onPress: () => setWeek(before) },
    ...(week ? [{ icon: (color: string) => <Undo2 size={20} color={color} />, label: say.menu.latest, onPress: () => setWeek(undefined) }] : []),
  ];
  const label = week ? say.revealed.week(formatRange(week, addDays(week, 6))) : shownWeek === view.weekStart ? say.revealed.thisWeek : say.revealed.last;

  return (
    <BoardFrame board={board} title={board.title} chip="menu" menu={menu} problem={partProblem}>
      {view.yours.length ? (
        <View style={{ gap: 10 }}>
          {view.yours.map((mission) => (
            <MissionCard key={mission.doer?.memberId ?? mission.text} board={board} mission={mission} onDone={() => setTellingFor(mission.doer?.memberId ?? null)} />
          ))}
        </View>
      ) : (
        <Quiet title={say.none.title} body={say.none.body} />
      )}

      <Label>{label}</Label>
      {view.revealed.length === 0 ? (
        <Txt variant="callout" color="muted" style={{ marginHorizontal: layout.gutter }}>
          {week ? say.revealed.noneThen : say.revealed.none}
        </Txt>
      ) : (
        view.revealed.map((mission) => <RevealedRow key={mission.id ?? mission.text} board={board} mission={mission} onOpen={() => setOpenId(mission.id)} />)
      )}
      <MissionSheet board={board} mission={looked} onClose={() => setOpenId(null)} />
      <TellSheet board={board} mission={telling} onClose={() => setTellingFor(null)} />
    </BoardFrame>
  );
}

/** A soft box that says there is nothing to do this week. */
function Quiet({ title, body }: { title: string; body: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 4, marginTop: 4, marginHorizontal: layout.barGutter, padding: 18, borderRadius: radius.panel, backgroundColor: colors.fill }}>
      <Txt variant="subheading">{title}</Txt>
      <Txt variant="callout" color="muted">
        {body}
      </Txt>
    </View>
  );
}

/** A button on the mission's card: dark on the accent colour, or a shade of the card itself for the quieter one. */
function CardButton({ label, icon, soft, busy, onPress }: { label: string; icon?: (color: string) => ReactNode; soft?: boolean; busy?: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  const fg = soft ? colors.onAccent : colors.accent;
  return (
    <Tap accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!busy }} disabled={busy} hitSlop={4} onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 36, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: soft ? withAlpha(colors.black, 0.1) : colors.onAccent, opacity: busy ? 0.6 : 1 }}>
      {icon?.(fg)}
      <Txt variant="callout" weight={700} numberOfLines={1} style={{ color: fg }}>
        {label}
      </Txt>
    </Tap>
  );
}

/**
 * This week's mission of the person looking, or of a child they read it to. Done asks what was done, in
 * their own words (that is what everyone reads on Sunday); "A different one" deals another for the same
 * person. Until Sunday a tick can be taken back.
 */
function MissionCard({ board, mission, onDone }: { board: Missions; mission: Mission; onDone: () => void }) {
  const { colors } = useTheme();
  const changes = useBoardChanges(board);
  const view = board.view;
  const doer = mission.doer?.name ?? '';
  const target = mission.target?.name ?? '';
  const memberId = mission.doer?.memberId;
  const reveals = formatWeekdayLong(view.revealsOn);
  return (
    <View style={{ gap: 6, marginTop: 4, marginHorizontal: layout.barGutter, padding: 18, borderRadius: radius.panel, backgroundColor: colors.accent }}>
      <Txt variant="label" numberOfLines={1} style={{ color: colors.onAccent, opacity: 0.7 }}>
        {mission.yours ? say.eyebrow(view.week) : say.eyebrowFor(view.week, doer)}
      </Txt>
      <Txt variant="title" accessibilityRole="header" style={{ color: colors.onAccent }}>
        {mission.text}
      </Txt>
      <Txt variant="caption" weight={500} style={{ color: colors.onAccent, opacity: 0.8 }}>
        {mission.done ? say.doneLine(reveals) : mission.yours ? say.yours(target) : say.theirs(doer, target)}
      </Txt>
      {changes.problem ? (
        <Txt variant="caption" weight={700} accessibilityLiveRegion="polite" style={{ color: colors.onAccent }}>
          {changes.problem}
        </Txt>
      ) : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
        {mission.done ? (
          <CardButton soft label={say.notDone} busy={changes.busy} onPress={() => void changes.act('done', { memberId, done: false })} />
        ) : (
          <>
            <CardButton label={say.done} icon={(color) => <Check size={17} color={color} strokeWidth={2.6} />} busy={changes.busy} onPress={onDone} />
            <CardButton soft label={say.another} busy={changes.busy} onPress={() => void changes.act('another', { memberId })} />
          </>
        )}
      </View>
    </View>
  );
}

/** Done: what was done, in a few words of their own, and a photo of it if there is one. Neither is needed. */
function TellSheet({ board, mission, onClose }: { board: Missions; mission: Mission | null; onClose: () => void }) {
  return (
    <Sheet visible={mission !== null} onClose={onClose} title={say.tell.title} subtitle={say.tell.lead(formatWeekdayLong(board.view.revealsOn))}>
      {mission ? <Tell key={mission.doer?.memberId} board={board} mission={mission} onClose={onClose} /> : null}
    </Sheet>
  );
}

function Tell({ board, mission, onClose }: { board: Missions; mission: Mission; onClose: () => void }) {
  const changes = useBoardChanges(board);
  const [did, setDid] = useState(mission.did ?? '');
  const [photo, setPhoto] = useState<LocalPhoto | null>(null);
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const done = async () => {
    setProblem(null);
    setSending(true);
    try {
      const mediaId = photo ? await uploadPhoto(photo) : undefined;
      if (await changes.act('done', { memberId: mission.doer?.memberId, did: did.trim() || undefined, mediaId })) onClose();
    } catch (error) {
      setProblem(messageFor(error));
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={{ gap: 12, paddingTop: 6, paddingHorizontal: layout.rowGutter }}>
      <Field label={say.tell.did} value={did} onChangeText={setDid} maxLength={300} autoFocus autoCapitalize="none" placeholder={say.tell.didPlaceholder} error={problem ?? changes.problem} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Button
          label={photo ? say.tell.changePhoto : say.tell.addPhoto}
          variant="soft"
          size="sm"
          inline
          icon={(color) => <ImagePlus size={16} color={color} />}
          onPress={() =>
            void pickPhoto()
              .then((picked) => (picked ? setPhoto(picked) : undefined))
              .catch(() => setProblem(words.media.photosClosed))
          }
        />
        {photo ? <Photo uri={photo.uri} radius="chip" style={{ width: 36, height: 36 }} label={say.tell.photoChosen} /> : null}
      </View>
      <Button label={say.done} size="lg" block loading={sending || changes.busy} icon={(color) => <Check size={19} color={color} strokeWidth={2.6} />} onPress={() => void done()} />
    </View>
  );
}

/** One mission that was revealed: who did what for whom, the line added under it, and its photo or its heart. */
function RevealedRow({ board, mission, onOpen }: { board: Missions; mission: Mission; onOpen: () => void }) {
  const { colors } = useTheme();
  const changes = useBoardChanges(board);
  const sentence = mission.did ? say.row(doerOf(mission), targetOf(mission), mission.did) : say.rowPlain(doerOf(mission), targetOf(mission));
  const under = mission.did ? mission.reply : (mission.reply ?? mission.text);
  const spoken = words.common.spoken([sentence.map((part) => (typeof part === 'string' ? part : part.text)).join(''), under]);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 11, paddingHorizontal: layout.rowGutter }}>
      <Tap accessibilityRole="button" accessibilityLabel={spoken} scaleTo={0.99} onPress={onOpen} style={{ flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        <Avatar uri={mission.doer?.avatarUrl} name={mission.doer?.name ?? ''} size={44} />
        <View style={{ flex: 1 }}>
          <Txt variant="callout">
            {rich(sentence, {
              bold: (text) => (
                <Txt variant="callout" weight={800}>
                  {text}
                </Txt>
              ),
            })}
          </Txt>
          {under ? (
            <Txt variant="footnote" color="muted" style={{ marginTop: 3 }}>
              {under}
            </Txt>
          ) : null}
        </View>
        {mission.photo ? <Photo uri={mission.photo.thumbUrl ?? mission.photo.url} radius="tile" style={{ width: 48, height: 48 }} label={say.photoOf(mission.doer?.name ?? '')} /> : null}
      </Tap>
      {mission.forYou && mission.id ? (
        <Tap
          accessibilityRole="checkbox"
          accessibilityLabel={say.heart}
          aria-checked={mission.liked}
          disabled={changes.busy}
          hitSlop={12}
          scaleTo={0.85}
          onPress={() => void changes.act('like', { entryId: mission.id, liked: !mission.liked })}
          style={{ alignSelf: 'center' }}>
          <Heart size={20} color={mission.liked ? colors.like : colors.muted} fill={mission.liked ? colors.like : 'transparent'} />
        </Tap>
      ) : mission.liked ? (
        <View accessible accessibilityLabel={say.hearted(mission.target?.name ?? '')} style={{ alignSelf: 'center' }}>
          <Heart size={20} color={colors.like} fill={colors.like} />
        </View>
      ) : null}
    </View>
  );
}

/**
 * A revealed mission, pressed: what the mission was, what was done, its photo. The one it was for (or a
 * parent, for a child or the dog) gives it a heart; they and the one who did it can add a line under it.
 */
function MissionSheet({ board, mission, onClose }: { board: Missions; mission: Mission | null; onClose: () => void }) {
  return (
    <Sheet visible={mission !== null} onClose={onClose} title={mission ? say.sheet.title(doerOf(mission), targetOf(mission)) : undefined} subtitle={mission ? say.sheet.was(mission.text) : undefined}>
      {mission ? <Looked key={mission.id} board={board} mission={mission} /> : null}
    </Sheet>
  );
}

function Looked({ board, mission }: { board: Missions; mission: Mission }) {
  const changes = useBoardChanges(board);
  const circle = useCircles().find((one) => one.id === board.circleId);
  const [reply, setReply] = useState(mission.reply ?? '');
  const forThem = mission.forYou || standsInFor(circle, mission.target?.memberId);
  const mayReply = forThem || mission.yours || standsInFor(circle, mission.doer?.memberId);
  const target = mission.target?.name ?? '';
  return (
    <View style={{ gap: 12, paddingTop: 6, paddingHorizontal: layout.rowGutter }}>
      {mission.photo ? <Photo uri={mission.photo.url} radius="photo" style={{ height: 220 }} label={say.photoOf(mission.doer?.name ?? '')} /> : null}
      {mission.did ? <Txt variant="bodyLarge">{say.sheet.did(doerOf(mission), mission.did)}</Txt> : null}
      {forThem && mission.id ? (
        <Button
          label={mission.liked ? say.sheet.unlike : mission.forYou ? say.sheet.like : say.sheet.likeFor(target)}
          variant="soft"
          block
          loading={changes.busy}
          icon={(color) => <Heart size={17} color={color} />}
          onPress={() => void changes.act('like', { entryId: mission.id, liked: !mission.liked })}
        />
      ) : null}
      {mayReply && mission.id ? (
        <>
          <Field label={say.sheet.reply} value={reply} onChangeText={setReply} maxLength={200} placeholder={say.sheet.replyPlaceholder} error={changes.problem} />
          <Button label={say.sheet.keep} size="lg" block disabled={reply.trim() === (mission.reply ?? '') || changes.busy} onPress={() => void changes.act('reply', { entryId: mission.id, text: reply.trim() })} />
        </>
      ) : mission.reply ? (
        <Txt variant="callout" color="muted">
          {mission.reply}
        </Txt>
      ) : null}
    </View>
  );
}

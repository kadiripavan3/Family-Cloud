import { useMutation } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Camera, Ellipsis, FolderOpen, Heart, Play, Trash2, Video, X } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCache } from '@/api/cache';
import { messageFor } from '@/api/fetcher';
import { deleteThing, type GoodnightResponse, loveGoodnight, unloveGoodnight, useGetGoodnight } from '@/api/generated/homeport';
import { useCircleIfAny, useCircles } from '@/features/circles/current';
import { chooseClip, type Clip, recordClip } from '@/features/journeyLink/goodnight/pickClip';
import { sendBack } from '@/features/journeyLink/goodnight/send';
import { HeartsSheet, withoutAPhone } from '@/features/journeyLink/parts';
import { openFile } from '@/features/library/save';
import { formatDuration } from '@/features/library/sizes';
import { useToast } from '@/features/library/Toast';
import { useLeave } from '@/features/navigation/useLeave';
import { NotFound } from '@/features/states/NotFound';
import { PageProblem } from '@/features/states/PageProblem';
import { looksLikeId, thingHref } from '@/features/things/open';
import { formatClock } from '@/lib/dates';
import { newClientId } from '@/lib/ids';
import { loadState } from '@/lib/loading';
import { firstName } from '@/lib/names';
import { AlwaysDark, radius, useTheme, withAlpha } from '@/theme';
import { Avatar } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { ConfirmSheet } from '@/ui/ConfirmSheet';
import { Frost } from '@/ui/Frost';
import { LightStatusBar } from '@/ui/LightStatusBar';
import { Loading } from '@/ui/Loading';
import { Tap } from '@/ui/Motion';
import { Photo } from '@/ui/Photo';
import { RoundButton } from '@/ui/RoundButton';
import { Sheet, SheetRow } from '@/ui/Sheet';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

type Asking = 'back' | 'hearts' | 'menu' | 'delete' | null;

/**
 * 10.9 Goodnight from far away: a clip someone on a journey recorded for the children's bedtime. It went to
 * the circle only and is no part of the journey other people see. Who sent it and from where, the clip to
 * play, a heart (the child's own, in a home with children), and "Send one back": a clip in answer, recorded
 * with the phone or picked from its videos (a picked file in a browser). `/goodnight/<id>`, where a thing of
 * the kind `goodnight` opens from Today and every list.
 */
export default function Goodnight() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isThing = looksLikeId(id);
  const asked = useGetGoodnight(id, { query: { enabled: isThing } });
  const load = loadState(asked);
  const goodnight = asked.data;
  if (!isThing) return <NotFound />;
  return (
    // The whole screen lies on a picture: it is drawn dark whatever the phone is set to.
    <AlwaysDark>
      <Stack.Screen options={{ animation: 'fade' }} />
      {goodnight ? <Shown goodnight={goodnight} /> : <Waiting error={load.error} retry={load.retry} retrying={load.retrying} offline={load.offline} />}
    </AlwaysDark>
  );
}

function Waiting({ error, retry, retrying, offline }: { error: unknown; retry: () => void; retrying: boolean; offline: boolean }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const leave = useLeave();
  return (
    <View style={{ flex: 1, backgroundColor: colors.stage }}>
      <LightStatusBar />
      <View style={{ alignItems: 'flex-end', paddingTop: insets.top + 12, paddingHorizontal: 16 }}>
        <RoundButton tone="photo" label={words.common.close} onPress={leave} icon={(c) => <X size={20} color={c} />} />
      </View>
      {error ? <PageProblem error={error} onRetry={retry} retrying={retrying} tone="onPhoto" /> : <Loading offline={offline} tone="onPhoto" />}
    </View>
  );
}

function Shown({ goodnight }: { goodnight: GoodnightResponse }) {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const leave = useLeave();
  const cache = useCache();
  const circles = useCircles();
  const current = useCircleIfAny();
  const circle = circles.find((one) => one.id === goodnight.circleId) ?? current;
  const says = words.together.goodnight;
  const [asking, setAsking] = useState<Asking>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const { say, toast } = useToast(insets.bottom + 150);
  const clientId = useRef(newClientId());
  const close = () => setAsking(null);

  const from = goodnight.from;
  const seconds = goodnight.clip.durationSeconds;
  const title = goodnight.title.trim() || says.untitled;
  // Who gave a heart, the person's own said as "You": the API names them among the others too.
  const lovers = goodnight.lovedBy.filter((person) => person.memberId !== circle?.myMemberId).map((person) => firstName(person.name));
  const lovedLine = says.lovedBy(lovers, goodnight.loved);

  const play = async () => {
    const file = goodnight.clip.fileUrl;
    if (!file || !(await openFile(file))) say(says.cantPlay);
  };
  const heart = useMutation({
    mutationFn: ({ as, loved }: { as: string | null; loved: boolean }) => (loved ? loveGoodnight : unloveGoodnight)(goodnight.id, as ? { as } : undefined),
    onSuccess: (changed) => cache.goodnightLoved(changed),
    onError: (error) => say(messageFor(error)),
  });
  const back = useMutation({
    mutationFn: (clip: Clip) => sendBack(clip, goodnight, says.back.titleOf(firstName(from?.name) || says.untitled), clientId.current, setProgress),
    onSuccess: async (sent) => {
      clientId.current = newClientId();
      await cache.goodnightSent(sent);
      say(says.back.sent);
    },
    onError: (error) => say(messageFor(error)),
    onSettled: () => setProgress(null),
  });
  const remove = useMutation({
    mutationFn: () => deleteThing(goodnight.id),
    onSuccess: () => {
      close();
      leave();
      void cache.goodnightDeleted(goodnight);
    },
  });
  /** A clip from the camera or from the phone's videos, then on its way. */
  const pick = async (how: 'record' | 'choose') => {
    close();
    const clip = how === 'record' ? await recordClip() : await chooseClip();
    if (clip === 'unavailable') return say(says.back.needsPhone);
    if (clip) back.mutate(clip);
  };
  const pressHeart = () => (withoutAPhone(circle).length ? setAsking('hearts') : heart.mutate({ as: null, loved: !goodnight.loved }));
  const latestReply = goodnight.replies[goodnight.replies.length - 1];

  return (
    <View style={{ flex: 1, backgroundColor: colors.stage }}>
      <LightStatusBar />
      <Photo uri={goodnight.posterUrl} radius="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.stage }} />
      <LinearGradient pointerEvents="none" colors={[withAlpha(colors.black, 0.5), withAlpha(colors.black, 0), withAlpha(colors.black, 0), withAlpha(colors.black, 0.85)]} locations={[0, 0.22, 0.5, 1]} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />

      <View style={{ position: 'absolute', top: insets.top + 12, left: 16, right: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1, paddingVertical: 5, paddingLeft: 5, paddingRight: 16, borderRadius: radius.pill, overflow: 'hidden', backgroundColor: colors.photoGlass, borderWidth: 1, borderColor: colors.photoGlassLine }}>
          <Frost tone="dark" />
          <Avatar uri={from?.avatarUrl} name={from?.name ?? ''} size={38} />
          <View style={{ flexShrink: 1 }}>
            <Txt variant="callout" weight={800} numberOfLines={1} style={{ color: colors.onPhoto }}>
              {from?.name ?? title}
            </Txt>
            <Txt variant="tiny" weight={500} numberOfLines={1} style={{ color: colors.onPhoto, opacity: 0.86 }}>
              {words.common.join([goodnight.dayLabel, goodnight.place])}
            </Txt>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {goodnight.mine ? <RoundButton tone="photo" label={words.things.more} onPress={() => setAsking('menu')} icon={(c) => <Ellipsis size={20} color={c} />} /> : null}
          <RoundButton tone="photo" label={words.common.close} onPress={leave} icon={(c) => <X size={20} color={c} />} />
        </View>
      </View>

      <View pointerEvents="box-none" style={{ position: 'absolute', top: '44%', left: 0, right: 0, alignItems: 'center', marginTop: -42 }}>
        <Tap accessibilityRole="button" accessibilityLabel={says.play} onPress={() => void play()} scaleTo={0.94} style={{ width: 84, height: 84, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: colors.photoGlass, borderWidth: 1, borderColor: colors.photoGlassLine }}>
          <Frost tone="dark" />
          <Play size={32} color={colors.onPhoto} fill={colors.onPhoto} style={{ marginLeft: 5 }} />
        </Tap>
        <Txt variant="small" weight={700} style={{ marginTop: 14, color: colors.onPhoto, opacity: 0.8 }}>
          {says.hint(seconds ? formatDuration(seconds) : null)}
        </Txt>
      </View>

      <View style={{ position: 'absolute', left: 18, right: 18, bottom: Math.max(insets.bottom, 12) + 22 }}>
        <View style={{ alignSelf: 'flex-start', paddingVertical: 4, paddingHorizontal: 10, borderRadius: radius.chip, backgroundColor: colors.accent }}>
          <Txt variant="label" style={{ color: colors.onAccent }}>
            {says.only(goodnight.circleName)}
          </Txt>
        </View>
        <Txt variant="titleLarge" accessibilityRole="header" style={{ maxWidth: 290, marginTop: 10, color: colors.onPhoto }}>
          {title}
        </Txt>
        <Txt variant="callout" style={{ maxWidth: 290, marginTop: 8, color: colors.onPhoto, opacity: 0.86 }}>
          {says.about(formatClock(goodnight.recordedLocal), goodnight.place, !!goodnight.replyTo)}
        </Txt>
        {goodnight.replyTo || latestReply ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 10 }}>
            {goodnight.replyTo ? <Link label={says.answers} onPress={() => router.push(thingHref({ kind: 'goodnight', id: goodnight.replyTo }))} /> : null}
            {latestReply ? <Link label={says.replies(goodnight.replies.length)} onPress={() => router.push(thingHref({ kind: 'goodnight', id: latestReply }))} /> : null}
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
          {back.isPending ? (
            <View accessibilityLiveRegion="polite" style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 46 }}>
              <ActivityIndicator color={colors.onPhoto} />
              <Txt variant="callout" weight={700} style={{ color: colors.onPhoto }}>
                {says.back.sendingAt(progress === null ? null : Math.round(progress * 100))}
              </Txt>
            </View>
          ) : (
            <Button label={says.sendBack} variant="glass" style={{ flex: 1, paddingHorizontal: 12 }} icon={(c) => <Video size={17} color={c} />} onPress={() => setAsking('back')} />
          )}
          <Button
            label={says.lovedByShort(lovers, goodnight.loved) ?? says.love}
            spoken={lovedLine ? words.together.atHome.lovedSpoken(lovedLine) : says.love}
            variant="glass"
            style={{ flex: 1, paddingHorizontal: 12 }}
            // The heart is filled once it is the person's own; someone else's is said in words.
            icon={(c) => <Heart size={17} color={goodnight.loved ? colors.like : c} fill={goodnight.loved ? colors.like : 'transparent'} />}
            disabled={heart.isPending}
            onPress={pressHeart}
          />
        </View>
      </View>
      {toast}

      <Sheet visible={asking === 'back'} onClose={close} title={says.back.title} subtitle={says.back.lead(goodnight.circleName)}>
        <SheetRow first icon={(c) => <Camera size={22} color={c} />} label={says.back.record} note={says.back.recordNote} onPress={() => void pick('record')} />
        <SheetRow icon={(c) => <FolderOpen size={22} color={c} />} label={says.back.choose} note={says.back.chooseNote} onPress={() => void pick('choose')} />
      </Sheet>
      <HeartsSheet visible={asking === 'hearts'} onClose={close} circle={circle} lovedBy={goodnight.lovedBy} loved={goodnight.loved} busy={heart.isPending} onChange={(as, loved) => heart.mutate({ as, loved })} />
      <Sheet visible={asking === 'menu'} onClose={close} title={title}>
        <SheetRow first danger icon={(c) => <Trash2 size={22} color={c} />} label={says.menu.delete} onPress={() => setAsking('delete')} />
      </Sheet>
      <ConfirmSheet visible={asking === 'delete'} onClose={close} title={says.deleteAsk.title} body={says.deleteAsk.body} confirm={says.deleteAsk.confirm} busy={remove.isPending} problem={remove.isError ? messageFor(remove.error) : null} onConfirm={() => remove.mutate()} />
    </View>
  );
}

/** A quiet underlined line on the picture that leads to another goodnight: the one this answers, or what was sent back. */
function Link({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Tap accessibilityRole="button" accessibilityLabel={label} hitSlop={10} onPress={onPress}>
      <Txt variant="caption" weight={700} style={{ color: colors.onPhoto, textDecorationLine: 'underline' }}>
        {label}
      </Txt>
    </Tap>
  );
}

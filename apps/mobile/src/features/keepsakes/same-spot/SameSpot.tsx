import { Image as ImageIcon, Layers, Pause, Play, RefreshCw, X } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, View } from 'react-native';

import { messageFor } from '@/api/fetcher';
import type { SameSpotSettings, SameSpotShot, SameSpotView } from '@/api/generated/homeport';
import { useLeave } from '@/features/navigation/useLeave';
import { BoardFrame, BoardMore } from '@/features/templates/BoardFrame';
import { type LocalPhoto, pickPhoto, uploadPhoto } from '@/features/templates/media';
import { Notice } from '@/features/templates/parts/Notice';
import type { BoardScreenProps } from '@/features/templates/types';
import { useBoardChanges } from '@/features/templates/useBoard';
import { newClientId } from '@/lib/ids';
import { darkTheme, layout, radius } from '@/theme';
import { Frost } from '@/ui/Frost';
import { Tap } from '@/ui/Motion';
import { Photo } from '@/ui/Photo';
import { RoundButton } from '@/ui/RoundButton';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

const say = words.keepsakes.sameSpot;
const colors = darkTheme.colors;
/** How long each year stays up while the strip plays. */
const STEP_MS = 900;

/**
 * 15.4 Same spot, every year. One photo a year, lined up with the last: a faint copy of last year's lies
 * over this year's so everyone stands where they stood. On a phone that is the camera; in a browser a
 * picked photo stands in, with last year's laid over it the same way. The strip under it holds every year;
 * a year shows its photo, and Play runs through them so the door stays still and the children grow.
 */
export function SameSpot({ board }: BoardScreenProps<SameSpotView, SameSpotSettings>) {
  const leave = useLeave();
  const view = board.view;
  const changes = useBoardChanges(board);
  const clientId = useRef(newClientId());
  const thisYears = view.years.find((shot) => shot.year === view.thisYear) ?? null;

  /** The photo picked for this year, before it is kept. */
  const [picked, setPicked] = useState<LocalPhoto | null>(null);
  /** The year whose photo is shown in place of the camera. */
  const [looking, setLooking] = useState<number | null>(null);
  /** While the strip plays: which year of it is up, counted from the first. */
  const [playAt, setPlayAt] = useState<number | null>(null);
  const playing = playAt !== null;
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Playing the strip: each year stays up for a moment, then the next; after the last it is over.
  const years = view.years.length;
  useEffect(() => {
    if (playAt === null) return;
    const timer = setTimeout(() => setPlayAt(playAt + 1 < years ? playAt + 1 : null), STEP_MS);
    return () => clearTimeout(timer);
  }, [playAt, years]);

  /** Runs through the years from the first, or stops. When it is over, this year's place is back. */
  const play = () => {
    if (years < 2) return setNotice(say.playNote);
    setLooking(null);
    setPlayAt(playing ? null : 0);
  };

  /** Shows one year in place of the camera, or the camera again. Whatever was playing stops. */
  const look = (year: number | null) => {
    setPlayAt(null);
    setLooking(year);
  };

  const choose = async () => {
    setProblem(null);
    try {
      const photo = await pickPhoto();
      if (photo) {
        look(null);
        setPicked(photo);
      }
    } catch {
      setProblem(words.media.photosClosed);
    }
  };

  /** Keeps the picked photo as this year's: a new one, or in place of the one that was taken already. */
  const keep = async () => {
    if (!picked) return void choose();
    setProblem(null);
    setSending(true);
    try {
      const mediaId = await uploadPhoto(picked);
      const kept = thisYears ? await changes.change(thisYears.id, { mediaId }) : await changes.add('photo', { mediaId }, clientId.current);
      if (kept) {
        clientId.current = newClientId();
        setPicked(null);
      }
    } catch (error) {
      setProblem(messageFor(error));
    } finally {
      setSending(false);
    }
  };

  const shownYear = playAt !== null ? (view.years[playAt]?.year ?? null) : looking;
  const shown: SameSpotShot | null = shownYear === null ? null : (view.years.find((shot) => shot.year === shownYear) ?? null);
  // What lies faintly on top: last year's, while this year's is being lined up.
  const ghost = shown ? null : view.last;
  const under = shown ? shown.photo.url : picked ? picked.uri : thisYears ? thisYears.photo.url : null;
  const hint = shown ? say.yearOf(shown.year) : picked ? (ghost ? say.lineUp : say.firstOne) : thisYears ? say.taken(view.thisYear) : ghost ? say.lineUp : say.firstOne;

  return (
    <BoardFrame board={board} tone="stage" scroll={false} problem={problem ?? changes.problem}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 56, paddingHorizontal: layout.barGutter }}>
        <RoundButton label={words.common.close} tone="photo" onPress={leave} icon={(color) => <X size={20} color={color} />} />
        <View style={{ flexShrink: 1, paddingVertical: 9, paddingHorizontal: 14, borderRadius: radius.photo, overflow: 'hidden', backgroundColor: colors.photoGlass, borderWidth: 1, borderColor: colors.photoGlassLine }}>
          <Frost tone="dark" />
          <Txt variant="caption" weight={700} numberOfLines={1} accessibilityRole="header" style={{ color: colors.onPhoto }}>
            {say.counter(board.title, shown?.year ?? view.thisYear)}
          </Txt>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <RoundButton label={say.flip} tone="photo" onPress={() => setNotice(say.cameraNote)} icon={(color) => <RefreshCw size={20} color={color} />} />
          <BoardMore board={board} tone="photo" />
        </View>
      </View>

      <View style={{ flex: 1, minHeight: 260, marginTop: 8, backgroundColor: colors.stage }}>
        {under ? <Photo uri={under} radius="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} label={shown ? say.photoOf(shown.year) : picked ? say.picked : say.photoOf(view.thisYear)} /> : null}
        {ghost ? <Photo uri={ghost.photo.url} radius="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: under ? 0.34 : 0.5, backgroundColor: 'transparent' }} label={say.ghost(ghost.year)} /> : null}
        {!under && Platform.OS === 'web' ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 }}>
            <Txt variant="callout" weight={700} center style={{ color: colors.onPhoto }}>
              {say.browser}
            </Txt>
          </View>
        ) : null}
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 14, alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 8, paddingHorizontal: 14, borderRadius: radius.photo, overflow: 'hidden', backgroundColor: colors.photoGlass, borderWidth: 1, borderColor: colors.photoGlassLine }}>
            <Frost tone="dark" />
            <Layers size={15} color={colors.onPhoto} />
            <Txt variant="caption" weight={700} accessibilityLiveRegion="polite" style={{ color: colors.onPhoto }}>
              {hint}
            </Txt>
          </View>
        </View>
      </View>

      <View style={{ marginTop: 18 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', gap: 10, paddingHorizontal: layout.barGutter }}>
          {view.years.filter((shot) => shot.year !== view.thisYear).map((shot) => (
            <Year key={shot.id} year={shot.year} uri={shot.photo.thumbUrl ?? shot.photo.url} on={shownYear === shot.year} onPress={() => look(shownYear === shot.year ? null : shot.year)} />
          ))}
          <Year year={view.thisYear} uri={thisYears ? (thisYears.photo.thumbUrl ?? thisYears.photo.url) : (picked?.uri ?? null)} on={shownYear === null} now onPress={() => look(null)} />
        </ScrollView>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 44, paddingTop: 22, paddingBottom: 18 }}>
        <RoundButton label={say.choose} tone="photo" onPress={() => void choose()} icon={(color) => <ImageIcon size={20} color={color} />} />
        <Tap
          accessibilityRole="button"
          accessibilityLabel={picked ? say.keep(view.thisYear) : thisYears ? say.retake : say.take}
          disabled={sending || !board.canEdit}
          scaleTo={0.92}
          onPress={() => void keep()}
          style={{ width: 86, height: 86, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: colors.accent }}>
          <View style={{ width: 72, height: 72, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white }}>{sending ? <ActivityIndicator color={colors.black} /> : null}</View>
        </Tap>
        <RoundButton
          label={playing ? say.stop : say.play}
          tone="photo"
          onPress={play}
          icon={(color) => (playing ? <Pause size={20} color={color} /> : <Play size={20} color={color} />)}
        />
      </View>
      <Notice text={notice} onClose={() => setNotice(null)} />
    </BoardFrame>
  );
}

/** One year in the strip: its photo small, and the year under it. This year's is ringed in the accent colour. */
function Year({ year, uri, on, now, onPress }: { year: number; uri: string | null; on: boolean; now?: boolean; onPress: () => void }) {
  return (
    <Tap accessibilityRole="button" accessibilityLabel={now ? say.thisYear(year) : say.showYear(year)} aria-selected={on} scaleTo={0.94} onPress={onPress} style={{ alignItems: 'center', gap: 5, opacity: on || now ? 1 : 0.7 }}>
      <Photo uri={uri} radius="tile" style={{ width: 56, height: 72, backgroundColor: colors.fill2, borderWidth: now || on ? 2 : 0, borderColor: now ? colors.accent : colors.onPhoto }} />
      <Txt variant="tiny" style={{ color: colors.onPhoto }}>
        {year}
      </Txt>
    </Tap>
  );
}

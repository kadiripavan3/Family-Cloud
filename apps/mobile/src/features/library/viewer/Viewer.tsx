import { useMutation } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Download, Ellipsis, Heart, Play, Share, Users } from 'lucide-react-native';
import { type ReactNode, useMemo, useRef, useState } from 'react';
import { type GestureResponderEvent, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCache } from '@/api/cache';
import { addToAlbum, type CircleResponse, createAlbum, deleteThing, type ItemRow, loveLibraryItem, removeFromAlbum, unloveLibraryItem } from '@/api/generated/homeport';
import { messageFor } from '@/api/fetcher';
import { useCircleIfAny, useCircles } from '@/features/circles/current';
import { useLeave } from '@/features/navigation/useLeave';
import { AudienceSheet } from '@/features/sharing/AudienceSheet';
import { NotFound } from '@/features/states/NotFound';
import { PageProblem } from '@/features/states/PageProblem';
import { looksLikeId } from '@/features/things/open';
import { formatClock, formatWeekdayPast } from '@/lib/dates';
import { newClientId } from '@/lib/ids';
import { loadState } from '@/lib/loading';
import { firstName } from '@/lib/names';
import { darkTheme, radius } from '@/theme';
import { Avatar } from '@/ui/Avatar';
import { ConfirmSheet } from '@/ui/ConfirmSheet';
import { Frost } from '@/ui/Frost';
import { LightStatusBar } from '@/ui/LightStatusBar';
import { Loading } from '@/ui/Loading';
import { Tap } from '@/ui/Motion';
import { Photo } from '@/ui/Photo';
import { RoundButton } from '@/ui/RoundButton';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

import { AlbumPickSheet } from '../AlbumPickSheet';
import { type Narrow, narrowFrom } from '../narrow';
import { openFile, saveFiles } from '../save';
import { useToast } from '../Toast';
import type { LibraryItem } from '../types';
import { useLibraryItem } from '../useLibraryItem';
import { dayOf } from '../wallRows';
import { CommentsSheet } from './CommentsSheet';
import { TagSheet } from './TagSheet';
import { CaptionSheet, DetailsSheet, ViewerMenu } from './ViewerSheets';

const stage = darkTheme.colors;

/** Which sheet is open over the photo. One at a time. */
type Open = 'menu' | 'comments' | 'audience' | 'tag' | 'album' | 'details' | 'caption' | 'delete' | null;

/**
 * 6.4 A photo (or a video), on the dark stage: the picture, when and where it was taken, who added it and
 * who can see it, the hearts and the comments. Swiping, or pressing a neighbour in the strip, steps along
 * what it was opened from: its moment, an album, a place, a person. `/photo/<id>` and `/video/<id>` both
 * draw this.
 */
export function Viewer() {
  const params = useLocalSearchParams<{ id: string; kind?: string; loved?: string; by?: string; about?: string; place?: string; album?: string; moment?: string }>();
  const id = params.id;
  const { kind, loved, by, about, place, album, moment } = params;
  const narrow = useMemo(() => narrowFrom({ kind, loved, by, about, place, album, moment }), [kind, loved, by, about, place, album, moment]);
  const insets = useSafeAreaInsets();
  const asked = useLibraryItem(id, narrow);
  const load = loadState(asked);
  const data = asked.data;
  if (!looksLikeId(id)) return <NotFound />;

  if (load.error || !data) {
    return (
      <View style={{ flex: 1, backgroundColor: stage.black }}>
        <LightStatusBar />
        <View style={{ paddingTop: insets.top + 4, paddingHorizontal: 16 }}>
          <BackButton />
        </View>
        {load.error ? <PageProblem error={load.error} onRetry={load.retry} retrying={load.retrying} tone="onPhoto" /> : <Loading offline={load.offline} tone="onPhoto" />}
      </View>
    );
  }
  return <Shown data={data} narrow={narrow} />;
}

function BackButton() {
  const leave = useLeave();
  return <RoundButton tone="photo" label={words.common.back} onPress={leave} icon={(c) => <ArrowLeft size={20} color={c} />} />;
}

/**
 * The frame a photo is shown in, as drawn: edge to edge and a little taller than wide. A photo close to
 * that shape fills it; one that would lose more than a fifth of itself (a tall one, a panorama) is shown
 * whole instead, on the black of the stage.
 */
export function frameFor(width: number, item: Pick<ItemRow, 'width' | 'height'>): { height: number; fit: 'cover' | 'contain' } {
  const height = Math.round((width * 408) / 390);
  if (!item.width || !item.height) return { height, fit: 'contain' };
  const [photo, box] = [item.width / item.height, width / height];
  const kept = Math.min(photo / box, box / photo);
  return { height, fit: kept >= 0.8 ? 'cover' : 'contain' };
}

/** Who can see a photo, as the end of its line: "everyone in The Linds can see it". */
export function whoSees(item: ItemRow, circle: CircleResponse | undefined): string {
  const says = words.library.viewer.who;
  const chip = item.chip ?? {};
  const others = (chip.people ?? []).filter((person) => person.memberId !== circle?.myMemberId);
  const base =
    chip.audience === 'circle' && circle
      ? says.circle(words.kinds[circle.kind].everyone(circle.name))
      : chip.audience === 'some'
        ? others.length === 0 && item.mine === false
          ? says.withYou
          : says.some(words.sharing.chip.some(others.map((person) => firstName(person.name))))
        : says.me;
  return chip.hiddenFrom?.length ? says.not(base, chip.hiddenFrom) : base;
}

function Shown({ data, narrow }: { data: LibraryItem; narrow: Narrow }) {
  const router = useRouter();
  const leave = useLeave();
  const cache = useCache();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const circles = useCircles();
  const current = useCircleIfAny();
  const says = words.library.viewer;
  const [open, setOpen] = useState<Open>(null);
  const { say, toast } = useToast(insets.bottom + 96);
  const albumDraft = useRef(newClientId());

  const item = data.item;
  const id = item.id ?? '';
  const kept = { id, circleId: item.circleId ?? '' };
  const circle = circles.find((one) => one.id === item.circleId) ?? current;
  const video = item.kind === 'video';
  const { newer, older, position, total } = data.neighbours;
  const stepTo = (next: ItemRow | undefined) => {
    if (next?.id) router.setParams({ id: next.id });
  };
  /** After this one is gone from what is being looked at: on to a neighbour, or out. */
  const moveOn = () => {
    const next = older[0] ?? newer[0];
    if (next?.id) router.setParams({ id: next.id });
    else leave();
  };

  // A swipe along the photo steps to its neighbours: to the left for the one before it, to the right for the one after.
  const start = useRef({ x: 0, y: 0 });
  const swipe = {
    onStartShouldSetResponderCapture: (event: GestureResponderEvent) => {
      start.current = { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY };
      return false;
    },
    onMoveShouldSetResponder: (event: GestureResponderEvent) => {
      const [dx, dy] = [event.nativeEvent.pageX - start.current.x, event.nativeEvent.pageY - start.current.y];
      return Math.abs(dx) > 14 && Math.abs(dx) > Math.abs(dy) * 1.5;
    },
    onResponderRelease: (event: GestureResponderEvent) => {
      const dx = event.nativeEvent.pageX - start.current.x;
      stepTo(dx < -44 ? older[0] : dx > 44 ? newer[0] : undefined);
    },
  };

  const love = useMutation({
    mutationFn: (loved: boolean) => (loved ? loveLibraryItem(id) : unloveLibraryItem(id)),
    onSuccess: (_, loved) => cache.photoLoved(kept, loved),
  });
  const loved = love.isPending ? love.variables : !!item.loved;

  const remove = useMutation({
    mutationFn: () => deleteThing(id),
    onSuccess: async () => {
      setOpen(null);
      moveOn();
      await cache.thingDeleted(kept);
    },
  });
  const intoAlbum = useMutation({
    mutationFn: async (album: { id?: string; title: string }) => {
      if (album.id) return { title: album.title, already: ((await addToAlbum(album.id, { itemIds: [id] })).applied ?? 0) === 0, id: album.id };
      const made = await createAlbum({ clientId: albumDraft.current, circleId: kept.circleId, title: album.title, itemIds: [id] });
      return { title: made.title, already: false, id: made.id };
    },
    onSuccess: async (result) => {
      albumDraft.current = newClientId();
      setOpen(null);
      say(says.addedTo(result.title, result.already));
      await cache.albumChanged({ id: result.id, circleId: kept.circleId });
    },
  });
  const inAlbum = narrow.album ? data.albums.find((album) => album.id === narrow.album) : undefined;
  const takeOut = useMutation({
    mutationFn: () => removeFromAlbum(narrow.album ?? '', id),
    onSuccess: async () => {
      setOpen(null);
      moveOn();
      await cache.albumChanged({ id: narrow.album ?? '', circleId: kept.circleId });
    },
  });

  const download = async () => {
    const result = await saveFiles([{ url: item.fileUrl ?? '', name: data.fileName }]);
    say(result === 'saved' ? says.saved : result === 'opened' ? says.opened : says.notSaved);
  };
  const play = async () => {
    if (!(await openFile(item.fileUrl ?? ''))) say(words.library.notYet.play);
  };

  const frame = frameFor(width, item);
  const day = dayOf(item);
  const caption = item.title?.trim() || null;
  const whoLine = words.common.join([item.mine ? says.addedByYou : item.addedBy?.name ? says.addedBy(item.addedBy.name) : null, whoSees(item, circle)]);
  const counts = words.common.join([data.loves > 0 ? says.loves(data.loves) : null, says.comments(data.comments)]);
  const slots: { item: ItemRow | undefined; label: string }[] = [
    { item: newer[1], label: says.newer(2) },
    { item: newer[0], label: says.newer(1) },
    { item, label: '' },
    { item: older[0], label: says.older(1) },
    { item: older[1], label: says.older(2) },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: stage.black }}>
      <LightStatusBar />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: insets.top + 4, paddingHorizontal: 16 }}>
        <BackButton />
        {position && total ? (
          <View style={{ paddingVertical: 9, paddingHorizontal: 14, borderRadius: radius.photo, overflow: 'hidden', borderWidth: 1, borderColor: stage.photoGlassLine, backgroundColor: stage.photoGlass }}>
            <Frost tone="dark" />
            <Txt variant="caption" weight={700} accessibilityLiveRegion="polite" style={{ color: stage.onPhoto }}>
              {says.position(position, total)}
            </Txt>
          </View>
        ) : null}
        <RoundButton tone="photo" label={words.library.more} onPress={() => setOpen('menu')} icon={(c) => <Ellipsis size={20} color={c} />} />
      </View>

      <View {...swipe} style={{ flexShrink: 1, height: frame.height, minHeight: 180, marginTop: 14 }}>
        <Image
          source={{ uri: (video ? item.url : data.largeUrl) ?? item.url ?? item.thumbUrl ?? undefined }}
          recyclingKey={id}
          style={{ flex: 1 }}
          contentFit={frame.fit}
          transition={120}
          accessibilityLabel={caption ?? (video ? says.video : says.photo)}
        />
        {/* A sheet of nothing over the picture: a browser would otherwise start dragging the image away instead of letting it be swiped. */}
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
        {video ? (
          <View pointerEvents="box-none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
            <GlassButton label={says.play} size={68} onPress={() => void play()}>
              <Play size={26} color={stage.onPhoto} fill={stage.onPhoto} />
            </GlassButton>
          </View>
        ) : null}
      </View>

      <View style={{ paddingTop: 16, paddingHorizontal: 20 }}>
        <Txt variant="label" numberOfLines={1} style={{ color: stage.accentText }}>
          {words.common.join([formatWeekdayPast(day), formatClock(item.takenLocal ?? ''), item.placeName])}
        </Txt>
        {caption ? (
          <Txt variant="title" accessibilityRole="header" numberOfLines={2} style={{ marginTop: 6, color: stage.onPhoto }}>
            {caption}
          </Txt>
        ) : null}
        <Tap accessibilityRole="button" accessibilityLabel={says.whoSpoken(whoLine)} hitSlop={8} onPress={() => setOpen('audience')} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, opacity: 0.8 }}>
          <Users size={14} color={stage.onPhoto} />
          <Txt variant="callout" numberOfLines={2} style={{ flex: 1, color: stage.onPhoto }}>
            {whoLine}
          </Txt>
        </Tap>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 20, paddingHorizontal: 20 }}>
        <GlassButton label={loved ? says.unlove : says.love} pressed={loved} onPress={() => love.mutate(!loved)}>
          <Heart size={20} color={stage.onPhoto} fill={loved ? stage.onPhoto : 'transparent'} />
        </GlassButton>
        {data.lovedBy.length > 0 ? (
          <View style={{ flexDirection: 'row' }}>
            {data.lovedBy.slice(0, 3).map((person, index) => (
              <View key={person.memberId ?? index} style={{ marginLeft: index === 0 ? 0 : -8 }}>
                <Avatar uri={person.avatarUrl} name={person.name ?? ''} size={22} ring={stage.black} />
              </View>
            ))}
          </View>
        ) : null}
        <Tap accessibilityRole="button" accessibilityLabel={says.openComments(counts)} hitSlop={12} onPress={() => setOpen('comments')} style={{ flexShrink: 1 }}>
          <Txt variant="caption" weight={700} numberOfLines={1} style={{ color: stage.onPhoto }}>
            {counts}
          </Txt>
        </Tap>
        <View style={{ flex: 1 }} />
        <GlassButton label={says.share} onPress={() => setOpen('audience')}>
          <Share size={20} color={stage.onPhoto} />
        </GlassButton>
        <GlassButton label={says.download} onPress={() => void download()}>
          <Download size={20} color={stage.onPhoto} />
        </GlassButton>
      </View>

      {/* The strip of neighbours stands at the bottom of the stage, whatever is above it. */}
      <View style={{ flex: 1, minHeight: 22 }} />
      <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, paddingBottom: Math.max(insets.bottom, 12) + 14 }}>
        {slots.map((slot, index) =>
          index === 2 ? (
            <View key="on" style={{ padding: 2, borderRadius: radius.field, borderWidth: 2, borderColor: stage.onPhoto }}>
              <Photo uri={item.thumbUrl ?? item.url} radius="tile" style={{ width: 52, height: 52, backgroundColor: stage.fill }} />
            </View>
          ) : slot.item?.id ? (
            <Tap key={slot.item.id} accessibilityRole="button" accessibilityLabel={slot.label} onPress={() => stepTo(slot.item)} scaleTo={0.92} style={{ opacity: 0.55 }}>
              <Photo uri={slot.item.thumbUrl ?? slot.item.url} radius="tile" style={{ width: 52, height: 52, backgroundColor: stage.fill }} />
            </Tap>
          ) : (
            <View key={`none-${index}`} style={{ width: 52, height: 52 }} />
          ),
        )}
      </View>
      {toast}

      <ViewerMenu
        visible={open === 'menu'}
        onClose={() => setOpen(null)}
        title={caption ?? (video ? says.video : says.photo)}
        about={data.about}
        canEdit={!!item.canEdit}
        mine={!!item.mine}
        hasCaption={!!caption}
        album={inAlbum?.title ?? null}
        takingOut={takeOut.isPending}
        problem={takeOut.isError ? messageFor(takeOut.error) : null}
        onChoose={(next) => (next === 'takeOut' ? takeOut.mutate() : setOpen(next))}
      />
      <AudienceSheet thingId={id} visible={open === 'audience'} onClose={() => setOpen(null)} />
      <CommentsSheet itemId={id} count={data.comments} visible={open === 'comments'} onClose={() => setOpen(null)} />
      {circle ? <TagSheet item={{ ...kept, canEdit: item.canEdit }} about={data.about} circle={circle} visible={open === 'tag'} onClose={() => setOpen(null)} /> : null}
      <AlbumPickSheet
        circleId={kept.circleId}
        visible={open === 'album'}
        onClose={() => setOpen(null)}
        busy={intoAlbum.isPending}
        problem={intoAlbum.isError ? messageFor(intoAlbum.error) : null}
        onPick={(album) => intoAlbum.mutate({ id: album.id, title: album.title })}
        onNew={(title) => intoAlbum.mutate({ title })}
      />
      <DetailsSheet data={data} visible={open === 'details'} onClose={() => setOpen(null)} />
      <CaptionSheet item={kept} caption={caption ?? ''} visible={open === 'caption'} onClose={() => setOpen(null)} />
      <ConfirmSheet
        visible={open === 'delete'}
        onClose={() => setOpen(null)}
        title={says.deleteAsk.title(video)}
        body={says.deleteAsk.body}
        confirm={says.deleteAsk.confirm(video)}
        busy={remove.isPending}
        problem={remove.isError ? messageFor(remove.error) : null}
        onConfirm={() => remove.mutate()}
      />
    </View>
  );
}

/** A round glass button on the stage: 44 pt, as drawn under the photo. */
function GlassButton({ label, onPress, children, size = 44, pressed }: { label: string; onPress: () => void; children: ReactNode; size?: number; pressed?: boolean }) {
  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={pressed === undefined ? undefined : { selected: pressed }}
      // Said this way, a browser hears whether it is on as well: the web takes no `accessibilityState`.
      aria-pressed={pressed}
      onPress={onPress}
      scaleTo={0.9}
      style={{ width: size, height: size, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderWidth: 1, borderColor: stage.photoGlassLine, backgroundColor: stage.photoGlass }}>
      <Frost tone="dark" />
      {children}
    </Tap>
  );
}

import { useMutation } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { ArrowLeft, Download, Ellipsis, FileText, Images, Route, Share, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCache } from '@/api/cache';
import { messageFor } from '@/api/fetcher';
import { type JourneyBookDay, type JourneyBookResponse, stopKeepingJourney, useGetJourneyBook } from '@/api/generated/homeport';
import { useToast } from '@/features/library/Toast';
import { useLeave } from '@/features/navigation/useLeave';
import { AudienceSheet } from '@/features/sharing/AudienceSheet';
import { PageProblem } from '@/features/states/PageProblem';
import { thingHref } from '@/features/things/open';
import { formatWeekdayPast } from '@/lib/dates';
import { loadState } from '@/lib/loading';
import { layout, radius, useTheme, withAlpha } from '@/theme';
import { Button } from '@/ui/Button';
import { ConfirmSheet } from '@/ui/ConfirmSheet';
import { Eyebrow } from '@/ui/Eyebrow';
import { GlassBar } from '@/ui/GlassBar';
import { LightStatusBar } from '@/ui/LightStatusBar';
import { Loading } from '@/ui/Loading';
import { Tap } from '@/ui/Motion';
import { Photo } from '@/ui/Photo';
import { RoundButton } from '@/ui/RoundButton';
import { Sheet, SheetRow } from '@/ui/Sheet';
import { Sk } from '@/ui/Skeleton';
import { Stat } from '@/ui/Stat';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

import { useOpenJourney } from '../open';
import { FromJourney } from '../parts';

/** How tall the cover is, as drawn. */
const COVER = 290;
/** How many of a day's photos the book shows before it says "+4". */
const TILES = 3;

/**
 * 10.4 A journey, kept as a book: the page a kept journey became, laid out by itself. A cover, the numbers,
 * then each day with its words and its photos, read from the page as it stands (so what anyone wrote into
 * it since is here too), and a bar that opens the journey where it is still live. `/page/<id>` draws this
 * for a page that is a book; "Open as a page" in its menu shows the same page the way Notes does.
 */
export function JourneyBook({ pageId }: { pageId: string }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const leave = useLeave();
  const asked = useGetJourneyBook(pageId);
  const load = loadState(asked);
  const book = asked.data;
  if (book) return <Shown book={book} pageId={pageId} />;
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ paddingTop: insets.top + 4, paddingHorizontal: layout.barGutter }}>
        <RoundButton label={words.common.back} onPress={leave} icon={(c) => <ArrowLeft size={20} color={c} />} />
      </View>
      {load.error ? (
        <PageProblem error={load.error} onRetry={load.retry} retrying={load.retrying} />
      ) : load.offline ? (
        <Loading offline />
      ) : (
        <View accessibilityLabel={words.states.loading} style={{ gap: 12, paddingTop: 16, paddingHorizontal: layout.gutter }}>
          <Sk height={170} radius="card" />
          <Sk width="60%" height={28} style={{ alignSelf: 'center' }} />
          <Sk height={56} />
          <Sk width="40%" height={18} />
          <Sk height={14} />
          <Sk width="80%" height={14} />
        </View>
      )}
    </View>
  );
}

function Shown({ book, pageId }: { book: JourneyBookResponse; pageId: string }) {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const leave = useLeave();
  const cache = useCache();
  const says = words.together.book;
  const kept = book.kept;
  const [sheet, setSheet] = useState<'menu' | 'audience' | 'stop' | null>(null);
  const { say, toast } = useToast(insets.bottom + 108);
  const openJourney = useOpenJourney(say);
  const album = kept.albumId ? () => router.push(thingHref({ kind: 'album', id: kept.albumId })) : undefined;

  const stop = useMutation({
    mutationFn: () => stopKeepingJourney(kept.id),
    onSuccess: async () => {
      setSheet(null);
      // The page stays: from now on it is an ordinary page of Notes.
      await cache.journeyUnkept(kept);
    },
  });

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <LightStatusBar />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: (kept.openUrl ? 120 : 40) + insets.bottom }}>
        <Photo uri={kept.coverUrl} radius="none" style={{ height: COVER, backgroundColor: colors.fill }} label={says.photo(kept.title)}>
          <LinearGradient colors={[withAlpha(colors.black, 0.4), withAlpha(colors.black, 0)]} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: COVER * 0.4 }} />
          <View style={{ position: 'absolute', left: layout.barGutter, bottom: 44 }}>
            <FromJourney label={says.pill} />
          </View>
        </Photo>
        <View style={{ marginTop: -30, paddingTop: 24, paddingHorizontal: layout.gutter, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, backgroundColor: colors.bg }}>
          <View style={{ alignItems: 'center' }}>
            <Eyebrow>{says.eyebrow(kept.byline)}</Eyebrow>
            <Txt variant="titleLarge" accessibilityRole="header" center style={{ marginTop: 2 }}>
              {kept.title}
            </Txt>
          </View>
          <View style={{ flexDirection: 'row', marginTop: 18, paddingVertical: 13, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.line }}>
            <Stat value={words.common.number(kept.stats.days ?? 0)} label={says.stats.days} />
            <Stat divider value={words.common.number(kept.stats.entries ?? 0)} label={says.stats.entries} />
            <Stat divider value={words.common.number(kept.stats.photos ?? 0)} label={says.stats.photos} />
          </View>
          {book.days.length === 0 ? (
            <Txt color="muted" style={{ marginTop: 18 }}>
              {says.empty}
            </Txt>
          ) : null}
          {book.days.map((day, index) => (
            <Day key={day.day ?? index} day={day} onAlbum={album} />
          ))}
        </View>
      </ScrollView>

      <View style={{ position: 'absolute', top: insets.top + 4, left: layout.barGutter, right: layout.barGutter, flexDirection: 'row', justifyContent: 'space-between' }}>
        <RoundButton tone="photo" label={words.common.back} onPress={leave} icon={(c) => <ArrowLeft size={20} color={c} />} />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <RoundButton tone="photo" label={says.share} onPress={() => setSheet('audience')} icon={(c) => <Share size={20} color={c} />} />
          <RoundButton tone="photo" label={words.things.more} onPress={() => setSheet('menu')} icon={(c) => <Ellipsis size={20} color={c} />} />
        </View>
      </View>

      {kept.openUrl ? (
        <GlassBar radius="sheet" style={{ position: 'absolute', left: 12, right: 12, bottom: Math.max(insets.bottom, 24) }} contentStyle={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingLeft: 20, paddingRight: 10 }}>
          <View style={{ flex: 1 }}>
            <Txt variant="item" weight={800} numberOfLines={1}>
              {says.live.title}
            </Txt>
            <Txt variant="footnote" color="muted" numberOfLines={1}>
              {says.live.line(words.together.visibility.name(kept.visibility), kept.stats.followers ?? 0)}
            </Txt>
          </View>
          <Button label={words.together.open.button} spoken={words.together.open.inJourney} size="sm" inline icon={(c) => <Route size={16} color={c} />} onPress={() => openJourney(kept.openUrl)} />
        </GlassBar>
      ) : null}
      {toast}

      <Sheet visible={sheet === 'menu'} onClose={() => setSheet(null)} title={kept.title}>
        <SheetRow
          first
          icon={(c) => <FileText size={22} color={c} />}
          label={says.menu.asPage}
          note={says.menu.asPageNote}
          onPress={() => {
            setSheet(null);
            router.push({ pathname: '/page/[id]', params: { id: pageId, as: 'page' } });
          }}
        />
        {album ? (
          <SheetRow
            icon={(c) => <Images size={22} color={c} />}
            label={says.menu.album}
            onPress={() => {
              setSheet(null);
              album();
            }}
          />
        ) : null}
        {kept.mine ? (
          <SheetRow
            icon={(c) => <Download size={22} color={c} />}
            label={says.menu.bring}
            onPress={() => {
              setSheet(null);
              router.push({ pathname: '/journey/keep/[journeyId]', params: { journeyId: kept.journeyId } });
            }}
          />
        ) : null}
        {kept.mine ? <SheetRow danger icon={(c) => <Trash2 size={22} color={c} />} label={says.menu.stop} onPress={() => setSheet('stop')} /> : null}
      </Sheet>
      <AudienceSheet thingId={pageId} visible={sheet === 'audience'} onClose={() => setSheet(null)} />
      <ConfirmSheet visible={sheet === 'stop'} onClose={() => setSheet(null)} title={says.stopAsk.title} body={says.stopAsk.body} confirm={says.stopAsk.confirm} busy={stop.isPending} problem={stop.isError ? messageFor(stop.error) : null} onConfirm={() => stop.mutate()} />
    </View>
  );
}

/** One day of the book: "Day 1" with where and when, its words, and its first photos with how many more there are. */
function Day({ day, onAlbum }: { day: JourneyBookDay; onAlbum?: () => void }) {
  const photos = (day.photos ?? []).slice(0, TILES);
  const more = Math.max((day.shots ?? 0) - photos.length, 0);
  const says = words.together.book;
  const label = day.label ?? '';
  const tile = (index: number, style: object) => {
    const photo = photos[index]!;
    const last = index === photos.length - 1 && more > 0;
    return (
      <Tap key={photo.blockId ?? index} accessibilityRole={onAlbum ? 'button' : 'image'} accessibilityLabel={last ? says.moreSpoken(more) : photo.caption?.trim() || says.photo(label)} disabled={!onAlbum} onPress={onAlbum} scaleTo={0.985} style={style}>
        <Photo uri={index === 0 || photos.length < TILES ? photo.url : photo.thumbUrl} radius="none" style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          {last ? <MoreShade count={more} /> : null}
        </Photo>
      </Tap>
    );
  };
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 18 }}>
        <Txt variant="subtitle" accessibilityRole="header">
          {label}
        </Txt>
        <Txt variant="footnote" color="muted" numberOfLines={1} style={{ flex: 1 }}>
          {words.common.join([day.place, day.day ? formatWeekdayPast(day.day) : null])}
        </Txt>
      </View>
      {(day.words ?? []).map((text, index) => (
        <Txt key={index} variant="body" style={{ marginTop: 4 }}>
          {text}
        </Txt>
      ))}
      {photos.length ? (
        <View style={{ flexDirection: 'row', gap: 6, height: 174, marginTop: 12, borderRadius: radius.card, overflow: 'hidden' }}>
          {tile(0, { flex: photos.length === 1 ? 1 : 1.25 })}
          {photos.length === 2 ? tile(1, { flex: 1 }) : null}
          {photos.length >= TILES ? (
            <View style={{ flex: 1, gap: 6 }}>
              {tile(1, { flex: 1 })}
              {tile(2, { flex: 1 })}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** "+4" over a day's last photo: how many more the day has, in the album. */
function MoreShade({ count }: { count: number }) {
  const { colors } = useTheme();
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: withAlpha(colors.black, 0.42) }}>
      <Txt variant="subtitle" style={{ color: colors.onPhoto }}>
        {words.together.book.more(count)}
      </Txt>
    </View>
  );
}

import { useMutation } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Book, ChevronRight, Folder, Image as ImageIcon, Map as MapIcon, MessageCircle, Users, X } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCache } from '@/api/cache';
import { messageFor } from '@/api/fetcher';
import { type Audience, type CircleResponse, type JourneyJobResponse, keepJourney, type KeepOptions, useGetKeepOptions, useGetKeptJourney, useGetMe, useGetTrip } from '@/api/generated/homeport';
import { useCircle } from '@/features/circles/current';
import { isOver, useJourneyJob } from '@/features/journeyLink/jobs';
import { type KeepIn, KeepInSheet } from '@/features/journeyLink/keep/KeepInSheet';
import { JobProgress, JourneyCover, PlainRow } from '@/features/journeyLink/parts';
import { useLeave } from '@/features/navigation/useLeave';
import { StartsAsPill } from '@/features/sharing/StartsAsPill';
import { NotFound } from '@/features/states/NotFound';
import { looksLikeId, thingHref } from '@/features/things/open';
import { today } from '@/lib/dates';
import { newClientId } from '@/lib/ids';
import { loadState } from '@/lib/loading';
import { firstName } from '@/lib/names';
import { AlwaysDark, layout, radius, useTheme } from '@/theme';
import { JourneyMark } from '@/ui/Brand';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { LightStatusBar } from '@/ui/LightStatusBar';
import { Loading } from '@/ui/Loading';
import { Tap } from '@/ui/Motion';
import { Photo } from '@/ui/Photo';
import { Problem } from '@/ui/Problem';
import { RoundButton } from '@/ui/RoundButton';
import { Sk } from '@/ui/Skeleton';
import { Toggle } from '@/ui/Toggle';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

/**
 * 10.3 What to keep: one sheet over the journey's cover, four switches. The story becomes a page in Notes,
 * the photos an album in the Library (matched to what the phone already backed up), the route goes onto the
 * Places map. Then it is kept, with its progress, and the sheet says what came home.
 *
 * `/journey/keep/<journey id>`: where "Keep in Homeport" on Journey's recap lands (`homeport://keep?journey=<id>`),
 * and where the list of your journeys leads. `?trip=<folder id>` keeps it as that trip's book.
 */
export default function KeepJourney() {
  const { journeyId, trip } = useLocalSearchParams<{ journeyId: string; trip?: string }>();
  const circle = useCircle();
  if (!looksLikeId(journeyId)) return <NotFound />;
  return (
    // The sheet lies over a photo, so it is drawn dark whatever the phone is set to.
    <AlwaysDark>
      <Stack.Screen options={{ animation: 'fade' }} />
      <Keep journeyId={journeyId} circle={circle} tripId={looksLikeId(trip) ? trip : undefined} />
    </AlwaysDark>
  );
}

function Keep({ journeyId, circle, tripId }: { journeyId: string; circle: CircleResponse; tripId?: string }) {
  const { colors, shadow } = useTheme();
  const insets = useSafeAreaInsets();
  const leave = useLeave();
  const asked = useGetKeepOptions(journeyId, { circleId: circle.id });
  const load = loadState(asked);
  const options = asked.data;
  const [started, setStarted] = useState<JourneyJobResponse | null>(null);

  return (
    <View style={{ flex: 1, backgroundColor: colors.stage }}>
      <LightStatusBar />
      <Photo uri={options?.journey?.coverUrl} radius="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.stage }} />
      {/* Pressing the photo closes the sheet, as pressing beside any sheet does. */}
      <Tap accessibilityRole="button" accessibilityLabel={words.common.close} onPress={leave} scaleTo={1} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.scrim }}>
        <View />
      </Tap>
      <View style={{ position: 'absolute', top: insets.top + 8, right: layout.barGutter }}>
        <RoundButton tone="photo" label={words.common.close} onPress={leave} icon={(c) => <X size={20} color={c} />} />
      </View>
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '86%', paddingTop: 10, paddingBottom: Math.max(insets.bottom, 16) + 8, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, backgroundColor: colors.surface, boxShadow: shadow.sheet }}>
        <View style={{ alignSelf: 'center', width: 38, height: 5, borderRadius: radius.pill, marginBottom: 8, backgroundColor: colors.fill2 }} />
        {load.error ? (
          <View style={{ minHeight: 260 }}>
            <Problem message={messageFor(load.error)} onRetry={load.retry} retrying={load.retrying} />
          </View>
        ) : !options ? (
          load.offline ? (
            <View style={{ minHeight: 260 }}>
              <Loading offline />
            </View>
          ) : (
            <View accessibilityLabel={words.states.loading} style={{ gap: 10, paddingTop: 12, paddingHorizontal: layout.barGutter }}>
              <Sk width={190} height={22} />
              <Sk height={76} radius="card" />
              <Sk height={216} radius="card" />
              <Sk height={54} radius="pill" />
            </View>
          )
        ) : started ? (
          <Keeping started={started} circle={circle} onAgain={() => setStarted(null)} />
        ) : (
          <Choices options={options} journeyId={journeyId} circle={circle} tripId={tripId} onStarted={setStarted} />
        )}
      </View>
    </View>
  );
}

/** The journey, the four switches, where it is kept and who sees it, and the button that keeps it. */
function Choices({ options, journeyId, circle, tripId, onStarted }: { options: KeepOptions; journeyId: string; circle: CircleResponse; tripId?: string; onStarted: (job: JourneyJobResponse) => void }) {
  const { colors } = useTheme();
  const says = words.together.keep;
  const journey = options.journey ?? {};
  const me = useGetMe().data;
  const trip = useGetTrip(tripId ?? '', { day: today() }, { query: { enabled: !!tripId } }).data;
  const [book, setBook] = useState(true);
  const [originals, setOriginals] = useState(true);
  const [route, setRoute] = useState(true);
  const [kindWords, setKindWords] = useState(false);
  // Until a folder is chosen: the trip's own folder for a trip's journey, else where the API would file it.
  const [chosen, setChosen] = useState<KeepIn | undefined>(undefined);
  const [audience, setAudience] = useState<Audience>(options.audience === 'me' ? 'me' : 'circle');
  const [picking, setPicking] = useState(false);
  const clientId = useRef(newClientId());
  const fallback: KeepIn = trip ? { folderId: trip.id, title: trip.title } : options.keepIn?.folderId ? { folderId: options.keepIn.folderId, title: options.keepIn.title ?? '' } : null;
  const folder = chosen === undefined ? fallback : chosen;

  const keep = useMutation({
    mutationFn: () => keepJourney({ clientId: clientId.current, circleId: circle.id, journeyId, book, originals, route, words: kindWords, folderId: folder?.folderId ?? null, audience, tripId: tripId ?? null }),
    onSuccess: (job) => {
      clientId.current = newClientId();
      onStarted(job);
    },
  });
  // The other people who wrote it, by their first names: "with Alex".
  const withNames = (journey.authors ?? []).filter((author) => author.id !== me?.id).map((author) => firstName(author.name));

  return (
    <>
      <ScrollView showsVerticalScrollIndicator={false} style={{ flexGrow: 0 }}>
        <Txt variant="titleSmall" accessibilityRole="header" style={{ paddingTop: 8, paddingBottom: 4, paddingHorizontal: layout.gutter }}>
          {says.title}
        </Txt>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4, marginBottom: 10, marginHorizontal: layout.barGutter, padding: 10, borderRadius: radius.card, backgroundColor: colors.fill }}>
          <JourneyCover uri={journey.coverUrl} size={56} />
          <View style={{ flex: 1, gap: 1 }}>
            <Txt variant="item" weight={800} numberOfLines={1}>
              {journey.title}
            </Txt>
            <Txt variant="footnote" color="muted" numberOfLines={1}>
              {says.about(journey.days ?? 0, journey.entries ?? 0, withNames)}
            </Txt>
          </View>
          <JourneyMark size={28} />
        </View>

        <Card style={{ marginHorizontal: layout.barGutter, borderRadius: radius.card, overflow: 'hidden' }}>
          <PlainRow first icon={(c) => <Book size={22} color={c} />} title={says.book.title} note={says.book.note}>
            <Toggle label={says.book.title} value={book} onChange={setBook} />
          </PlainRow>
          <PlainRow icon={(c) => <ImageIcon size={22} color={c} />} title={says.originals.title} note={says.originals.note(options.photos ?? 0, options.clips ?? 0, options.inLibrary ?? null)}>
            <Toggle label={says.originals.title} value={originals} onChange={setOriginals} />
          </PlainRow>
          <PlainRow icon={(c) => <MapIcon size={22} color={c} />} title={says.route.title} note={says.route.note}>
            <Toggle label={says.route.title} value={route} onChange={setRoute} />
          </PlainRow>
          <PlainRow icon={(c) => <MessageCircle size={22} color={c} />} title={says.words.title} note={says.words.note}>
            <Toggle label={says.words.title} value={kindWords} onChange={setKindWords} />
          </PlainRow>
        </Card>
        {/* What Journey can't hand over yet, in the API's own words. */}
        {options.originalsNote || options.clipsNote || options.keptId ? (
          <Txt variant="footnote" color="muted" style={{ marginTop: 8, marginHorizontal: layout.gutter }}>
            {[options.keptId ? says.again.note : null, options.originalsNote, options.clipsNote].filter(Boolean).join(' ')}
          </Txt>
        ) : null}

        <Card style={{ marginTop: 10, marginHorizontal: layout.barGutter, borderRadius: radius.card, overflow: 'hidden' }}>
          <Tap accessibilityRole="button" accessibilityLabel={words.common.fieldChange(says.keepIn, folder?.title ?? says.noFolder)} onPress={() => setPicking(true)} scaleTo={0.985}>
            <PlainRow first icon={(c) => <Folder size={22} color={c} />} title={says.keepIn}>
              <Txt variant="callout" color="muted" numberOfLines={1} style={{ maxWidth: 150 }}>
                {folder?.title ?? says.noFolder}
              </Txt>
              <ChevronRight size={18} color={colors.muted} />
            </PlainRow>
          </Tap>
          <PlainRow icon={(c) => <Users size={22} color={c} />} title={says.whoSees}>
            <StartsAsPill circle={circle} value={audience} onChange={setAudience} />
          </PlainRow>
        </Card>
        {keep.isError ? (
          <Txt variant="caption" color="danger" accessibilityLiveRegion="polite" style={{ marginTop: 10, marginHorizontal: layout.gutter }}>
            {messageFor(keep.error)}
          </Txt>
        ) : null}
      </ScrollView>
      <View style={{ paddingTop: 14, paddingHorizontal: layout.barGutter }}>
        <Button label={options.keptId ? says.again.button : says.button} size="lg" block loading={keep.isPending} disabled={!book && !originals && !route} onPress={() => keep.mutate()} />
      </View>
      <KeepInSheet visible={picking} onClose={() => setPicking(false)} circleId={circle.id} value={folder} onChoose={setChosen} />
    </>
  );
}

/** While it is being kept: how far it is. Then what came home, and the ways to it. */
function Keeping({ started, circle, onAgain }: { started: JourneyJobResponse; circle: CircleResponse; onAgain: () => void }) {
  const router = useRouter();
  const leave = useLeave();
  const cache = useCache();
  const says = words.together.keep;
  const { job } = useJourneyJob(started);
  const done = job?.status === 'done';
  const kept = useGetKeptJourney(job?.subjectId ?? '', { query: { enabled: done && !!job?.subjectId } }).data;
  // Once, when it has come home: every list of the circle has something new.
  const told = useRef(false);
  useEffect(() => {
    if (done && !told.current) {
      told.current = true;
      void cache.journeyKept(circle.id);
    }
  }, [done, cache, circle.id]);
  if (!job) return null;

  return (
    <View>
      <Txt variant="titleSmall" accessibilityRole="header" style={{ paddingTop: 8, paddingBottom: 12, paddingHorizontal: layout.gutter }}>
        {done ? says.done.title : says.title}
      </Txt>
      <JobProgress job={job} title={says.keeping} onRetry={onAgain} />
      {done ? (
        <>
          <Txt variant="callout" color="muted" style={{ marginTop: 12, marginHorizontal: layout.gutter }}>
            {kept ? says.done.body(kept.originals.matched ?? 0, kept.originals.brought ?? 0, kept.originals.leftInJourney ?? 0) : ' '}
          </Txt>
          <View style={{ gap: 10, paddingTop: 16, paddingHorizontal: layout.barGutter }}>
            {kept?.pageId ? <Button label={says.done.book} size="lg" block onPress={() => router.replace(thingHref({ kind: 'page', id: kept.pageId }))} /> : null}
            {kept?.albumId ? <Button label={says.done.album} size="lg" block variant={kept.pageId ? 'soft' : 'primary'} onPress={() => router.replace(thingHref({ kind: 'album', id: kept.albumId }))} /> : null}
            <Button label={says.done.close} size="lg" block variant={kept?.pageId || kept?.albumId ? 'soft' : 'primary'} onPress={leave} />
          </View>
        </>
      ) : isOver(job) ? null : (
        <Txt variant="footnote" color="muted" center style={{ marginTop: 12, marginHorizontal: layout.gutter }}>
          {says.stay}
        </Txt>
      )}
    </View>
  );
}

import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { BookOpen, Check, ChevronRight, Clock, Download, House, MapPin, Moon, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useCache } from '@/api/cache';
import { messageFor } from '@/api/fetcher';
import { type AwayResponse, changeHomeSettings, type CircleResponse, type HomeSettingsRequest, type HomeSettingsResponse, useGetGoodnightsInfinite, useGetHomeSettings, useGetJourneyAtHome, useGetPlaces } from '@/api/generated/homeport';
import { paged, rows } from '@/api/pages';
import { useCircle } from '@/features/circles/current';
import { useOpenJourney } from '@/features/journeyLink/open';
import { useToast } from '@/features/library/Toast';
import { PageProblem } from '@/features/states/PageProblem';
import { thingHref } from '@/features/things/open';
import { formatWeekdayPast, phoneTimeZone, today } from '@/lib/dates';
import { loadState } from '@/lib/loading';
import { layout, useTheme } from '@/theme';
import { AppBar } from '@/ui/AppBar';
import { Avatar } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { GroupLabel } from '@/ui/Heading';
import { Loading } from '@/ui/Loading';
import { MoreButton } from '@/ui/MoreButton';
import { Tap } from '@/ui/Motion';
import { Problem } from '@/ui/Problem';
import { Row, RowGroup } from '@/ui/Rows';
import { Sheet, SheetRow } from '@/ui/Sheet';
import { ListSkeleton } from '@/ui/Skeleton';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

/** The bedtimes on offer: every half hour of an evening. */
const BEDTIMES = ['18:00', '18:30', '19:00', '19:30', '20:00', '20:30', '21:00', '21:30', '22:00'];
/** How near a place has to be to home's point to be the one that was chosen, in degrees (about 200 metres). */
const NEAR = 0.002;

type Asking = 'where' | 'bedtime' | 'clock' | null;

/**
 * Journey at home: what stands behind Journey's cards on Today (10.8). Who of the circle is away on a
 * journey right now; where home is (photos taken there stay home when a journey is told) and when bedtime is
 * (a goodnight from far away waits on Today until then), which the people who run the circle can change; the
 * goodnights so far; and the ways to what was kept. Not drawn: the drawing shows Today.
 */
export default function JourneyAtHome() {
  const { colors } = useTheme();
  const router = useRouter();
  const circle = useCircle();
  const says = words.together.atHome.page;
  const atHome = useGetJourneyAtHome(circle.id, { day: today() });
  const settings = useGetHomeSettings(circle.id);
  const goodnights = useGetGoodnightsInfinite(circle.id, { limit: 10 }, { query: paged });
  const load = loadState(atHome, settings);
  const [asking, setAsking] = useState<Asking>(null);
  const { say, toast } = useToast(48);
  const openJourney = useOpenJourney(say);
  const home = settings.data;
  const nights = rows(goodnights.data) ?? [];

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar title={says.title} />
      {load.error ? (
        <PageProblem error={load.error} onRetry={load.retry} retrying={load.retrying} />
      ) : !atHome.data || !home ? (
        load.offline ? (
          <Loading offline />
        ) : (
          <ListSkeleton count={4} />
        )
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 48 }}>
          <GroupLabel style={{ marginTop: 8, marginHorizontal: layout.gutter }}>{says.away}</GroupLabel>
          {atHome.data.away.length ? (
            <RowGroup>
              {atHome.data.away.map((away, index) => (
                <Away key={away.journey.id ?? index} away={away} first={index === 0} onPress={() => openJourney(away.journey.openUrl)} />
              ))}
            </RowGroup>
          ) : (
            <Txt variant="callout" color="muted" style={{ marginHorizontal: layout.gutter }}>
              {atHome.data.available ? says.nobody : says.off}
            </Txt>
          )}

          <GroupLabel style={{ marginHorizontal: layout.gutter }}>{says.home}</GroupLabel>
          <RowGroup>
            <Row first icon={(c) => <House size={18} color={c} />} label={says.where.title} note={says.where.note} value={home.homeLat === null ? says.where.notSet : says.where.set} onPress={home.canChange ? () => setAsking('where') : undefined} />
            <Row icon={(c) => <Moon size={18} color={c} />} label={says.bedtime.title} note={says.bedtime.note} value={home.bedtime} onPress={home.canChange ? () => setAsking('bedtime') : undefined} />
            <Row icon={(c) => <Clock size={18} color={c} />} label={says.clock.title} note={home.timeZone ?? says.clock.notSet} onPress={home.canChange ? () => setAsking('clock') : undefined} />
          </RowGroup>
          {home.canChange ? null : (
            <Txt variant="footnote" color="muted" style={{ marginTop: 8, marginHorizontal: layout.gutter }}>
              {says.onlyRunners}
            </Txt>
          )}

          {nights.length ? (
            <>
              <GroupLabel style={{ marginHorizontal: layout.gutter }}>{says.goodnights}</GroupLabel>
              <RowGroup>
                {nights.map((night, index) => (
                  <Row
                    key={night.id}
                    first={index === 0}
                    icon={(c) => <Moon size={18} color={c} />}
                    label={night.title.trim() || words.together.goodnight.untitled}
                    note={says.goodnightLine(night.from?.name, formatWeekdayPast(night.forDay))}
                    onPress={() => router.push(thingHref({ kind: 'goodnight', id: night.id }))}
                  />
                ))}
              </RowGroup>
              <MoreButton pages={goodnights} />
            </>
          ) : null}

          <GroupLabel style={{ marginHorizontal: layout.gutter }}>{says.kept}</GroupLabel>
          <RowGroup>
            <Row first icon={(c) => <BookOpen size={18} color={c} />} label={words.together.kept.title} onPress={() => router.push('/journey/kept')} />
            <Row icon={(c) => <Download size={18} color={c} />} label={words.together.kept.add} onPress={() => router.push('/journey/keep')} />
          </RowGroup>
        </ScrollView>
      )}
      {toast}
      {home ? <SettingsSheets asking={asking} onClose={() => setAsking(null)} circle={circle} home={home} /> : null}
    </SafeAreaView>
  );
}

/** Someone who is away: their picture, that they are on a journey, which one and how far along. Pressing opens it in Journey. */
function Away({ away, first, onPress }: { away: AwayResponse; first: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  const line = words.together.atHome.page.awayLine(away.journey.title, away.journey.progressLabel);
  return (
    <Tap accessibilityRole="button" accessibilityLabel={words.common.spoken([away.who.name, line, words.together.open.inJourney])} onPress={onPress} scaleTo={0.985} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 58, paddingVertical: 10, paddingHorizontal: 16, borderTopWidth: first ? 0 : 1, borderTopColor: colors.line }}>
      <Avatar uri={away.who.avatarUrl} name={away.who.name ?? ''} size={38} />
      <View style={{ flex: 1, gap: 1 }}>
        <Txt variant="item" weight={600} numberOfLines={1}>
          {away.who.name}
        </Txt>
        <Txt variant="footnote" color="muted" numberOfLines={1}>
          {line}
        </Txt>
      </View>
      {away.newCount > 0 ? (
        <Txt variant="small" weight={800} color="accentText">
          {words.together.atHome.newCount(away.newCount)}
        </Txt>
      ) : null}
      <ChevronRight size={18} color={colors.muted} />
    </Tap>
  );
}

/** The three sheets that change what home is: where it is, when bedtime is, and which clock it keeps. */
function SettingsSheets({ asking, onClose, circle, home }: { asking: Asking; onClose: () => void; circle: CircleResponse; home: HomeSettingsResponse }) {
  const { colors } = useTheme();
  const cache = useCache();
  const says = words.together.atHome;
  const places = useGetPlaces(circle.id, { query: { enabled: asking === 'where' } });
  const placesLoad = loadState(places);
  const change = useMutation({
    mutationFn: (request: HomeSettingsRequest) => changeHomeSettings(circle.id, request),
    onSuccess: async (saved) => {
      await cache.homeSettingsSaved(saved);
      onClose();
    },
  });
  const tick = <Check size={20} color={colors.text} strokeWidth={2.6} />;
  const problem = change.isError ? (
    <Txt variant="caption" color="danger" accessibilityLiveRegion="polite" style={{ paddingBottom: 8, paddingHorizontal: layout.gutter }}>
      {messageFor(change.error)}
    </Txt>
  ) : null;
  const isHome = (lat: number, lng: number) => home.homeLat !== null && home.homeLng !== null && Math.abs(lat - home.homeLat) < NEAR && Math.abs(lng - home.homeLng) < NEAR;
  // Only a place that says where it is can be home.
  const list = (places.data?.list ?? []).flatMap((place) => (typeof place.lat === 'number' && typeof place.lng === 'number' ? [{ ...place, lat: place.lat, lng: place.lng }] : []));
  const zone = phoneTimeZone();

  return (
    <>
      <Sheet visible={asking === 'where'} onClose={onClose} title={says.whereSheet.title} subtitle={says.whereSheet.lead(home.homeRadiusM)} tall>
        {problem}
        {placesLoad.error ? (
          <View style={{ minHeight: 200 }}>
            <Problem message={messageFor(placesLoad.error)} onRetry={placesLoad.retry} retrying={placesLoad.retrying} />
          </View>
        ) : !places.data ? (
          <View style={{ minHeight: 160 }}>
            <Loading offline={placesLoad.offline} />
          </View>
        ) : (
          <View style={{ paddingBottom: 8 }}>
            {list.length === 0 ? (
              <Txt variant="callout" color="muted" style={{ paddingVertical: 8, paddingHorizontal: layout.gutter }}>
                {says.whereSheet.none}
              </Txt>
            ) : null}
            {list.map((place, index) => (
              <SheetRow
                key={`${place.name}-${index}`}
                first={index === 0}
                icon={(c) => <MapPin size={22} color={c} />}
                label={place.name ?? ''}
                note={says.whereSheet.placeLine(place.country, place.count ?? 0)}
                trailing={isHome(place.lat, place.lng) ? tick : undefined}
                onPress={() => change.mutate({ homeLat: place.lat, homeLng: place.lng })}
              />
            ))}
            {home.homeLat !== null ? <SheetRow danger first={list.length === 0} icon={(c) => <Trash2 size={22} color={c} />} label={says.whereSheet.forget} onPress={() => change.mutate({ removeHome: true })} /> : null}
          </View>
        )}
      </Sheet>

      <Sheet visible={asking === 'bedtime'} onClose={onClose} title={says.bedtimeSheet.title} subtitle={says.bedtimeSheet.lead}>
        {problem}
        <View style={{ paddingBottom: 4 }}>
          {BEDTIMES.map((time, index) => (
            <SheetRow key={time} first={index === 0} label={time} trailing={home.bedtime === time ? tick : undefined} onPress={() => change.mutate({ bedtime: time })} />
          ))}
        </View>
      </Sheet>

      <Sheet visible={asking === 'clock'} onClose={onClose} title={says.clockSheet.title} subtitle={says.clockSheet.lead}>
        {problem}
        <View style={{ paddingTop: 6, paddingHorizontal: layout.rowGutter }}>
          <Button label={says.clockSheet.use(zone)} size="lg" block loading={change.isPending} onPress={() => change.mutate({ timeZone: zone })} />
        </View>
      </Sheet>
    </>
  );
}

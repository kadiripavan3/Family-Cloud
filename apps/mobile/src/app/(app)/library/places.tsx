import { useRouter } from 'expo-router';
import { ArrowLeft, ChevronDown, ChevronRight, Layers, LayoutGrid } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { type PlaceView, useGetPlaces, useGetWallInfinite } from '@/api/generated/homeport';
import { paged, rows } from '@/api/pages';
import { useCircle } from '@/features/circles/current';
import { placeHref } from '@/features/home/places';
import { viewerHref } from '@/features/library/narrow';
import { useToast } from '@/features/library/Toast';
import { wallItems } from '@/features/library/types';
import { photoRows } from '@/features/library/wallRows';
import { WallPhotos } from '@/features/library/WallRows';
import { useLeave } from '@/features/navigation/useLeave';
import { PageProblem } from '@/features/states/PageProblem';
import { formatDay } from '@/lib/dates';
import { loadState } from '@/lib/loading';
import { firstName } from '@/lib/names';
import { layout, radius, useTheme } from '@/theme';
import { EmptyState } from '@/ui/EmptyState';
import { Eyebrow } from '@/ui/Eyebrow';
import { GlassBar } from '@/ui/GlassBar';
import { List } from '@/ui/List';
import { Loading } from '@/ui/Loading';
import { MoreButton } from '@/ui/MoreButton';
import { Tap } from '@/ui/Motion';
import { Photo } from '@/ui/Photo';
import { RoundButton } from '@/ui/RoundButton';
import { ListSkeleton } from '@/ui/Skeleton';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

const says = words.library.places;
type Place = PlaceView & { name: string };

/**
 * 6.6 Places: the same wall, by where it was taken. On a phone this is a map with a square for each place;
 * the map isn't built yet, so here (and on a phone, for now) the places are a list: each with its cover,
 * its count, how often you were there and who took the photos. Pressing one opens its photos underneath.
 */
export default function Places() {
  const { colors, shadow } = useTheme();
  const router = useRouter();
  const leave = useLeave();
  const insets = useSafeAreaInsets();
  const circle = useCircle();
  // The place whose photos are open, by its name.
  const [chosen, setChosen] = useState<string | null>(null);
  const { say, toast } = useToast(insets.bottom + 92);

  const asked = useGetPlaces(circle.id);
  const load = loadState(asked);
  const data = asked.data;
  const places = (data?.list ?? []).filter((place): place is Place => !!place.name);

  const none = (
    <View style={{ paddingTop: 80 }}>
      <EmptyState emoji="🗺️" title={says.none.title} body={says.none.body} />
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.mapLand }}>
      {load.error ? (
        <View style={{ flex: 1, paddingTop: insets.top + 70 }}>
          <PageProblem error={load.error} onRetry={load.retry} retrying={load.retrying} />
        </View>
      ) : !data ? (
        <View style={{ flex: 1, paddingTop: insets.top + 70 }}>{load.offline ? <Loading offline /> : <ListSkeleton count={4} />}</View>
      ) : (
        <List
          data={places}
          keyOf={(place) => place.name}
          row={(place) => <PlaceCard place={place} circleId={circle.id} myMemberId={circle.myMemberId} open={chosen === place.name} onPress={() => setChosen(chosen === place.name ? null : place.name)} />}
          top={insets.top + 76}
          bottom={insets.bottom + 110}
          empty={none}
        />
      )}

      <GlassBar radius="sheet" style={{ position: 'absolute', top: insets.top + 2, left: 16, right: 16 }} contentStyle={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 6 }}>
        <RoundButton label={words.common.back} onPress={leave} icon={(c) => <ArrowLeft size={20} color={c} />} />
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Txt variant="callout" weight={800} accessibilityRole="header" numberOfLines={1}>
            {says.title}
          </Txt>
          {data ? (
            <Txt variant="small" weight={500} color="muted" numberOfLines={1}>
              {says.counts(data.places, data.countries)}
            </Txt>
          ) : null}
        </View>
        <RoundButton label={says.layers} onPress={() => say(words.library.notYet.map)} icon={(c) => <Layers size={20} color={c} />} />
      </GlassBar>

      <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: insets.bottom + 28, alignItems: 'center' }}>
        <Tap
          accessibilityRole="button"
          accessibilityLabel={says.backToWall}
          onPress={() => router.dismissTo(placeHref('library'))}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 18, borderRadius: radius.panel, backgroundColor: colors.text, boxShadow: shadow.md }}>
          <LayoutGrid size={18} color={colors.bg} />
          <Txt variant="callout" weight={800} style={{ color: colors.bg }}>
            {says.backToWall}
          </Txt>
        </Tap>
      </View>
      {toast}
    </View>
  );
}

type CardProps = { place: Place; circleId: string; myMemberId: string; open: boolean; onPress: () => void };

/** One place as a card: its cover with its count on it, how often you were there, its name and who took the photos. Open, its photos follow. */
function PlaceCard({ place, circleId, myMemberId, open, onPress }: CardProps) {
  const { colors, shadow } = useTheme();
  const count = place.count ?? 0;
  // Whoever is reading is "you", and comes last.
  const people = place.people ?? [];
  const names = [...people.filter((person) => person.memberId !== myMemberId).map((person) => firstName(person.name)), ...(people.some((person) => person.memberId === myMemberId) ? [says.you] : [])];
  return (
    <View style={{ marginBottom: 12, marginHorizontal: layout.barGutter, borderRadius: radius.panel, overflow: 'hidden', borderWidth: 3, borderColor: open ? colors.accent : colors.surface, backgroundColor: colors.surface, boxShadow: shadow.md }}>
      <Tap
        accessibilityRole="button"
        accessibilityLabel={says.place(place.name, count, open)}
        accessibilityState={{ expanded: open }}
        // Said this way, a browser hears whether it is open as well: the web takes no `accessibilityState`.
        aria-expanded={open}
        onPress={onPress}
        scaleTo={0.99}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 7, paddingLeft: 7, paddingRight: 11 }}>
        <Photo uri={place.coverUrl} radius="photo" style={{ width: 104, height: 104 }}>
          <View style={{ position: 'absolute', top: 6, right: 6, minWidth: 24, paddingVertical: 3, paddingHorizontal: 6, borderRadius: radius.tile, alignItems: 'center', backgroundColor: open ? colors.accent : colors.text }}>
            <Txt variant="tiny" weight={800} allowFontScaling={false} style={{ color: open ? colors.onAccent : colors.bg }}>
              {words.common.number(count)}
            </Txt>
          </View>
        </Photo>
        <View style={{ flex: 1 }}>
          <Eyebrow>{says.visits(place.visits ?? 1, formatDay(place.lastDay ?? ''))}</Eyebrow>
          <Txt variant="headline" weight={800} numberOfLines={1} style={{ marginTop: 3 }}>
            {place.name}
          </Txt>
          <Txt variant="caption" weight={500} color="muted" numberOfLines={3} style={{ marginTop: 4 }}>
            {says.from(place.photos ?? 0, place.videos ?? 0, names)}
          </Txt>
        </View>
        <View style={{ alignSelf: 'flex-start', marginTop: 4 }}>{open ? <ChevronDown size={20} color={colors.like} /> : <ChevronRight size={20} color={colors.like} />}</View>
      </Tap>
      {open ? <PlacePhotos circleId={circleId} place={place.name} /> : null}
    </View>
  );
}

/** The photos taken at one place, in the wall's rows, under its card. */
function PlacePhotos({ circleId, place }: { circleId: string; place: string }) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const wall = useGetWallInfinite(circleId, { place, limit: 24 }, { query: paged });
  const pages = wall.data;
  // The card's own width: the screen less its margins and its frame.
  const inner = width - 2 * layout.barGutter - 6;
  const data = useMemo(() => (pages ? photoRows(wallItems(rows(pages)), inner) : undefined), [pages, inner]);
  if (!data) {
    return (
      <View style={{ height: 120 }}>
        <Loading offline={wall.isPaused} />
      </View>
    );
  }
  return (
    <View style={{ paddingTop: 3 }}>
      {data.map((row) => (
        <WallPhotos key={row.key} row={row} onOpen={(item) => router.push(viewerHref(item, { place }))} />
      ))}
      <MoreButton pages={wall} />
    </View>
  );
}

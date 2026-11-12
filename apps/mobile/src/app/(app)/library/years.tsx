import { useLocalSearchParams, useRouter } from 'expo-router';
import { Heart, Search, Video } from 'lucide-react-native';
import { useState } from 'react';
import { ScrollView, useWindowDimensions, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useGetTimeline } from '@/api/generated/homeport';
import { useCircle } from '@/features/circles/current';
import { membersOf } from '@/features/circles/members';
import { type Narrow, viewerHref } from '@/features/library/narrow';
import { lastDayOf } from '@/features/library/wallRows';
import { PageProblem } from '@/features/states/PageProblem';
import { formatMonthName } from '@/lib/dates';
import { loadState } from '@/lib/loading';
import { firstName } from '@/lib/names';
import { layout, radius, useTheme } from '@/theme';
import { AppBar } from '@/ui/AppBar';
import { Avatar } from '@/ui/Avatar';
import { Chip } from '@/ui/Chip';
import { EmptyState } from '@/ui/EmptyState';
import { Loading } from '@/ui/Loading';
import { Tap } from '@/ui/Motion';
import { Photo } from '@/ui/Photo';
import { RoundButton } from '@/ui/RoundButton';
import { Sheet, SheetRow } from '@/ui/Sheet';
import { Sk } from '@/ui/Skeleton';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

/** How many small pictures a month shows: two rows of eight. */
const TILES = 16;
const ACROSS = 8;
const GAP = 2;

/** What the chips narrow the year to: one person's, the videos, or what you love. */
type Only = { by: string } | 'videos' | 'loved' | null;

/**
 * 6.2 Pinch out to a year: one year of the wall, month by month, each with its newest pictures in a small
 * grid. The chips narrow it to what one person added, to videos or to what you love. A month's line shows
 * that month on the wall; the year at the top offers the other years. (On a phone, pinching steps between
 * days, months and years; the hint at the bottom says so.)
 */
export default function Years() {
  const { colors, shadow } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const circle = useCircle();
  const params = useLocalSearchParams<{ year?: string }>();
  const asked = params.year && /^\d{4}$/.test(params.year) ? Number(params.year) : undefined;
  const [only, setOnly] = useState<Only>(null);
  const [choosingYear, setChoosingYear] = useState(false);
  const says = words.library.years;

  const narrow: Narrow = only === 'videos' ? { kind: 'video' } : only === 'loved' ? { loved: true } : only ? { by: only.by } : {};
  const timeline = useGetTimeline(circle.id, { ...narrow, year: asked, tiles: TILES });
  const load = loadState(timeline);
  const data = timeline.data;
  const year = data?.year ?? asked ?? null;
  const counted = data?.years.find((one) => one.year === year);
  const people = membersOf(circle).filter((member) => member.kind !== 'pet');
  // Eight across with seven gaps of two between them.
  const side = (width - GAP * (ACROSS - 1)) / ACROSS - 0.01;

  const bar = (
    <AppBar
      center={
        year ? (
          <Tap accessibilityRole="button" accessibilityLabel={says.choose(year)} onPress={() => setChoosingYear(true)} style={{ alignItems: 'center' }}>
            <Txt variant="subheading" accessibilityRole="header" numberOfLines={1}>
              {year}
            </Txt>
            {counted ? (
              <Txt variant="small" color="muted" numberOfLines={1}>
                {says.counts(counted.photos ?? 0, counted.videos ?? 0)}
              </Txt>
            ) : null}
          </Tap>
        ) : undefined
      }
      trailing={<RoundButton label={says.search} onPress={() => router.push({ pathname: '/search', params: { place: 'library' } })} icon={(c) => <Search size={20} color={c} />} />}
    />
  );

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      {bar}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: layout.barGutter }} style={{ flexGrow: 0 }}>
        <Chip tone="filter" label={says.everyone} selected={only === null} onPress={() => setOnly(null)} />
        {people.map((member) => {
          const on = only !== null && typeof only === 'object' && only.by === member.id;
          return (
            <Chip
              key={member.id}
              tone="filter"
              label={member.id === circle.myMemberId ? says.byYou : says.by(firstName(member.name))}
              selected={on}
              icon={<Avatar uri={member.avatarUrl} name={member.name} size={20} />}
              onPress={() => setOnly(on ? null : { by: member.id })}
            />
          );
        })}
        <Chip tone="filter" label={says.videos} selected={only === 'videos'} icon={<Video size={15} color={only === 'videos' ? colors.bg : colors.text} />} onPress={() => setOnly(only === 'videos' ? null : 'videos')} />
        <Chip tone="filter" label={says.loved} selected={only === 'loved'} icon={<Heart size={15} color={only === 'loved' ? colors.bg : colors.text} />} onPress={() => setOnly(only === 'loved' ? null : 'loved')} />
      </ScrollView>

      {load.error ? (
        <PageProblem error={load.error} onRetry={load.retry} retrying={load.retrying} />
      ) : !data ? (
        load.offline ? (
          <Loading offline />
        ) : (
          <YearSkeleton />
        )
      ) : data.months.length === 0 ? (
        <View style={{ flex: 1, justifyContent: 'center', paddingBottom: 120 }}>
          <EmptyState emoji="📷" title={says.none.title} body={says.none.body} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingTop: 8, paddingBottom: insets.bottom + 110 }} showsVerticalScrollIndicator={false}>
          {data.months.map((month) => {
            const name = formatMonthName(month.month ?? '');
            const count = (month.photos ?? 0) + (month.videos ?? 0);
            return (
              <View key={month.month} style={{ paddingBottom: 12 }}>
                <Tap
                  accessibilityRole="button"
                  accessibilityLabel={says.month(name, count)}
                  onPress={() => router.dismissTo({ pathname: '/', params: { place: 'library', until: lastDayOf(month.month ?? '') } })}
                  scaleTo={0.99}
                  style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, paddingVertical: 8, paddingHorizontal: layout.barGutter }}>
                  <Txt variant="subheading">{name}</Txt>
                  <Txt variant="footnote" color="muted">
                    {says.count(count)}
                  </Txt>
                </Tap>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GAP }}>
                  {(month.tiles ?? []).map((tile) =>
                    tile.id ? (
                      <Tap
                        key={tile.id}
                        accessibilityRole="button"
                        accessibilityLabel={says.tile(tile.kind === 'video', name)}
                        onPress={() => router.push(viewerHref({ id: tile.id ?? '', kind: tile.kind }, narrow))}
                        scaleTo={0.95}
                        style={{ width: side, height: side }}>
                        <Photo uri={tile.thumbUrl} radius="none" style={{ flex: 1 }} />
                      </Tap>
                    ) : null,
                  )}
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* The hint, as drawn: where a phone's two fingers step between days, months and years. */}
      {data && data.months.length > 0 ? (
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: insets.bottom + 40, alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 11, paddingHorizontal: 16, borderRadius: radius.cardLarge, backgroundColor: colors.text, boxShadow: shadow.md }}>
            <Search size={18} color={colors.bg} />
            <Txt variant="note" weight={700} style={{ color: colors.bg }}>
              {says.pinch}
            </Txt>
          </View>
        </View>
      ) : null}

      <Sheet visible={choosingYear} onClose={() => setChoosingYear(false)} title={says.title}>
        {(data?.years ?? []).map((one, index) => (
          <SheetRow
            key={one.year ?? index}
            first={index === 0}
            label={String(one.year ?? '')}
            note={says.counts(one.photos ?? 0, one.videos ?? 0)}
            onPress={() => {
              setChoosingYear(false);
              router.setParams({ year: String(one.year ?? '') });
            }}
          />
        ))}
      </Sheet>
    </SafeAreaView>
  );
}

/** A year on its way: two months of grey tiles. */
function YearSkeleton() {
  return (
    <View accessibilityLabel={words.states.loading} style={{ paddingTop: 16 }}>
      {[0, 1].map((month) => (
        <View key={month} style={{ paddingBottom: 20 }}>
          <Sk width={130} height={18} style={{ marginLeft: layout.barGutter, marginBottom: 10 }} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 2 }}>
            {Array.from({ length: TILES }, (_, index) => (
              <Sk key={index} width="12%" height={46} radius="none" />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

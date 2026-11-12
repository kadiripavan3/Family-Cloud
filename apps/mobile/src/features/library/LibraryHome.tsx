import { useLocalSearchParams, useRouter } from 'expo-router';
import { File, Layers, LayoutGrid, Map as MapIcon, Users } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { ScrollView, useWindowDimensions, View } from 'react-native';

import { messageFor } from '@/api/fetcher';
import { type PersonLens, useGetLenses, useGetTimeline, useGetWallInfinite } from '@/api/generated/homeport';
import { more, paged, rows } from '@/api/pages';
import { useCircle } from '@/features/circles/current';
import { TAB_BAR_ROOM } from '@/features/home/places';
import { formatDay } from '@/lib/dates';
import { loadState } from '@/lib/loading';
import { firstName } from '@/lib/names';
import { layout, useTheme } from '@/theme';
import { Avatar } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { Chip } from '@/ui/Chip';
import { EmptyState } from '@/ui/EmptyState';
import { List } from '@/ui/List';
import { Loading } from '@/ui/Loading';
import { Tap } from '@/ui/Motion';
import { Problem } from '@/ui/Problem';
import { Sheet, SheetRow } from '@/ui/Sheet';
import { Sk } from '@/ui/Skeleton';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

import { selectHref, viewerHref } from './narrow';
import { wallItems } from './types';
import { dayOf, type DayRow, WALL_GAP, wallRows, type WallRow } from './wallRows';
import { WallPhotos } from './WallRows';
import { MonthsSheet, YearStrip } from './YearStrip';

/** How many photos a page of the wall brings. */
const PAGE = 60;

/**
 * 6.1 The wall: Library on Home, under the row of six places. Every photo and video the person may see in
 * this circle, edge to edge, newest first. A day that several people photographed is one moment, named by
 * its place; its line opens the moment. The chips lead to the other ways of looking (albums, the people in
 * photos, places, files), and the strip at the side jumps to a year. Pressing and holding a photo starts
 * selecting.
 */
export function LibraryHome() {
  const { colors } = useTheme();
  const router = useRouter();
  const circle = useCircle();
  const { width } = useWindowDimensions();
  // Where the wall starts is part of the address, so the years page (and the strip) can send it there.
  const until = useLocalSearchParams<{ until?: string }>().until || undefined;
  // Narrowed to the photos one person is in: chosen from the People chip.
  const [person, setPerson] = useState<PersonLens | null>(null);
  const [choosingPerson, setChoosingPerson] = useState(false);
  const [choosingMonth, setChoosingMonth] = useState(false);
  // The day of the row at the top of the screen: the month in the bubble and the year lit in the strip follow it.
  const [topDay, setTopDay] = useState<string | null>(null);

  const narrow = useMemo(() => (person?.memberId ? { about: person.memberId } : {}), [person]);
  const wall = useGetWallInfinite(circle.id, { ...narrow, until, limit: PAGE }, { query: paged });
  const lenses = useGetLenses(circle.id);
  const timeline = useGetTimeline(circle.id, { ...narrow, tiles: 0 });
  const load = loadState(wall);

  const pages = wall.data;
  const data = useMemo(() => wallRows(wallItems(rows(pages)), pages?.pages.flatMap((page) => page.moments) ?? [], width), [pages, width]);

  const years = (timeline.data?.years ?? []).flatMap((one) => (one.year === undefined ? [] : [one.year]));
  const firstDay = data[0]?.type === 'day' ? data[0].day : null;
  const shownDay = topDay ?? firstDay;
  const shownYear = shownDay ? Number(shownDay.slice(0, 4)) : (years[0] ?? null);
  const jumpTo = (day: string | undefined) => {
    setTopDay(null);
    router.setParams({ until: day });
  };
  const people = lenses.data?.people ?? [];

  const chips = (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: layout.barGutter }} style={{ flexGrow: 0, marginTop: 12 }}>
      <Chip tone="filter" label={words.library.wall.lens.wall} selected={!person} icon={<LayoutGrid size={15} color={person ? colors.text : colors.bg} />} onPress={() => setPerson(null)} />
      <Chip tone="filter" label={words.library.wall.lens.albums} icon={<Layers size={15} color={colors.text} />} onPress={() => router.push('/library/albums')} />
      <Chip
        tone="filter"
        label={person ? firstName(person.name) : words.library.wall.lens.people}
        selected={!!person}
        icon={person ? <Avatar uri={person.avatarUrl} name={person.name ?? ''} size={20} /> : <Users size={15} color={colors.text} />}
        onPress={() => setChoosingPerson(true)}
      />
      <Chip tone="filter" label={words.library.wall.lens.places} icon={<MapIcon size={15} color={colors.text} />} onPress={() => router.push('/library/places')} />
      <Chip tone="filter" label={words.library.wall.lens.files} icon={<File size={15} color={colors.text} />} onPress={() => router.push('/library/files')} />
    </ScrollView>
  );

  const sheets = (
    <>
      <Sheet visible={choosingPerson} onClose={() => setChoosingPerson(false)} title={words.library.wall.people.title} subtitle={words.library.wall.people.note}>
        {people.length === 0 ? (
          <Txt variant="bodySmall" color="muted" style={{ paddingHorizontal: layout.gutter, paddingVertical: 16 }}>
            {words.library.wall.people.none}
          </Txt>
        ) : (
          people.map((one, index) => (
            <SheetRow
              key={one.memberId ?? index}
              first={index === 0}
              icon={() => <Avatar uri={one.avatarUrl} name={one.name ?? ''} size={40} />}
              label={one.name ?? ''}
              note={words.library.wall.people.count(one.count ?? 0)}
              onPress={() => {
                setPerson(one);
                setChoosingPerson(false);
                jumpTo(undefined);
              }}
            />
          ))
        )}
      </Sheet>
      {shownYear ? (
        <MonthsSheet
          circleId={circle.id}
          narrow={narrow}
          year={shownYear}
          visible={choosingMonth}
          onClose={() => setChoosingMonth(false)}
          onJump={(day) => {
            setChoosingMonth(false);
            jumpTo(day);
          }}
          onSeeYear={() => {
            setChoosingMonth(false);
            router.push({ pathname: '/library/years', params: { year: String(shownYear) } });
          }}
        />
      ) : null}
    </>
  );

  if (load.error) {
    return (
      <View style={{ flex: 1 }}>
        {chips}
        <Problem message={messageFor(load.error)} onRetry={load.retry} retrying={load.retrying} />
        {sheets}
      </View>
    );
  }
  if (!pages) {
    return (
      <View style={{ flex: 1 }}>
        {chips}
        {load.offline ? <Loading offline /> : <WallSkeleton />}
      </View>
    );
  }

  const header = (day: DayRow) => {
    const moment = day.moment;
    const title = moment?.title ?? formatDay(day.day);
    const line = words.common.join([
      formatDay(day.day),
      moment?.placeName,
      moment ? (moment.shared ? words.library.wall.from(moment.total, moment.people.length) : words.library.counts(moment.photos, moment.videos)) : null,
    ]);
    return (
      <Tap
        accessibilityRole="button"
        accessibilityLabel={words.library.wall.openMoment(title, line)}
        onPress={() => router.push({ pathname: '/library/moment/[id]', params: { id: day.first.id } })}
        scaleTo={0.99}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingTop: 14, paddingBottom: 9, paddingHorizontal: layout.barGutter }}>
        <View style={{ flex: 1 }}>
          <Txt variant="subheading" numberOfLines={1}>
            {title}
          </Txt>
          <Txt variant="footnote" color="muted" numberOfLines={1}>
            {line}
          </Txt>
        </View>
        {moment?.shared ? (
          <View style={{ flexDirection: 'row' }}>
            {moment.people.slice(0, 3).map((one, index) => (
              <View key={one.memberId ?? index} style={{ marginLeft: index === 0 ? 0 : -8 }}>
                <Avatar uri={one.avatarUrl} name={one.name ?? ''} size={22} ring={colors.surface} />
              </View>
            ))}
          </View>
        ) : null}
      </Tap>
    );
  };

  const none = (
    <View style={{ paddingTop: 56 }}>
      {person ? (
        <EmptyState emoji="📷" title={words.library.wall.noneOf.title(firstName(person.name))} body={words.library.wall.noneOf.body} />
      ) : (
        <EmptyState emoji="📷" title={words.library.wall.none.title} body={words.library.wall.none.body} action={<Button label={words.library.wall.none.add} inline onPress={() => router.push('/new/photos')} />} />
      )}
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      <List<WallRow>
        // A jump is another wall: it opens at its own top.
        key={`${until ?? 'newest'}-${person?.memberId ?? 'all'}`}
        data={data}
        keyOf={(row) => row.key}
        typeOf={(row) => row.type}
        row={(row) => (row.type === 'day' ? header(row) : <WallPhotos row={row} onOpen={(item) => router.push(viewerHref(item, narrow))} onHold={(item) => router.push(selectHref(narrow, item.id))} />)}
        header={chips}
        empty={none}
        bottom={TAB_BAR_ROOM}
        loadingMore={wall.isFetchingNextPage}
        refreshing={wall.isRefetching && !wall.isFetchingNextPage}
        onRefresh={() => void wall.refetch()}
        onTop={(row) => setTopDay(row.type === 'day' ? row.day : dayOf(row.cells[0]!.item))}
        {...more(wall)}
      />
      {data.length > 0 && shownDay && shownYear ? (
        <YearStrip years={years} year={shownYear} month={shownDay.slice(0, 7)} onYear={(year) => jumpTo(year === years[0] ? undefined : `${year}-12-31`)} onMonth={() => setChoosingMonth(true)} />
      ) : null}
      {sheets}
    </View>
  );
}

/** The wall on its way: a day's line and rows of grey tiles in the wall's own rhythm. */
function WallSkeleton() {
  return (
    <View accessibilityLabel={words.states.loading} style={{ flex: 1 }}>
      <View style={{ gap: 6, paddingTop: 16, paddingBottom: 10, paddingHorizontal: layout.barGutter }}>
        <Sk width={190} height={18} />
        <Sk width={150} height={12} />
      </View>
      {[150, 104, 128].map((height, index) => (
        <View key={height} style={{ flexDirection: 'row', gap: WALL_GAP, marginBottom: WALL_GAP }}>
          <Sk height={height} radius="none" style={{ flex: index === 0 ? 1.5 : 1 }} />
          <Sk height={height} radius="none" style={{ flex: index === 2 ? 1.45 : 1 }} />
          {index === 1 ? <Sk height={height} radius="none" style={{ flex: 1.3 }} /> : null}
        </View>
      ))}
    </View>
  );
}

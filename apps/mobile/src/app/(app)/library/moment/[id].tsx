import { useMutation } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ellipsis, Images, ListChecks, Route, Sparkle, Users } from 'lucide-react-native';
import { useMemo, useRef, useState } from 'react';
import { ScrollView, useWindowDimensions, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCache } from '@/api/cache';
import { messageFor } from '@/api/fetcher';
import { createAlbum, type MomentResponse, useGetMoment, useGetWallInfinite } from '@/api/generated/homeport';
import { more, paged, rows } from '@/api/pages';
import { selectHref, viewerHref } from '@/features/library/narrow';
import { tellHref } from '@/features/journeyLink/tell/start';
import { useToast } from '@/features/library/Toast';
import { wallItems } from '@/features/library/types';
import { MOMENT_SHAPES, type PhotoRow, photoRows } from '@/features/library/wallRows';
import { WallPhotos } from '@/features/library/WallRows';
import { AudienceChip } from '@/features/sharing/AudienceChip';
import { NotFound } from '@/features/states/NotFound';
import { PageProblem } from '@/features/states/PageProblem';
import { looksLikeId, thingHref } from '@/features/things/open';
import { formatWeekdayPast } from '@/lib/dates';
import { newClientId } from '@/lib/ids';
import { loadState } from '@/lib/loading';
import { firstName } from '@/lib/names';
import { layout, radius, useTheme } from '@/theme';
import { AppBar } from '@/ui/AppBar';
import { Avatar } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { Chip } from '@/ui/Chip';
import { Eyebrow } from '@/ui/Eyebrow';
import { GlassBar } from '@/ui/GlassBar';
import { List } from '@/ui/List';
import { Loading } from '@/ui/Loading';
import { NoteBox } from '@/ui/NoteBox';
import { RoundButton } from '@/ui/RoundButton';
import { Sheet, SheetRow } from '@/ui/Sheet';
import { Sk } from '@/ui/Skeleton';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

/**
 * 6.3 A moment: what was taken on one day at one place, by everyone in the circle who was there, put
 * together by itself. The chips show one person's photos; each photo carries who added it. From here it
 * becomes an album (all of it that you may see), or the draft of a journey to tell in Journey (10.5).
 * The address carries any one of its photos' ids.
 */
export default function Moment() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const router = useRouter();
  const cache = useCache();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const says = words.library.moment;
  const isThing = looksLikeId(id);
  // Narrowed to what one person added.
  const [by, setBy] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const { say, toast } = useToast(insets.bottom + 108);
  const draft = useRef(newClientId());

  const asked = useGetMoment(id, { query: { enabled: isThing } });
  const moment = asked.data;
  const wall = useGetWallInfinite(moment?.circleId ?? '', { moment: id, by: by ?? undefined, limit: 60 }, { query: { ...paged, enabled: !!moment } });
  const load = loadState(asked, wall);
  const pages = wall.data;
  const data = useMemo(() => (pages ? photoRows(wallItems(rows(pages)), width, MOMENT_SHAPES) : undefined), [pages, width]);

  const album = useMutation({
    mutationFn: (from: MomentResponse) => createAlbum({ clientId: draft.current, circleId: from.circleId, title: from.title, momentOf: from.id }),
    onSuccess: async (made) => {
      draft.current = newClientId();
      await cache.albumMade(made);
      router.push(thingHref({ kind: 'album', id: made.id }));
    },
    onError: (error) => say(messageFor(error)),
  });

  if (!isThing) return <NotFound />;

  const bar = (
    <AppBar
      trailing={
        moment ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <MomentChip moment={moment} />
            <RoundButton label={words.library.more} onPress={() => setMenu(true)} icon={(c) => <Ellipsis size={20} color={c} />} />
          </View>
        ) : undefined
      }
    />
  );

  if (load.error || !moment) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
        {bar}
        {load.error ? <PageProblem error={load.error} onRetry={load.retry} retrying={load.retrying} /> : load.offline ? <Loading offline /> : <MomentSkeleton />}
      </SafeAreaView>
    );
  }

  const withYou = moment.people.some((person) => person.you);
  const head = (
    <View>
      <View style={{ marginHorizontal: layout.rowGutter, marginBottom: 12 }}>
        <Eyebrow>{words.common.join([formatWeekdayPast(moment.day), moment.placeName])}</Eyebrow>
        <Txt variant="heading" accessibilityRole="header" style={{ marginTop: 4 }}>
          {moment.title}
        </Txt>
      </View>
      {moment.shared ? (
        <NoteBox soft icon={(c) => <Sparkle size={20} color={c} />} title={says.together(moment.people.length, withYou)} style={{ marginHorizontal: layout.barGutter }}>
          {says.gathered(
            moment.photos,
            moment.videos,
            moment.people.map((person) => firstName(person.name)),
          )}
        </NoteBox>
      ) : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: layout.barGutter }} style={{ flexGrow: 0, marginVertical: 12 }}>
        <Chip tone="filter" label={says.all(moment.total)} selected={by === null} onPress={() => setBy(null)} />
        {moment.shared
          ? moment.people.map((person, index) => (
              <Chip
                key={person.memberId ?? index}
                tone="filter"
                label={person.you ? says.you : firstName(person.name)}
                count={person.count}
                selected={by === person.memberId}
                icon={<Avatar uri={person.avatarUrl} name={person.name ?? ''} size={20} />}
                onPress={() => setBy(by === person.memberId ? null : (person.memberId ?? null))}
              />
            ))
          : null}
      </ScrollView>
    </View>
  );

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      {bar}
      <List<PhotoRow>
        data={data ?? []}
        keyOf={(row) => row.key}
        row={(row) => <WallPhotos row={row} who={moment.shared} onOpen={(item) => router.push(viewerHref(item, { moment: id, by: by ?? undefined }))} onHold={(item) => router.push(selectHref({ moment: id, by: by ?? undefined }, item.id))} />}
        header={head}
        footer={data ? null : <Loading offline={wall.isPaused} />}
        bottom={insets.bottom + 120}
        loadingMore={wall.isFetchingNextPage}
        {...more(wall)}
      />

      <GlassBar radius="sheet" style={{ position: 'absolute', left: 12, right: 12, bottom: Math.max(insets.bottom, 24) }} contentStyle={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingLeft: 20, paddingRight: 10 }}>
        <View style={{ flex: 1 }}>
          <Txt variant="item" weight={800} numberOfLines={1}>
            {says.turnInto.title}
          </Txt>
          <Txt variant="footnote" color="muted" numberOfLines={1}>
            {says.turnInto.note}
          </Txt>
        </View>
        <Button label={says.turnInto.album} size="sm" variant="soft" inline loading={album.isPending} onPress={() => album.mutate(moment)} />
        <Button label={says.turnInto.journey} size="sm" inline icon={(c) => <Route size={16} color={c} />} onPress={() => router.push(tellHref({ moment: id, circleId: moment.circleId }))} />
      </GlassBar>
      {toast}

      <Sheet visible={menu} onClose={() => setMenu(false)} title={moment.title}>
        <SheetRow
          first
          icon={(c) => <ListChecks size={22} color={c} />}
          label={says.menu.select}
          onPress={() => {
            setMenu(false);
            router.push(selectHref({ moment: id, by: by ?? undefined }));
          }}
        />
        <SheetRow
          icon={(c) => <Images size={22} color={c} />}
          label={says.menu.album}
          onPress={() => {
            setMenu(false);
            album.mutate(moment);
          }}
        />
      </Sheet>
    </SafeAreaView>
  );
}

/**
 * Who sees a moment, in the look of the audience chip: everyone when all of it is shared with everyone,
 * only you when none is. A moment is many things, so the chip only says; who sees each photo is changed
 * on the photo, or for many at once after selecting them.
 */
function MomentChip({ moment }: { moment: MomentResponse }) {
  const { colors } = useTheme();
  if (moment.audience !== 'some') return <AudienceChip quiet thing={{ circleId: moment.circleId, chip: { audience: moment.audience, people: [], hiddenFrom: [] } }} />;
  const label = words.library.moment.partly;
  return (
    <View accessible accessibilityLabel={words.sharing.chip.spokenQuiet(label)} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 26, paddingLeft: 7, paddingRight: 9, borderRadius: radius.pill, backgroundColor: colors.fill }}>
      <Users size={13} color={colors.text} />
      <Txt variant="small" weight={700} numberOfLines={1}>
        {label}
      </Txt>
    </View>
  );
}

/** A moment on its way: its name, and rows of grey tiles. */
function MomentSkeleton() {
  return (
    <View accessibilityLabel={words.states.loading} style={{ flex: 1 }}>
      <View style={{ gap: 8, marginHorizontal: layout.rowGutter, marginBottom: 16 }}>
        <Sk width={150} height={12} />
        <Sk width={260} height={30} />
      </View>
      <Sk height={72} radius="photo" style={{ marginHorizontal: layout.barGutter, marginBottom: 16 }} />
      {[138, 100].map((height) => (
        <View key={height} style={{ flexDirection: 'row', gap: 3, marginBottom: 3 }}>
          <Sk height={height} radius="none" style={{ flex: 1.5 }} />
          <Sk height={height} radius="none" style={{ flex: 1 }} />
        </View>
      ))}
    </View>
  );
}

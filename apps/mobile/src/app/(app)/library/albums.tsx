import { useRouter } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { type AlbumResponse, type AlbumTab, useGetAlbumsInfinite, useGetLenses } from '@/api/generated/homeport';
import { more, paged, rows } from '@/api/pages';
import { useCircle } from '@/features/circles/current';
import { AlbumCard } from '@/features/library/AlbumCard';
import { NewAlbumSheet } from '@/features/library/NewAlbumSheet';
import { PageProblem } from '@/features/states/PageProblem';
import { thingHref } from '@/features/things/open';
import { loadState } from '@/lib/loading';
import { layout, useTheme } from '@/theme';
import { AppBar } from '@/ui/AppBar';
import { Button } from '@/ui/Button';
import { EmptyState } from '@/ui/EmptyState';
import { List } from '@/ui/List';
import { Loading } from '@/ui/Loading';
import { RoundButton } from '@/ui/RoundButton';
import { Sk } from '@/ui/Skeleton';
import { WordTabs } from '@/ui/WordTabs';
import { words } from '@/words';

/**
 * 6.5 Albums: the ones shared with the circle, the ones only you can see, and the ones that came home from
 * Journey, as three tabs with their counts. An album that fills itself (every photo of Mia, every photo of
 * the dog) says so on its cover. The + makes one, by hand or self-filling.
 */
export default function Albums() {
  const { colors } = useTheme();
  const router = useRouter();
  const circle = useCircle();
  const says = words.library.albums;
  const [tab, setTab] = useState<AlbumTab>('shared');
  const [making, setMaking] = useState(false);

  const lenses = useGetLenses(circle.id);
  const albums = useGetAlbumsInfinite(circle.id, { tab }, { query: paged });
  const load = loadState(albums);
  const data = rows(albums.data);
  const counts = lenses.data?.albums;
  const open = (album: AlbumResponse) => router.push(thingHref({ kind: 'album', id: album.id }));

  const none = (
    <View style={{ paddingTop: 56 }}>
      <EmptyState emoji="📷" title={says.none[tab].title} body={says.none[tab].body} action={tab === 'journey' ? <Button label={words.together.kept.add} onPress={() => router.push('/journey/keep')} /> : undefined} />
    </View>
  );

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar title={says.title} trailing={<RoundButton label={says.add} onPress={() => setMaking(true)} icon={(c) => <Plus size={20} color={c} />} />} />
      <WordTabs
        tabs={[
          { id: 'shared', label: says.tabs.shared, count: counts?.shared },
          { id: 'mine', label: says.tabs.mine, count: counts?.onlyYou },
          { id: 'journey', label: says.tabs.journey, count: counts?.fromJourney },
        ]}
        value={tab}
        onChange={setTab}
      />
      {load.error ? (
        <PageProblem error={load.error} onRetry={load.retry} retrying={load.retrying} />
      ) : !data ? (
        load.offline ? (
          <Loading offline />
        ) : (
          <View accessibilityLabel={words.states.loading} style={{ flexDirection: 'row', gap: 12, marginTop: 14, marginHorizontal: layout.barGutter }}>
            <Sk height={172} radius="card" style={{ flex: 1 }} />
            <Sk height={172} radius="card" style={{ flex: 1 }} />
          </View>
        )
      ) : (
        <List
          // Each tab is its own list, opened at its own top.
          key={tab}
          data={data}
          columns={2}
          keyOf={(album) => album.id}
          row={(album, index) => (
            <View style={{ paddingLeft: index % 2 === 0 ? layout.barGutter : 6, paddingRight: index % 2 === 0 ? 6 : layout.barGutter, paddingBottom: 14 }}>
              <AlbumCard album={album} onPress={() => open(album)} />
            </View>
          )}
          top={14}
          empty={none}
          loadingMore={albums.isFetchingNextPage}
          {...more(albums)}
        />
      )}
      <NewAlbumSheet
        circle={circle}
        visible={making}
        onClose={() => setMaking(false)}
        onMade={(album) => {
          setMaking(false);
          open(album);
        }}
      />
    </SafeAreaView>
  );
}

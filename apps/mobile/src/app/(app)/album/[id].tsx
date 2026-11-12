import { useMutation } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ellipsis, ImagePlus, ListChecks, Pencil, Sparkle, Trash2 } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCache } from '@/api/cache';
import { messageFor } from '@/api/fetcher';
import { type AlbumResponse, changeAlbum, deleteThing, type DocumentCard, useGetAlbum, useGetFilesInfinite, useGetWallInfinite } from '@/api/generated/homeport';
import { more, paged, rows } from '@/api/pages';
import { albumRest } from '@/features/library/AlbumCard';
import { takesByHand } from '@/features/library/AlbumPickSheet';
import { DocRow } from '@/features/library/DocRow';
import { selectHref, viewerHref } from '@/features/library/narrow';
import { wallItems } from '@/features/library/types';
import { type PhotoRow, photoRows } from '@/features/library/wallRows';
import { WallPhotos } from '@/features/library/WallRows';
import { useLeave } from '@/features/navigation/useLeave';
import { AudienceChip } from '@/features/sharing/AudienceChip';
import { NotFound } from '@/features/states/NotFound';
import { PageProblem } from '@/features/states/PageProblem';
import { looksLikeId, thingHref } from '@/features/things/open';
import { today } from '@/lib/dates';
import { loadState } from '@/lib/loading';
import { firstName } from '@/lib/names';
import { layout, useTheme } from '@/theme';
import { AppBar } from '@/ui/AppBar';
import { Button } from '@/ui/Button';
import { ConfirmSheet } from '@/ui/ConfirmSheet';
import { EmptyState } from '@/ui/EmptyState';
import { Field } from '@/ui/Field';
import { List } from '@/ui/List';
import { Loading } from '@/ui/Loading';
import { Pill } from '@/ui/Pill';
import { RoundButton } from '@/ui/RoundButton';
import { Sheet, SheetRow } from '@/ui/Sheet';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

const says = words.library.album;
type Open = 'menu' | 'rename' | 'delete' | null;

/**
 * An album's own page: `/album/<id>`, where a thing of the kind `album` opens from any list. Its photos and
 * videos in the wall's rows, who can see it, and under the three dots adding to it, selecting in it,
 * renaming and deleting it. An album that fills itself says how; nothing is put into it by hand. A folder
 * of files is an album too, and shows its files as rows.
 */
export default function Album() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const router = useRouter();
  const leave = useLeave();
  const cache = useCache();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isThing = looksLikeId(id);
  const [open, setOpen] = useState<Open>(null);
  // Deleted a moment ago: nothing more is asked about it while the screen closes.
  const [gone, setGone] = useState(false);

  const asked = useGetAlbum(id, { query: { enabled: isThing && !gone } });
  const album = asked.data;
  const circleId = album?.circleId ?? '';
  const wall = useGetWallInfinite(circleId, { album: id, limit: 60 }, { query: { ...paged, enabled: !!album && !album.folder && !gone } });
  const files = useGetFilesInfinite(circleId, { folder: id, day: today() }, { query: { ...paged, enabled: !!album && album.folder && !gone } });
  const load = loadState(asked, album?.folder ? files : wall);
  const pages = wall.data;
  const photos = useMemo(() => (pages ? photoRows(wallItems(rows(pages)), width) : undefined), [pages, width]);
  const documents = rows(files.data)?.filter((one): one is DocumentCard & { id: string } => typeof one.id === 'string');

  const remove = useMutation({
    mutationFn: () => deleteThing(id),
    onSuccess: () => {
      setOpen(null);
      setGone(true);
    },
  });
  // What was in it is one of the circle's lists: it is told only once this screen has stopped asking for it.
  useEffect(() => {
    if (!gone) return;
    leave();
    void cache.thingDeleted({ id, circleId });
  }, [gone, leave, cache, id, circleId]);

  if (!isThing) return <NotFound />;
  const bar = (
    <AppBar
      title={album?.title ?? ''}
      subtitle={album ? words.common.join([album.folder ? says.files(album.count) : says.things(album.count), album.folder ? null : albumRest(album)]) : undefined}
      trailing={album ? <RoundButton label={words.library.more} onPress={() => setOpen('menu')} icon={(c) => <Ellipsis size={20} color={c} />} /> : <View style={{ width: 40 }} />}
    />
  );
  if (load.error || !album) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
        {bar}
        {load.error ? <PageProblem error={load.error} onRetry={load.retry} retrying={load.retrying} /> : <Loading offline={load.offline} />}
      </SafeAreaView>
    );
  }

  const byHand = takesByHand(album);
  const person = album.origin === 'person' ? firstName(album.person?.name) : null;
  const addPhotos = () => router.push({ pathname: '/library/select', params: { into: album.id } });
  const head = (
    <View style={{ gap: 10, paddingTop: 2, paddingBottom: 12, paddingHorizontal: layout.barGutter }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <AudienceChip thing={album} />
        {person ? <Pill label={words.library.albums.fills} icon={(c) => <Sparkle size={12} color={c} />} style={{ backgroundColor: colors.fill }} /> : null}
      </View>
      {person ? (
        <Txt variant="footnote" color="muted">
          {says.fillsNote(person)}
        </Txt>
      ) : null}
    </View>
  );
  const none = album.folder ? says.noneFolder : person ? says.noneFills(person) : says.none;
  const empty = (
    <View style={{ paddingTop: 48 }}>
      <EmptyState emoji={album.folder ? '📄' : '📷'} title={none.title} body={none.body} action={byHand ? <Button label={says.none.add} inline onPress={addPhotos} /> : undefined} />
    </View>
  );

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      {bar}
      {album.folder ? (
        !documents ? (
          <Loading offline={files.isPaused} />
        ) : (
          <List
            data={documents}
            keyOf={(document) => document.id}
            row={(document) => <DocRow document={document} onPress={() => router.push(thingHref({ kind: 'document', id: document.id }))} />}
            header={head}
            empty={empty}
            bottom={insets.bottom + 40}
            loadingMore={files.isFetchingNextPage}
            {...more(files)}
          />
        )
      ) : !photos ? (
        <Loading offline={wall.isPaused} />
      ) : (
        <List<PhotoRow>
          data={photos}
          keyOf={(row) => row.key}
          row={(row) => <WallPhotos row={row} onOpen={(item) => router.push(viewerHref(item, { album: id }))} onHold={(item) => router.push(selectHref({ album: id }, item.id))} />}
          header={head}
          empty={empty}
          bottom={insets.bottom + 40}
          loadingMore={wall.isFetchingNextPage}
          {...more(wall)}
        />
      )}

      <Sheet visible={open === 'menu'} onClose={() => setOpen(null)} title={album.title}>
        {byHand ? (
          <SheetRow
            first
            icon={(c) => <ImagePlus size={22} color={c} />}
            label={says.menu.add}
            onPress={() => {
              setOpen(null);
              addPhotos();
            }}
          />
        ) : null}
        {album.folder ? null : (
          <SheetRow
            first={!byHand}
            icon={(c) => <ListChecks size={22} color={c} />}
            label={says.menu.select}
            onPress={() => {
              setOpen(null);
              router.push(selectHref({ album: id }));
            }}
          />
        )}
        {album.canEdit ? <SheetRow first={album.folder && !byHand} icon={(c) => <Pencil size={22} color={c} />} label={says.menu.rename} onPress={() => setOpen('rename')} /> : null}
        {album.mine ? <SheetRow danger icon={(c) => <Trash2 size={22} color={c} />} label={album.folder ? says.menu.deleteFolder : says.menu.delete} onPress={() => setOpen('delete')} /> : null}
      </Sheet>
      <RenameSheet album={album} visible={open === 'rename'} onClose={() => setOpen(null)} />
      <ConfirmSheet
        visible={open === 'delete'}
        onClose={() => setOpen(null)}
        title={album.folder ? says.deleteAsk.folder : says.deleteAsk.title}
        body={says.deleteAsk.body}
        confirm={album.folder ? says.deleteAsk.confirmFolder : says.deleteAsk.confirm}
        busy={remove.isPending}
        problem={remove.isError ? messageFor(remove.error) : null}
        onConfirm={() => remove.mutate()}
      />
    </SafeAreaView>
  );
}

/** Another name for an album or a folder. */
function RenameSheet(props: { album: AlbumResponse; visible: boolean; onClose: () => void }) {
  // What is typed starts from the name each time the sheet opens.
  return <Renaming key={String(props.visible)} {...props} />;
}

function Renaming({ album, visible, onClose }: { album: AlbumResponse; visible: boolean; onClose: () => void }) {
  const cache = useCache();
  const [name, setName] = useState(album.title);
  const save = useMutation({
    mutationFn: () => changeAlbum(album.id, { title: name.trim() }),
    onSuccess: async (changed) => {
      await cache.albumChanged(changed);
      onClose();
    },
  });
  return (
    <Sheet visible={visible} onClose={onClose} title={says.rename.title}>
      <View style={{ gap: 12, paddingHorizontal: layout.rowGutter, paddingTop: 4 }}>
        <Field label={says.rename.field} value={name} onChangeText={setName} maxLength={200} autoFocus error={save.isError ? messageFor(save.error) : null} returnKeyType="done" onSubmitEditing={() => (name.trim() ? save.mutate() : undefined)} />
        <Button label={says.rename.save} size="lg" block loading={save.isPending} disabled={!name.trim()} onPress={() => save.mutate()} />
      </View>
    </Sheet>
  );
}

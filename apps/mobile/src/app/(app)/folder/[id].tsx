import { useMutation } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ellipsis, Folder, FolderInput, FolderPlus, Pencil, Pin, PinOff, Plus, Share2, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCache } from '@/api/cache';
import { messageFor } from '@/api/fetcher';
import { createFolder, type FolderResponse, type NoteItem, shareFolderContents, useGetFolder, useGetUnfiledNotesInfinite } from '@/api/generated/homeport';
import { useLeave } from '@/features/navigation/useLeave';
import { useNoteActions } from '@/features/notes/actions';
import { FolderTree, type Tree } from '@/features/notes/FolderTree';
import { MoveSheet } from '@/features/notes/MoveSheet';
import { NameSheet } from '@/features/notes/NameSheet';
import { NoteMenu } from '@/features/notes/NoteMenu';
import { NoteRow } from '@/features/notes/NoteRow';
import { paged, rows } from '@/features/notes/pages';
import { useCircleOf } from '@/features/notes/people';
import { SaySheet } from '@/features/notes/SaySheet';
import { TEMPLATES } from '@/features/notes/templates';
import { AudienceChip } from '@/features/sharing/AudienceChip';
import { PageProblem } from '@/features/states/PageProblem';
import { useOpenThing } from '@/features/things/open';
import { newThingHref } from '@/features/today/newThings';
import { newClientId } from '@/lib/ids';
import { useKept } from '@/lib/useKept';
import { loadState } from '@/lib/loading';
import { layout, useTheme } from '@/theme';
import { AppBar } from '@/ui/AppBar';
import { Button } from '@/ui/Button';
import { ConfirmSheet } from '@/ui/ConfirmSheet';
import { Emoji } from '@/ui/Emoji';
import { GlassBar } from '@/ui/GlassBar';
import { Loading } from '@/ui/Loading';
import { MoreButton } from '@/ui/MoreButton';
import { Tap } from '@/ui/Motion';
import { RoundButton } from '@/ui/RoundButton';
import { Sheet, SheetRow } from '@/ui/Sheet';
import { Sk } from '@/ui/Skeleton';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

/** The address of the list of what isn't filed anywhere: it stands where a folder's id would. */
const NOT_FILED = 'unfiled';

/**
 * 5.2 A space, and any folder opened by itself: `/folder/<id>` (a space is a folder at the top). Folders
 * inside folders, as deep as they go, opening in place, with pages, lists and sheets side by side. The bar
 * at the bottom makes a new page, list, sheet or folder in it. `/folder/unfiled` is the list of pages and
 * lists that stand in no folder yet.
 */
export default function FolderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return id === NOT_FILED ? <NotFiled /> : <Space id={id} />;
}

function Space({ id }: { id: string }) {
  const { colors } = useTheme();
  const asked = useGetFolder(id);
  const load = loadState(asked);
  const folder = asked.data;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      {load.error ? (
        <>
          <AppBar />
          <PageProblem error={load.error} onRetry={load.retry} retrying={load.retrying} inset={false} />
        </>
      ) : !folder ? (
        <>
          <AppBar title={words.common.places.notes} />
          {load.offline ? (
            <Loading offline />
          ) : (
            <View accessibilityLabel={words.states.loading} style={{ gap: 20, paddingTop: 10, paddingHorizontal: layout.rowGutter }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                <Sk width={48} height={48} radius="field" />
                <View style={{ flex: 1, gap: 8 }}>
                  <Sk width="50%" height={28} />
                  <Sk width="40%" height={12} />
                </View>
              </View>
              {Array.from({ length: 5 }, (_, index) => (
                <Sk key={index} width={index % 2 ? '55%' : '75%'} height={14} />
              ))}
            </View>
          )}
        </>
      ) : (
        <Loaded folder={folder} />
      )}
    </SafeAreaView>
  );
}

function Loaded({ folder }: { folder: FolderResponse }) {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const cache = useCache();
  const leave = useLeave();
  const open = useOpenThing();
  const actions = useNoteActions();
  const circle = useCircleOf(folder.circleId);
  // Which folders are showing their insides is remembered on the phone, for each space.
  const [unfolded, setUnfolded] = useKept<string[]>(`homeport.notes.open.${folder.id}`, []);
  const [current, setCurrent] = useState<string | null>(null);
  const [held, setHeld] = useState<{ item: NoteItem; folderId: string; siblings: NoteItem[]; canOrder: boolean } | null>(null);
  const [sheet, setSheet] = useState<'menu' | 'new' | 'rename' | 'folder' | 'move' | 'delete' | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const name = folder.title.trim() || words.things.untitled;
  const crumbs = folder.breadcrumb.map((crumb) => crumb.title?.trim() || words.things.untitled);
  const parent = folder.breadcrumb.at(-1);

  const tree: Tree = {
    open: new Set(unfolded),
    current,
    myMemberId: circle?.myMemberId,
    onToggle: (item) => setUnfolded(unfolded.includes(item.id ?? '') ? unfolded.filter((one) => one !== item.id) : [...unfolded, item.id ?? '']),
    onOpen: (item) => {
      setCurrent(item.id ?? null);
      open(item);
    },
    onMore: (item, where) => setHeld({ item, ...where }),
  };

  const share = useMutation({
    mutationFn: () => shareFolderContents(folder.id),
    onSuccess: (shared) => {
      setSaid(words.notes.space.shared(shared.changed ?? 0, shared.notYours ?? 0));
      void cache.insideShared(folder);
    },
    onError: (error) => setSaid(messageFor(error)),
  });
  const newIn = (path: '/new/note' | '/new/checklist') => {
    setSheet(null);
    router.push({ pathname: path, params: { folder: folder.id } });
  };

  return (
    <View style={{ flex: 1 }}>
      <AppBar
        title={folder.space ? words.common.places.notes : undefined}
        center={
          parent?.id ? (
            <Tap accessibilityRole="button" accessibilityLabel={words.notes.page.openFolder(words.notes.page.crumbs(crumbs))} hitSlop={10} onPress={() => router.push({ pathname: '/folder/[id]', params: { id: parent.id ?? '' } })} style={{ maxWidth: '100%' }}>
              <Txt variant="small" color="muted" numberOfLines={1}>
                {words.notes.page.crumbs(crumbs)}
              </Txt>
            </Tap>
          ) : undefined
        }
        trailing={<RoundButton label={words.things.more} icon={(c) => <Ellipsis size={20} color={c} />} onPress={() => setSheet('menu')} />}
      />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 150 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 4, marginBottom: 12, marginHorizontal: layout.rowGutter }}>
          {folder.emoji ? <Emoji char={folder.emoji} size={44} /> : <Folder size={40} color={colors.muted} />}
          <View style={{ flex: 1, gap: 4 }}>
            <Txt variant="heading" accessibilityRole="header">
              {name}
            </Txt>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <AudienceChip thing={folder} />
              <Txt variant="footnote" weight={600} color="muted">
                {words.notes.space.pages(folder.pages)}
              </Txt>
            </View>
          </View>
        </View>
        <FolderTree
          folderId={folder.id}
          canOrder={folder.canEdit}
          tree={tree}
          empty={
            <Txt variant="callout" color="muted" style={{ marginTop: 14, marginHorizontal: layout.gutter }}>
              {folder.canEdit ? words.notes.space.empty : words.notes.space.emptyReadOnly}
            </Txt>
          }
        />
      </ScrollView>

      {folder.canEdit ? (
        <GlassBar radius="sheet" style={{ position: 'absolute', left: 12, right: 12, bottom: Math.max(insets.bottom, 24) }} contentStyle={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingRight: 10, paddingLeft: 20 }}>
          <View style={{ flex: 1 }}>
            <Txt variant="item" weight={800} numberOfLines={1}>
              {words.notes.space.newIn(name)}
            </Txt>
            <Txt variant="footnote" color="muted">
              {words.notes.space.newWhat}
            </Txt>
          </View>
          <Button size="sm" variant="soft" inline label={words.notes.space.templates} onPress={() => (TEMPLATES ? router.push(TEMPLATES) : setSaid(words.notes.space.templatesLater))} />
          <Button size="sm" inline label={words.notes.space.new} spoken={words.notes.space.newIn(name)} icon={(c) => <Plus size={16} color={c} strokeWidth={2.4} />} onPress={() => setSheet('new')} />
        </GlassBar>
      ) : null}

      {/* New in this folder */}
      <Sheet visible={sheet === 'new'} onClose={() => setSheet(null)} title={words.notes.space.newIn(name)}>
        <SheetRow first label={words.notes.space.kinds.page} note={words.notes.space.kindNotes.page} onPress={() => newIn('/new/note')} />
        <SheetRow label={words.notes.space.kinds.checklist} note={words.notes.space.kindNotes.checklist} onPress={() => newIn('/new/checklist')} />
        <SheetRow
          label={words.notes.space.kinds.sheet}
          note={words.notes.space.kindNotes.sheet}
          onPress={() => {
            setSheet(null);
            router.push(newThingHref('sheet'));
          }}
        />
        <SheetRow label={words.notes.space.kinds.folder} note={words.notes.space.kindNotes.folder} onPress={() => setSheet('folder')} />
      </Sheet>
      <NameSheet
        visible={sheet === 'folder'}
        onClose={() => setSheet(null)}
        title={words.notes.name.newFolder(name)}
        placeholder={words.notes.name.folderPlaceholder}
        withEmoji
        confirm={words.notes.name.create}
        onSubmit={async (title, emoji) => {
          await createFolder({ clientId: newClientId(), circleId: folder.circleId, parentId: folder.id, title, emoji });
          await cache.noteMade(folder.circleId);
        }}
      />

      {/* The folder's own menu */}
      <Sheet visible={sheet === 'menu'} onClose={() => setSheet(null)} title={name}>
        <SheetRow
          first
          icon={(c) => (folder.pinned ? <PinOff size={22} color={c} /> : <Pin size={22} color={c} />)}
          label={folder.pinned ? words.notes.space.menu.unpin : words.notes.space.menu.pin}
          onPress={() => actions.pin.mutate({ thing: { ...folder, kind: 'folder' }, pinned: !folder.pinned }, { onSettled: () => setSheet(null) })}
        />
        {folder.canEdit ? <SheetRow icon={(c) => <FolderPlus size={22} color={c} />} label={words.notes.name.newFolder(name)} onPress={() => setSheet('folder')} /> : null}
        {folder.canEdit ? <SheetRow icon={(c) => <Pencil size={22} color={c} />} label={words.notes.space.menu.nameAndEmoji} onPress={() => setSheet('rename')} /> : null}
        {folder.canEdit ? <SheetRow icon={(c) => <FolderInput size={22} color={c} />} label={words.notes.space.menu.move} onPress={() => setSheet('move')} /> : null}
        {folder.mine ? (
          <SheetRow
            icon={(c) => <Share2 size={22} color={c} />}
            label={words.notes.space.menu.shareInside}
            onPress={() => {
              setSheet(null);
              share.mutate();
            }}
          />
        ) : null}
        {folder.mine ? <SheetRow danger icon={(c) => <Trash2 size={22} color={c} />} label={words.notes.space.menu.delete} onPress={() => setSheet('delete')} /> : null}
      </Sheet>
      <NameSheet
        visible={sheet === 'rename'}
        onClose={() => setSheet(null)}
        title={words.notes.name.rename}
        name={folder.title}
        emoji={folder.emoji}
        withEmoji
        confirm={words.notes.name.save}
        onSubmit={(title, emoji) => actions.rename.mutateAsync({ thing: { ...folder, kind: 'folder' }, title, emoji })}
      />
      <MoveSheet thing={sheet === 'move' ? { ...folder, kind: 'folder' } : null} onClose={() => setSheet(null)} />
      <ConfirmSheet
        visible={sheet === 'delete'}
        onClose={() => setSheet(null)}
        title={words.notes.space.deleteAsk.title(name)}
        body={words.notes.space.deleteAsk.folder}
        confirm={words.notes.space.deleteAsk.confirm}
        busy={actions.remove.isPending}
        problem={actions.remove.isError ? messageFor(actions.remove.error) : null}
        onConfirm={() =>
          actions.remove.mutate(
            { ...folder, kind: 'folder' },
            {
              onSuccess: () => {
                setSheet(null);
                leave();
              },
            },
          )
        }
      />

      <NoteMenu item={held?.item ?? null} onClose={() => setHeld(null)} folderId={held?.folderId} siblings={held?.siblings} canOrder={held?.canOrder} />
      <SaySheet text={said} onClose={() => setSaid(null)} />
    </View>
  );
}

/** The pages and lists that stand in no folder the person may see, last changed first. Holding one moves it into a folder. */
function NotFiled() {
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ circle?: string }>();
  const circle = useCircleOf(params.circle);
  const open = useOpenThing();
  const asked = useGetUnfiledNotesInfinite(circle?.id ?? '', undefined, { query: { ...paged, enabled: !!circle } });
  const load = loadState(asked);
  const items = rows(asked.data);
  const [held, setHeld] = useState<NoteItem | null>(null);
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar title={words.common.places.notes} />
      {load.error ? (
        <PageProblem error={load.error} onRetry={load.retry} retrying={load.retrying} inset={false} />
      ) : !items ? (
        <Loading offline={load.offline} />
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
          <View style={{ gap: 4, marginTop: 4, marginBottom: 12, marginHorizontal: layout.rowGutter }}>
            <Txt variant="heading" accessibilityRole="header">
              {words.notes.space.notFiled.title}
            </Txt>
            <Txt variant="footnote" weight={600} color="muted">
              {items.length ? words.notes.space.notFiled.body : words.notes.space.notFiled.empty}
            </Txt>
          </View>
          {items.map((item) => (
            <NoteRow key={item.id} item={item} myMemberId={circle?.myMemberId} onPress={() => open(item)} onMore={() => setHeld(item)} />
          ))}
          <MoreButton pages={asked} />
        </ScrollView>
      )}
      <NoteMenu item={held} onClose={() => setHeld(null)} />
    </SafeAreaView>
  );
}

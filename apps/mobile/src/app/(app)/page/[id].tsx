import { useMutation } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { AtSign, Check, Ellipsis, EyeOff, FolderInput, Image as ImageIcon, Pin, PinOff, Plus, Share2, Smile, SquareCheck, Table, Trash2, Type } from 'lucide-react-native';
import { type ComponentRef, type ReactNode, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCache } from '@/api/cache';
import { messageFor } from '@/api/fetcher';
import { type BlockResponse, changePage, type PageResponse, sharePageLists, type ThingKind, useGetAudience, useGetLinks } from '@/api/generated/homeport';
import { useOnline } from '@/api/online';
import { useLeave } from '@/features/navigation/useLeave';
import { useNoteActions } from '@/features/notes/actions';
import { pageWithWaiting, steadyKeys } from '@/features/notes/changes/apply';
import { useWaiting } from '@/features/notes/changes/outbox';
import type { Target } from '@/features/notes/changes/types';
import { useLivePage } from '@/features/notes/live';
import { MoveSheet } from '@/features/notes/MoveSheet';
import { EmojiGrid } from '@/features/notes/NameSheet';
import { BLOCK_TILES, BlockPicker, type BlockTile, liveKind } from '@/features/notes/page/BlockPicker';
import { FileBlock, isText, LinkRows, ListBlock, LiveBlock, type Look, PhotoBlock, PlaceBlock, TextBlock, TypingBlock, UnseenBlock, WaitingList } from '@/features/notes/page/blocks';
import { partsOf, useEditor } from '@/features/notes/page/editor';
import { LinkPicker } from '@/features/notes/page/LinkPicker';
import { pickFile } from '@/features/notes/page/pickFile';
import { pickPhoto, sendPhoto, sendPickedFile } from '@/features/notes/page/send';
import { BlockMenu, ListSheet, MentionSheet, namedIn, WordsSheet } from '@/features/notes/page/sheets';
import { useCircleOf } from '@/features/notes/people';
import { SaySheet } from '@/features/notes/SaySheet';
import { WaitingNote } from '@/features/notes/WaitingNote';
import { AudienceChip } from '@/features/sharing/AudienceChip';
import { PageProblem } from '@/features/states/PageProblem';
import { useOpenThing } from '@/features/things/open';
import { ThingRow } from '@/features/things/ThingRow';
import { formatDayLong, timeAgo } from '@/lib/dates';
import { loadState } from '@/lib/loading';
import { firstName } from '@/lib/names';
import { layout, radius, useTheme } from '@/theme';
import { AppBar } from '@/ui/AppBar';
import { AvoidKeyboard } from '@/ui/AvoidKeyboard';
import { ConfirmSheet } from '@/ui/ConfirmSheet';
import { Emoji } from '@/ui/Emoji';
import { GlassBar } from '@/ui/GlassBar';
import { GrowingInput } from '@/ui/GrowingInput';
import { GroupLabel } from '@/ui/Heading';
import { Loading } from '@/ui/Loading';
import { Tap } from '@/ui/Motion';
import { NoteBox } from '@/ui/NoteBox';
import { RoundButton } from '@/ui/RoundButton';
import { RowGroup } from '@/ui/Rows';
import { Sheet, SheetRow } from '@/ui/Sheet';
import { Sk } from '@/ui/Skeleton';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

/**
 * 5.3 A page, built from blocks: words (plain, a heading, a bullet, with a few marks), a list to tick in
 * place, a photo, a file, a place, and live blocks that show another thing as it stands today. Each block is
 * changed by itself, so two people writing on one page both keep what they did; the page asks again every
 * few seconds, so the other person's changes appear. Nothing here calls the API to change a block: every
 * change goes into the queue of changes (`features/notes/changes`), shows at once, and waits on the phone
 * when there is no connection.
 *
 * A page that is hidden from someone today is 4.4 "Keep it a surprise": it says so under its title, and
 * until when, and its headings become small labels over what belongs to them.
 */
export default function Page() {
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const asked = useLivePage(id);
  const load = loadState(asked);
  const page = asked.data;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      {load.error ? (
        <>
          <AppBar />
          <PageProblem error={load.error} onRetry={load.retry} retrying={load.retrying} inset={false} />
        </>
      ) : !page ? (
        <>
          <AppBar />
          {load.offline ? (
            <Loading offline />
          ) : (
            <View accessibilityLabel={words.states.loading} style={{ gap: 12, paddingTop: 14, paddingHorizontal: layout.rowGutter }}>
              <Sk width={48} height={48} radius="field" />
              <Sk width="75%" height={30} />
              <Sk width="35%" height={12} />
              <Sk height={14} style={{ marginTop: 10 }} />
              <Sk width="90%" height={14} />
              <Sk width="60%" height={14} />
            </View>
          )}
        </>
      ) : (
        <Loaded loaded={page} />
      )}
    </SafeAreaView>
  );
}

/** The tile behind the table in the page's bar: a sheet, as a live block. */
const SHEET: BlockTile = BLOCK_TILES.find((tile) => tile.id === 'sheet') ?? BLOCK_TILES[0];

type Asking = 'menu' | 'blocks' | 'list' | 'place' | 'mention' | 'emoji' | 'move' | 'delete' | null;

function Loaded({ loaded }: { loaded: PageResponse }) {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const cache = useCache();
  const leave = useLeave();
  const open = useOpenThing();
  const online = useOnline();
  const actions = useNoteActions();
  const circle = useCircleOf(loaded.circleId);
  const target = useMemo<Target>(() => ({ kind: 'page', id: loaded.id }), [loaded.id]);
  const waiting = useWaiting(target);
  const { page, waiting: marked } = useMemo(() => pageWithWaiting(loaded, waiting), [loaded, waiting]);
  const people = useMemo(() => namedIn(circle), [circle]);
  const editor = useEditor(page, people);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);

  const [asking, setAsking] = useState<Asking>(null);
  const [title, setTitle] = useState<string | null>(null);
  const [linking, setLinking] = useState<{ kind: ThingKind; as: 'live' | 'list' } | null>(null);
  const [held, setHeld] = useState<BlockResponse | null>(null);
  const [rewording, setRewording] = useState<BlockResponse | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const [sending, setSending] = useState<'photo' | 'file' | null>(null);
  const close = () => setAsking(null);
  const thing = { ...loaded, kind: 'page' };

  const hiddenFrom = page.chip.hiddenFrom ?? [];
  const look: Look = hiddenFrom.length ? 'surprise' : 'page';
  // Until when it is hidden is on the audience sheet's answer; the chip only has the names.
  const audience = useGetAudience(page.id, { query: { enabled: hiddenFrom.length > 0 } }).data;
  const hidden = audience?.people.filter((person) => person.hidden) ?? [];
  const through = hidden.length > 0 && hidden.every((person) => person.hiddenThrough && person.hiddenThrough === hidden[0]!.hiddenThrough) ? hidden[0]!.hiddenThrough! : null;
  // What the page is linked to stands under its blocks, unless a block shows it already.
  const shown = new Set(page.blocks.flatMap((block) => (block.thing?.id ? [block.thing.id] : [])));
  const links = (useGetLinks(page.id).data ?? []).filter((linked) => !shown.has(linked.id ?? ''));
  const crumbs = page.breadcrumb.map((crumb) => crumb.title?.trim() || words.things.untitled);
  const folder = page.breadcrumb.at(-1);

  /** The title and the emoji are the page's own: saved as they are, and the API sends the page back. */
  const save = useMutation({
    mutationFn: (change: { title?: string; emoji?: string }) => changePage(page.id, change),
    onSuccess: (saved) => void cache.pageSent(saved.id, saved),
  });
  const shareLists = useMutation({
    mutationFn: () => sharePageLists(page.id),
    onSuccess: (shared) => {
      setSaid(words.notes.page.listsShared(shared.changed ?? 0, shared.notYours ?? 0));
      void cache.insideShared(page);
    },
    onError: (error) => setSaid(messageFor(error)),
  });
  /** A photo or a file goes up first (that needs a connection); the block that shows it then goes through the queue like every other. */
  const upload = useMutation({
    mutationFn: async (kind: 'photo' | 'file') => {
      if (kind === 'photo') {
        const photo = await pickPhoto();
        if (!photo) return;
        setSending('photo');
        editor.addMedia('photo', await sendPhoto(photo));
        return;
      }
      const file = await pickFile();
      if (file === 'unavailable') return setSaid(words.notes.page.fileNeedsPhone);
      if (!file) return;
      setSending('file');
      editor.addMedia('file', await sendPickedFile(file), file.name);
    },
    onSuccess: () => setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 80),
    onError: (error) => setSaid(messageFor(error)),
    onSettled: () => setSending(null),
  });
  const pick = (kind: 'photo' | 'file') => (online ? upload.mutate(kind) : setSaid(words.notes.page.needsConnection));
  const write = () => {
    editor.write();
    setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 80);
  };

  /** One of the fifteen tiles of "Add to this page". */
  const choose = (tile: BlockTile) => {
    close();
    if (tile.id === 'text') return write();
    if (tile.id === 'checklist') return setAsking('list');
    if (tile.id === 'photo' || tile.id === 'file') return pick(tile.id);
    if (tile.id === 'place') return setAsking('place');
    const kind = liveKind(tile);
    if (kind) return setLinking({ kind, as: 'live' });
    setSaid(words.notes.blocks.later(words.notes.blocks.kinds[tile.id]));
  };

  const parts = partsOf(page.blocks, editor.draft);
  const steady = steadyKeys(waiting.aliases);
  const more = (block: BlockResponse) => (page.canEdit ? () => setHeld(block) : undefined);
  const waits = (block: BlockResponse) => waiting.held && marked.has(block.id);

  const drawn = (block: BlockResponse): ReactNode => {
    if (isText(block.kind)) return <TextBlock block={block} look={look} waiting={waits(block)} onPress={page.canEdit ? () => editor.edit(block) : undefined} onMore={more(block)} />;
    if (block.unseen) return <UnseenBlock />;
    if (block.kind === 'checklist') return block.checklist ? <ListBlock loaded={block.checklist} look={look} onMore={more(block)} /> : <WaitingList block={block} />;
    if (block.kind === 'photo') return <PhotoBlock block={block} waiting={waits(block)} onMore={more(block)} />;
    if (block.kind === 'file') return <FileBlock block={block} waiting={waits(block)} onMore={more(block)} />;
    if (block.kind === 'place') return <PlaceBlock block={block} waiting={waits(block)} onMore={more(block)} />;
    if (block.thing) return <LiveBlock block={block} thing={block.thing} waiting={waits(block)} onMore={more(block)} onCopy={() => setSaid(words.notes.page.copyLater)} />;
    return <UnseenBlock />;
  };

  const titleBox = page.canEdit ? (
    <GrowingInput
      label={words.things.page.title}
      variant="heading"
      placeholder={words.things.page.titlePlaceholder}
      value={title ?? page.title}
      // One line of words, however it wraps: Return ends it.
      onChangeText={(next) => setTitle(next.replace(/\n/g, ' '))}
      maxLength={200}
      submitBehavior="blurAndSubmit"
      onBlur={() => {
        if (title !== null && title.trim() !== page.title) save.mutate({ title: title.trim() }, { onSettled: () => setTitle(null) });
        else setTitle(null);
      }}
    />
  ) : (
    <Txt variant="heading" accessibilityRole="header">
      {page.title.trim() || words.things.untitled}
    </Txt>
  );

  return (
    <AvoidKeyboard style={{ flex: 1 }}>
      <AppBar
        center={
          folder?.id ? (
            <Tap accessibilityRole="button" accessibilityLabel={words.notes.page.openFolder(words.notes.page.crumbs(crumbs))} hitSlop={10} onPress={() => router.push({ pathname: '/folder/[id]', params: { id: folder.id ?? '' } })} style={{ maxWidth: '100%' }}>
              <Txt variant="small" color="muted" numberOfLines={1}>
                {words.notes.page.crumbs(crumbs)}
              </Txt>
            </Tap>
          ) : undefined
        }
        trailing={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <AudienceChip thing={loaded} />
            <RoundButton label={words.things.more} icon={(c) => <Ellipsis size={20} color={c} />} onPress={() => setAsking('menu')} />
          </View>
        }
      />
      <WaitingNote target={target} waiting={waiting} offline={words.notes.page.offline} resting={words.notes.page.resting} />

      <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: page.canEdit ? 130 : 60 }}>
        {look === 'surprise' ? (
          <>
            <View style={{ marginTop: 6, marginHorizontal: layout.rowGutter }}>{titleBox}</View>
            <NoteBox
              soft
              icon={(c) => <EyeOff size={20} color={c} />}
              title={words.sharing.surprise.title(hidden.length ? hidden.map((person) => firstName(person.name)) : hiddenFrom, through ? formatDayLong(through) : null)}
              style={{ marginTop: 16, marginHorizontal: layout.barGutter }}>
              {words.sharing.surprise.body(!!through)}
            </NoteBox>
          </>
        ) : (
          <View style={{ paddingTop: 4, paddingHorizontal: layout.rowGutter }}>
            {page.emoji ? (
              page.canEdit ? (
                <Tap accessibilityRole="button" accessibilityLabel={words.notes.page.menu.emoji} onPress={() => setAsking('emoji')} scaleTo={0.92} style={{ alignSelf: 'flex-start' }}>
                  <Emoji char={page.emoji} size={44} />
                </Tap>
              ) : (
                <Emoji char={page.emoji} size={44} />
              )
            ) : null}
            <View style={{ marginTop: page.emoji ? 10 : 6 }}>{titleBox}</View>
            <Txt variant="footnote" color="muted" style={{ marginTop: 6, marginBottom: 2 }}>
              {page.editedBy?.name && page.editedAt ? words.notes.page.editedBy(page.editedBy.name, timeAgo(page.editedAt)) : words.things.page.edited(timeAgo(page.editedAt ?? page.updatedAt))}
            </Txt>
          </View>
        )}
        {save.isError ? (
          <Txt variant="caption" color="danger" accessibilityLiveRegion="polite" style={{ marginTop: 6, marginHorizontal: layout.rowGutter }}>
            {messageFor(save.error)}
          </Txt>
        ) : null}

        {parts.map((part) =>
          part.draft ? (
            <TypingBlock key={steady(part.key)} kind={part.draft.kind} value={part.draft.typed} onChange={editor.type} onNext={editor.next} />
          ) : part.links ? (
            <View key={steady(part.key)} style={{ marginTop: look === 'surprise' ? 0 : 12 }}>
              <LinkRows blocks={part.links} onMore={page.canEdit ? setHeld : undefined} />
            </View>
          ) : part.block ? (
            <View key={steady(part.key)}>{drawn(part.block)}</View>
          ) : null,
        )}

        {sending ? (
          <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12, marginHorizontal: layout.rowGutter, paddingVertical: 14, paddingHorizontal: 14, borderRadius: radius.photo, backgroundColor: colors.fill }}>
            <ActivityIndicator color={colors.muted} />
            <Txt variant="callout" color="muted">
              {words.notes.page.sending[sending]}
            </Txt>
          </View>
        ) : null}

        {page.blocks.length === 0 && !editor.draft ? (
          page.canEdit ? (
            <Tap accessibilityRole="button" accessibilityLabel={words.notes.page.bar.text} onPress={write} scaleTo={1} style={{ minHeight: 120, marginTop: 12, marginHorizontal: layout.rowGutter }}>
              <Txt color="muted">{words.notes.page.empty}</Txt>
            </Tap>
          ) : (
            <Txt color="muted" style={{ marginTop: 12, marginHorizontal: layout.rowGutter }}>
              {words.notes.page.emptyReadOnly}
            </Txt>
          )
        ) : null}
        {page.canEdit ? null : (
          <Txt variant="footnote" color="muted" style={{ marginTop: 18, marginHorizontal: layout.rowGutter }}>
            {words.things.page.viewOnly}
          </Txt>
        )}

        {links.length ? (
          <>
            <GroupLabel style={{ marginHorizontal: layout.gutter }}>{words.things.linked}</GroupLabel>
            <RowGroup>
              {links.map((linked, index) => (
                <ThingRow key={linked.id} look="grouped" first={index === 0} thing={linked} />
              ))}
            </RowGroup>
          </>
        ) : null}
      </ScrollView>

      {page.canEdit ? (
        <GlassBar radius="pill" style={{ position: 'absolute', left: 14, right: 14, bottom: Math.max(insets.bottom, 24) }} contentStyle={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 58, paddingLeft: 18, paddingRight: 8 }}>
          <BarButton label={words.notes.page.bar.text} icon={Type} onPress={write} />
          <BarButton label={words.notes.page.bar.checklist} icon={SquareCheck} onPress={() => setAsking('list')} />
          <BarButton label={words.notes.page.bar.photo} icon={ImageIcon} onPress={() => pick('photo')} />
          <BarButton label={words.notes.page.bar.sheet} icon={Table} onPress={() => choose(SHEET)} />
          <BarButton label={words.notes.page.bar.mention} icon={AtSign} onPress={() => setAsking('mention')} />
          <Tap
            accessibilityRole="button"
            accessibilityLabel={editor.draft ? words.notes.page.bar.done : words.notes.page.bar.add}
            hitSlop={4}
            onPress={() => (editor.draft ? editor.done() : setAsking('blocks'))}
            scaleTo={0.9}
            style={{ width: 42, height: 42, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent }}>
            {editor.draft ? <Check size={19} color={colors.onAccent} strokeWidth={2.6} /> : <Plus size={19} color={colors.onAccent} strokeWidth={2.4} />}
          </Tap>
        </GlassBar>
      ) : null}

      <BlockPicker visible={asking === 'blocks'} onClose={close} onChoose={choose} />
      <ListSheet visible={asking === 'list'} onClose={close} pageTitle={page.title} onAdd={editor.addList} onExisting={() => {
          close();
          setLinking({ kind: 'checklist', as: 'list' });
        }}
      />
      <WordsSheet visible={asking === 'place'} onClose={close} title={words.notes.page.place.title} label={words.notes.page.place.label} placeholder={words.notes.page.place.placeholder} confirm={words.notes.page.place.add} needed onSave={editor.addPlace} />
      <WordsSheet
        visible={!!rewording}
        onClose={() => setRewording(null)}
        title={rewording?.kind === 'place' ? words.notes.page.place.title : words.notes.page.captionSheet.title}
        label={rewording?.kind === 'place' ? words.notes.page.place.label : words.notes.page.captionSheet.label}
        value={rewording?.text}
        confirm={words.notes.page.captionSheet.save}
        needed={rewording?.kind === 'place'}
        onSave={(text) => (rewording ? editor.reword(rewording, text) : undefined)}
      />
      <MentionSheet visible={asking === 'mention'} onClose={close} people={people.map((person) => ({ ...person, avatarUrl: circle?.members.find((member) => member.id === person.memberId)?.avatarUrl }))} onChoose={editor.mention} />
      <LinkPicker
        kind={linking?.kind ?? null}
        circleId={page.circleId}
        except={[page.id]}
        onClose={() => setLinking(null)}
        onChoose={(chosen) => {
          if (linking?.as === 'list') editor.addExistingList(chosen);
          else editor.addLive(chosen);
          setLinking(null);
        }}
      />
      <BlockMenu
        block={held}
        at={held ? page.blocks.findIndex((block) => block.id === held.id) : -1}
        count={page.blocks.length}
        onClose={() => setHeld(null)}
        onTurn={(kind) => (held ? editor.turnInto(held, kind) : undefined)}
        onUp={() => (held ? editor.moveUp(held) : undefined)}
        onDown={() => (held ? editor.moveDown(held) : undefined)}
        onRemove={() => (held ? editor.remove(held) : undefined)}
        onReword={() => setRewording(held)}
        onOpenList={() => (held?.checklist ? open({ kind: 'checklist', id: held.checklist.id }) : undefined)}
      />

      <Sheet visible={asking === 'menu'} onClose={close} title={page.title.trim() || words.things.untitled}>
        <SheetRow
          first
          icon={(c) => (page.pinned ? <PinOff size={22} color={c} /> : <Pin size={22} color={c} />)}
          label={page.pinned ? words.notes.page.menu.unpin : words.notes.page.menu.pin}
          onPress={() => {
            close();
            actions.pin.mutate({ thing, pinned: !page.pinned }, { onError: (error) => setSaid(messageFor(error)) });
          }}
        />
        {page.canEdit ? <SheetRow icon={(c) => <Smile size={22} color={c} />} label={words.notes.page.menu.emoji} onPress={() => setAsking('emoji')} /> : null}
        {page.canEdit ? <SheetRow icon={(c) => <FolderInput size={22} color={c} />} label={words.notes.page.menu.move} onPress={() => setAsking('move')} /> : null}
        {page.mine && page.blocks.some((block) => block.kind === 'checklist') ? (
          <SheetRow
            icon={(c) => <Share2 size={22} color={c} />}
            label={words.notes.page.menu.shareLists}
            onPress={() => {
              close();
              shareLists.mutate();
            }}
          />
        ) : null}
        {page.mine ? <SheetRow danger icon={(c) => <Trash2 size={22} color={c} />} label={words.things.page.delete} onPress={() => setAsking('delete')} /> : null}
      </Sheet>
      <Sheet visible={asking === 'emoji'} onClose={close} title={words.notes.page.emojiSheet}>
        <View style={{ paddingTop: 6, paddingHorizontal: layout.rowGutter }}>
          <EmojiGrid
            value={page.emoji}
            onChange={(emoji) => {
              close();
              save.mutate({ emoji });
            }}
          />
        </View>
      </Sheet>
      <MoveSheet thing={asking === 'move' ? thing : null} onClose={close} />
      <ConfirmSheet
        visible={asking === 'delete'}
        onClose={close}
        title={words.things.page.deleteAsk.title}
        body={words.things.page.deleteAsk.body}
        confirm={words.things.page.deleteAsk.confirm}
        busy={actions.remove.isPending}
        problem={actions.remove.isError ? messageFor(actions.remove.error) : null}
        onConfirm={() =>
          actions.remove.mutate(thing, {
            onSuccess: () => {
              close();
              leave();
            },
          })
        }
      />
      <SaySheet text={said} onClose={() => setSaid(null)} />
    </AvoidKeyboard>
  );
}

/** One of the five quiet buttons of the page's bar. */
function BarButton({ label, icon: Icon, onPress }: { label: string; icon: typeof Type; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Tap accessibilityRole="button" accessibilityLabel={label} hitSlop={10} onPress={onPress} scaleTo={0.88} style={{ width: 36, height: 44, alignItems: 'center', justifyContent: 'center' }}>
      <Icon size={22} color={colors.text} />
    </Tap>
  );
}

import { useMutation } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, CornerLeftUp, Folder } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { useCache } from '@/api/cache';
import { messageFor } from '@/api/fetcher';
import { fileThing, useGetFolderItemsInfinite, useGetNotes } from '@/api/generated/homeport';
import { loadState } from '@/lib/loading';
import { layout, useTheme } from '@/theme';
import { Emoji } from '@/ui/Emoji';
import { Loading } from '@/ui/Loading';
import { MoreButton } from '@/ui/MoreButton';
import { Tap } from '@/ui/Motion';
import { Problem } from '@/ui/Problem';
import { Sheet, SheetRow } from '@/ui/Sheet';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

import { paged, rows } from './pages';

/** As much of a thing as moving it needs. */
export type Movable = { id?: string; circleId?: string; kind?: string; title?: string };

type Props = {
  /** The thing to move. Null while the sheet is shut. */
  thing: Movable | null;
  onClose: () => void;
  /** After it was moved. */
  onMoved?: () => void;
};

/**
 * Moves a page, a list or a folder: into any folder the person may put things in, or out of every folder
 * (a folder that is taken out becomes a space). The folders are shown as they are in Notes, spaces first,
 * each opening in place.
 */
export function MoveSheet({ thing, onClose, onMoved }: Props) {
  const title = thing?.title?.trim() || words.things.untitled;
  return (
    <Sheet visible={!!thing} onClose={onClose} title={words.notes.move.title(title)} tall>
      {thing?.id && thing.circleId ? <Places thing={{ ...thing, id: thing.id, circleId: thing.circleId }} onClose={onClose} onMoved={onMoved} /> : null}
    </Sheet>
  );
}

function Places({ thing, onClose, onMoved }: { thing: Movable & { id: string; circleId: string }; onClose: () => void; onMoved?: () => void }) {
  const cache = useCache();
  const asked = useGetNotes(thing.circleId);
  const load = loadState(asked);
  const move = useMutation({
    mutationFn: (folderId: string | null) => fileThing(thing.id, { folderId }),
    onSuccess: () => {
      void cache.noteFiled(thing);
      onMoved?.();
      onClose();
    },
  });
  if (load.error) return <Problem message={messageFor(load.error)} onRetry={load.retry} retrying={load.retrying} />;
  if (!asked.data) return <Loading offline={load.offline} />;
  return (
    <View style={{ paddingBottom: 12 }}>
      {move.isError ? (
        <Txt variant="caption" color="danger" accessibilityLiveRegion="polite" style={{ paddingHorizontal: layout.gutter, paddingBottom: 8 }}>
          {messageFor(move.error)}
        </Txt>
      ) : null}
      <SheetRow first icon={(c) => <CornerLeftUp size={22} color={c} />} label={thing.kind === 'folder' ? words.notes.move.asSpace : words.notes.move.out} onPress={() => move.mutate(null)} />
      {(asked.data.spaces ?? [])
        .filter((space) => space.canEdit && space.id !== thing.id)
        .map((space) => (
          <Place key={space.id} id={space.id} title={space.title} emoji={space.emoji} depth={0} moving={thing.id} onChoose={(folderId) => move.mutate(folderId)} />
        ))}
    </View>
  );
}

/** One folder to move into, with the folders inside it one press away. The thing that is being moved is left out: a folder can't go into itself. */
function Place({ id, title, emoji, depth, moving, onChoose }: { id: string; title: string; emoji?: string; depth: number; moving: string; onChoose: (folderId: string) => void }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const Twisty = open ? ChevronDown : ChevronRight;
  const name = title.trim() || words.things.untitled;
  return (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: colors.line, paddingLeft: layout.gutter - 8 + depth * 24, paddingRight: layout.gutter }}>
        <Tap accessibilityRole="button" accessibilityLabel={open ? words.notes.space.fold(name) : words.notes.space.unfold(name)} aria-expanded={open} hitSlop={8} onPress={() => setOpen(!open)} style={{ width: 32, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Twisty size={18} color={colors.muted} />
        </Tap>
        <Tap accessibilityRole="button" accessibilityLabel={words.notes.move.into(name)} onPress={() => onChoose(id)} scaleTo={0.99} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 50, paddingVertical: 12 }}>
          {emoji ? <Emoji char={emoji} size={22} /> : <Folder size={22} color={colors.text} />}
          <Txt variant="headline" weight={600} numberOfLines={1} style={{ flex: 1 }}>
            {name}
          </Txt>
        </Tap>
      </View>
      {open ? <Inside id={id} depth={depth + 1} moving={moving} onChoose={onChoose} /> : null}
    </>
  );
}

function Inside({ id, depth, moving, onChoose }: { id: string; depth: number; moving: string; onChoose: (folderId: string) => void }) {
  const asked = useGetFolderItemsInfinite(id, undefined, { query: paged });
  const folders = (rows(asked.data) ?? []).filter((item) => item.kind === 'folder' && item.canEdit && item.id !== moving);
  if (!asked.data) return asked.isError ? null : <View style={{ minHeight: 44 }}>{<Loading offline={asked.isPaused} />}</View>;
  return (
    <>
      {folders.map((folder) => (folder.id ? <Place key={folder.id} id={folder.id} title={folder.title ?? ''} depth={depth} moving={moving} onChoose={onChoose} /> : null))}
      <MoreButton pages={asked} />
    </>
  );
}

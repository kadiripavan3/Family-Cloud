import { useRouter } from 'expo-router';
import { ArrowDown, ArrowUp, FolderInput, FolderOpen, Pencil, Pin, PinOff, Trash2 } from 'lucide-react-native';
import { useState } from 'react';

import { messageFor } from '@/api/fetcher';
import type { NoteItem } from '@/api/generated/homeport';
import { layout } from '@/theme';
import { ConfirmSheet } from '@/ui/ConfirmSheet';
import { Sheet, SheetRow } from '@/ui/Sheet';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

import { canRename, useNoteActions } from './actions';
import { MoveSheet } from './MoveSheet';
import { NameSheet } from './NameSheet';

type Props = {
  /** The row whose menu is open. Null while it is shut. */
  item: NoteItem | null;
  onClose: () => void;
  /** The folder the row stands in, and the rows next to it in order: with these, the menu offers "Move up" and "Move down". */
  folderId?: string | null;
  siblings?: readonly NoteItem[];
  /** True when the person may change the order in that folder. */
  canOrder?: boolean;
};

/**
 * The menu of one row in Notes (hold the row): open a folder by itself, pin the row, rename it, move it to
 * another folder or up and down in this one, delete it. What each row offers depends on what the person
 * may do with it.
 */
export function NoteMenu({ item, onClose, folderId, siblings, canOrder }: Props) {
  const router = useRouter();
  const actions = useNoteActions();
  // The sheets that follow the menu keep the row they are about after the menu has closed.
  const [renaming, setRenaming] = useState<NoteItem | null>(null);
  const [moving, setMoving] = useState<NoteItem | null>(null);
  const [deleting, setDeleting] = useState<NoteItem | null>(null);

  const at = item && siblings ? siblings.findIndex((one) => one.id === item.id) : -1;
  const title = (thing: NoteItem | null) => thing?.title?.trim() || words.things.untitled;
  const then = (act: () => void) => () => {
    onClose();
    act();
  };
  const problem = actions.pin.error ?? actions.reorder.error;

  return (
    <>
      <Sheet visible={!!item} onClose={onClose} title={title(item)}>
        {item ? (
          <>
            {problem ? (
              <Txt variant="caption" color="danger" accessibilityLiveRegion="polite" style={{ paddingHorizontal: layout.gutter, paddingBottom: 8 }}>
                {messageFor(problem)}
              </Txt>
            ) : null}
            {/* A folder opens in place when it is pressed; here it opens by itself, where new things can be made in it. */}
            {item.kind === 'folder' ? <SheetRow first icon={(c) => <FolderOpen size={22} color={c} />} label={words.notes.space.menu.open} onPress={then(() => router.push({ pathname: '/folder/[id]', params: { id: item.id ?? '' } }))} /> : null}
            <SheetRow
              first={item.kind !== 'folder'}
              icon={(c) => (item.pinned ? <PinOff size={22} color={c} /> : <Pin size={22} color={c} />)}
              label={item.pinned ? words.notes.space.menu.unpin : words.notes.space.menu.pin}
              onPress={() => actions.pin.mutate({ thing: item, pinned: !item.pinned }, { onSuccess: onClose })}
            />
            {canRename(item) ? <SheetRow icon={(c) => <Pencil size={22} color={c} />} label={item.kind === 'checklist' ? words.notes.space.menu.rename : words.notes.space.menu.nameAndEmoji} onPress={then(() => setRenaming(item))} /> : null}
            {item.canEdit ? <SheetRow icon={(c) => <FolderInput size={22} color={c} />} label={words.notes.space.menu.move} onPress={then(() => setMoving(item))} /> : null}
            {canOrder && at > 0 ? (
              <SheetRow
                icon={(c) => <ArrowUp size={22} color={c} />}
                label={words.notes.space.menu.up}
                onPress={() => actions.reorder.mutate({ thing: item, folderId: folderId ?? null, after: siblings?.[at - 2]?.id ?? null }, { onSuccess: onClose })}
              />
            ) : null}
            {canOrder && siblings && at >= 0 && at < siblings.length - 1 ? (
              <SheetRow
                icon={(c) => <ArrowDown size={22} color={c} />}
                label={words.notes.space.menu.down}
                onPress={() => actions.reorder.mutate({ thing: item, folderId: folderId ?? null, after: siblings[at + 1]?.id ?? null }, { onSuccess: onClose })}
              />
            ) : null}
            {item.mine ? <SheetRow danger icon={(c) => <Trash2 size={22} color={c} />} label={words.notes.space.menu.delete} onPress={then(() => setDeleting(item))} /> : null}
          </>
        ) : null}
      </Sheet>
      <NameSheet
        visible={!!renaming}
        onClose={() => setRenaming(null)}
        title={words.notes.name.rename}
        name={renaming?.title ?? ''}
        emoji={renaming?.emoji ?? ''}
        withEmoji={renaming?.kind !== 'checklist'}
        confirm={words.notes.name.save}
        onSubmit={(name, emoji) => (renaming ? actions.rename.mutateAsync({ thing: renaming, title: name, emoji }) : Promise.resolve())}
      />
      <MoveSheet thing={moving} onClose={() => setMoving(null)} />
      <ConfirmSheet
        visible={!!deleting}
        onClose={() => setDeleting(null)}
        title={words.notes.space.deleteAsk.title(title(deleting))}
        body={deleting?.kind === 'folder' ? words.notes.space.deleteAsk.folder : words.notes.space.deleteAsk.thing}
        confirm={words.notes.space.deleteAsk.confirm}
        busy={actions.remove.isPending}
        problem={actions.remove.isError ? messageFor(actions.remove.error) : null}
        onConfirm={() => (deleting ? actions.remove.mutate(deleting, { onSuccess: () => setDeleting(null) }) : undefined)}
      />
    </>
  );
}

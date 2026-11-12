import { Fragment, type ReactNode } from 'react';
import { View } from 'react-native';

import { messageFor } from '@/api/fetcher';
import { type NoteItem, useGetFolderItemsInfinite } from '@/api/generated/homeport';
import { loadState } from '@/lib/loading';
import { Button } from '@/ui/Button';
import { Loading } from '@/ui/Loading';
import { MoreButton } from '@/ui/MoreButton';
import { Sk } from '@/ui/Skeleton';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

import { NoteRow } from './NoteRow';
import { paged, rows } from './pages';

/** What the rows of a tree share, however deep they are. */
export type Tree = {
  /** The folders whose insides are showing. */
  open: ReadonlySet<string>;
  /** The row that was opened last. */
  current: string | null;
  myMemberId?: string;
  /** A folder was pressed: show or hide what is in it. */
  onToggle: (item: NoteItem) => void;
  /** Anything else was pressed: open it. */
  onOpen: (item: NoteItem) => void;
  /** A row was held: its menu, with the folder it stands in and the rows next to it. */
  onMore: (item: NoteItem, where: { folderId: string; siblings: NoteItem[]; canOrder: boolean }) => void;
};

type Props = {
  folderId: string;
  /** True when the person may change the order of what is in this folder. */
  canOrder: boolean;
  depth?: number;
  tree: Tree;
  /** Shown in place of the rows of the top folder when it holds nothing. */
  empty?: ReactNode;
};

/**
 * What is in a folder, as rows, in the order people gave them: folders, pages, lists and sheets side by
 * side. A folder that is open shows its own rows right under it, one step further in, as deep as it goes.
 * Each folder's rows are asked for when it is opened, a page at a time.
 */
export function FolderTree({ folderId, canOrder, depth = 0, tree, empty }: Props) {
  const asked = useGetFolderItemsInfinite(folderId, undefined, { query: paged });
  const load = loadState(asked);
  const items = rows(asked.data);
  const inset = { paddingLeft: 42 + depth * 28, paddingRight: 20 } as const;

  if (load.error && !items) {
    return (
      <View style={[inset, { paddingVertical: 10, gap: 8, alignItems: 'flex-start' }]}>
        <Txt variant="footnote" color="muted">
          {messageFor(load.error)}
        </Txt>
        <Button label={words.common.tryAgain} variant="line" size="sm" loading={load.retrying} onPress={load.retry} />
      </View>
    );
  }
  if (!items) {
    if (load.offline) return <View style={{ minHeight: depth === 0 ? 220 : 90 }}>{<Loading offline />}</View>;
    return (
      <View accessibilityLabel={words.states.loading} style={[inset, { gap: 18, paddingVertical: 14 }]}>
        {Array.from({ length: depth === 0 ? 5 : 2 }, (_, index) => (
          <Sk key={index} width={index % 2 ? '55%' : '75%'} height={14} />
        ))}
      </View>
    );
  }
  if (items.length === 0) {
    return depth === 0 && empty ? (
      <>{empty}</>
    ) : (
      <Txt variant="footnote" color="muted" style={[inset, { paddingVertical: 8 }]}>
        {words.notes.space.emptyFolder}
      </Txt>
    );
  }
  return (
    <>
      {items.map((item) => {
        const id = item.id ?? '';
        const folder = item.kind === 'folder';
        const open = folder && tree.open.has(id);
        return (
          <Fragment key={id}>
            <NoteRow
              item={item}
              depth={depth}
              open={open}
              current={tree.current === id}
              myMemberId={tree.myMemberId}
              onPress={() => (folder ? tree.onToggle(item) : tree.onOpen(item))}
              onMore={() => tree.onMore(item, { folderId, siblings: items, canOrder })}
            />
            {open ? <FolderTree folderId={id} canOrder={!!item.canEdit} depth={depth + 1} tree={tree} /> : null}
          </Fragment>
        );
      })}
      <MoreButton pages={asked} />
    </>
  );
}

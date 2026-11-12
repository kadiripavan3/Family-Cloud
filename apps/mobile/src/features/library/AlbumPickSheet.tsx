import { Images, Plus } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { messageFor } from '@/api/fetcher';
import { type AlbumResponse, useGetAlbumsInfinite } from '@/api/generated/homeport';
import { paged, rows } from '@/api/pages';
import { loadState } from '@/lib/loading';
import { layout, radius, useTheme } from '@/theme';
import { Button } from '@/ui/Button';
import { Field } from '@/ui/Field';
import { Loading } from '@/ui/Loading';
import { MoreButton } from '@/ui/MoreButton';
import { Photo } from '@/ui/Photo';
import { Problem } from '@/ui/Problem';
import { Sheet, SheetRow } from '@/ui/Sheet';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

type Props = {
  circleId: string;
  visible: boolean;
  onClose: () => void;
  /** An album that is there already was chosen. */
  onPick: (album: AlbumResponse) => void;
  /** A new one was named: make it with what is being added. */
  onNew: (title: string) => void;
  /** The adding is on its way. */
  busy?: boolean;
  /** Why it didn't work, in a sentence. */
  problem?: string | null;
};

/** True for an album things can be put into by hand: not one that fills itself, not one that came from Journey, not a folder. */
export function takesByHand(album: AlbumResponse): boolean {
  return album.origin === 'hand' && !album.folder && (album.canEdit || album.everyoneAdds);
}

/**
 * Choosing the album something goes into: the albums that take things by hand, and a way to name a new
 * one. Used from a photo's menu and from the bar under a selection.
 */
export function AlbumPickSheet({ circleId, visible, onClose, onPick, onNew, busy, problem }: Props) {
  const { colors } = useTheme();
  const asked = useGetAlbumsInfinite(circleId, undefined, { query: { ...paged, enabled: visible } });
  const load = loadState(asked);
  const albums = rows(asked.data)?.filter(takesByHand);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const close = () => {
    setNaming(false);
    setName('');
    onClose();
  };
  return (
    <Sheet visible={visible} onClose={close} title={words.library.select.album.title}>
      {problem ? (
        <Txt variant="caption" color="danger" accessibilityLiveRegion="polite" style={{ paddingHorizontal: layout.gutter, paddingBottom: 8 }}>
          {problem}
        </Txt>
      ) : null}
      {load.error ? (
        <View style={{ minHeight: 180 }}>
          <Problem message={messageFor(load.error)} onRetry={load.retry} retrying={load.retrying} />
        </View>
      ) : !albums ? (
        <View style={{ minHeight: 180 }}>
          <Loading offline={load.offline} />
        </View>
      ) : (
        <>
          {albums.length === 0 ? (
            <Txt variant="bodySmall" color="muted" style={{ paddingHorizontal: layout.gutter, paddingVertical: 12 }}>
              {words.library.select.album.none}
            </Txt>
          ) : null}
          {albums.map((album, index) => (
            <SheetRow
              key={album.id}
              first={index === 0}
              icon={() => (album.coverUrl ? <Photo uri={album.coverUrl} radius="tile" style={{ width: 44, height: 44 }} /> : <Tile />)}
              label={album.title}
              note={words.library.album.things(album.count)}
              onPress={busy ? undefined : () => onPick(album)}
            />
          ))}
          <MoreButton pages={asked} />
          {naming ? (
            <View style={{ gap: 10, paddingHorizontal: layout.rowGutter, paddingTop: 12 }}>
              <Field label={words.library.select.album.name} value={name} onChangeText={setName} maxLength={200} autoFocus returnKeyType="done" onSubmitEditing={() => (name.trim() && !busy ? onNew(name.trim()) : undefined)} />
              <Button label={words.library.select.album.create} block loading={busy} disabled={!name.trim()} onPress={() => onNew(name.trim())} />
            </View>
          ) : (
            <SheetRow first={albums.length === 0} icon={() => <Tile plus color={colors.text} />} label={words.library.select.album.fresh} onPress={() => setNaming(true)} />
          )}
        </>
      )}
    </Sheet>
  );
}

/** The square where an album's cover would be, for one that has none (or for "New album"). */
function Tile({ plus, color }: { plus?: boolean; color?: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ width: 44, height: 44, borderRadius: radius.tile, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.fill }}>
      {plus ? <Plus size={20} color={color ?? colors.text} /> : <Images size={20} color={colors.muted} />}
    </View>
  );
}

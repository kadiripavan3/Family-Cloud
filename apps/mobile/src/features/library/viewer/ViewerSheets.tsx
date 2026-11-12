import { useMutation } from '@tanstack/react-query';
import { ImageMinus, Images, Info, Pencil, Trash2, UserRoundCheck } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { useCache } from '@/api/cache';
import { messageFor } from '@/api/fetcher';
import { changeLibraryItem, type PersonBrief } from '@/api/generated/homeport';
import { formatClock, formatWeekdayPast, timeAgo } from '@/lib/dates';
import { firstName } from '@/lib/names';
import { layout, useTheme } from '@/theme';
import { Button } from '@/ui/Button';
import { Field } from '@/ui/Field';
import { Sheet, SheetRow } from '@/ui/Sheet';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

import { formatBytes } from '../sizes';
import type { LibraryItem } from '../types';
import { dayOf } from '../wallRows';

const says = words.library.viewer;

type MenuProps = {
  visible: boolean;
  onClose: () => void;
  /** The caption, or "Photo". */
  title: string;
  about: readonly PersonBrief[];
  canEdit: boolean;
  mine: boolean;
  hasCaption: boolean;
  /** The album it was opened from, when it can be taken out of it. */
  album: string | null;
  takingOut?: boolean;
  problem?: string | null;
  onChoose: (next: 'tag' | 'album' | 'details' | 'caption' | 'delete' | 'takeOut') => void;
};

/** What the three dots over a photo offer: who is in it, an album to put it in, where and when, its caption, and deleting it if it is yours. */
export function ViewerMenu({ visible, onClose, title, about, canEdit, mine, hasCaption, album, takingOut, problem, onChoose }: MenuProps) {
  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      {problem ? (
        <Txt variant="caption" color="danger" accessibilityLiveRegion="polite" style={{ paddingHorizontal: layout.gutter, paddingBottom: 8 }}>
          {problem}
        </Txt>
      ) : null}
      <SheetRow first icon={(c) => <UserRoundCheck size={22} color={c} />} label={says.menu.who} note={about.length ? about.map((person) => firstName(person.name)).join(', ') : says.menu.nobody} onPress={() => onChoose('tag')} />
      <SheetRow icon={(c) => <Images size={22} color={c} />} label={says.menu.album} onPress={() => onChoose('album')} />
      {album ? <SheetRow icon={(c) => <ImageMinus size={22} color={c} />} label={says.menu.takeOut} note={album} onPress={takingOut ? undefined : () => onChoose('takeOut')} /> : null}
      <SheetRow icon={(c) => <Info size={22} color={c} />} label={says.menu.details} onPress={() => onChoose('details')} />
      {canEdit ? <SheetRow icon={(c) => <Pencil size={22} color={c} />} label={hasCaption ? says.menu.caption : says.menu.addCaption} onPress={() => onChoose('caption')} /> : null}
      {mine ? <SheetRow danger icon={(c) => <Trash2 size={22} color={c} />} label={says.menu.delete} onPress={() => onChoose('delete')} /> : null}
    </Sheet>
  );
}

/** Where and when: the day and the clock it was taken by, the place, who added it and when, the file, and the albums it is in. */
export function DetailsSheet({ data, visible, onClose }: { data: LibraryItem; visible: boolean; onClose: () => void }) {
  const { colors } = useTheme();
  const item = data.item;
  const rows: [string, string][] = [
    [says.details.taken, says.details.at(formatWeekdayPast(dayOf(item)), formatClock(item.takenLocal ?? ''))],
    [says.details.place, item.placeName ? says.details.placeIn(item.placeName, data.country) : says.details.noPlace],
    [says.details.added, says.details.addedBy(item.mine ? null : (item.addedBy?.name ?? null), timeAgo(data.addedAt))],
    [says.details.file, words.common.join([data.fileName, formatBytes(data.bytes)])],
    [says.details.albums, data.albums.length ? data.albums.map((album) => album.title).join(', ') : says.details.noAlbums],
  ];
  return (
    <Sheet visible={visible} onClose={onClose} title={says.details.title}>
      {rows.map(([label, value], index) => (
        <View key={label} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 16, paddingVertical: 12, paddingHorizontal: layout.gutter, borderTopWidth: index === 0 ? 0 : 1, borderTopColor: colors.line }}>
          <Txt variant="item" weight={600} style={{ width: 76 }}>
            {label}
          </Txt>
          <Txt variant="callout" color="muted" style={{ flex: 1 }}>
            {value}
          </Txt>
        </View>
      ))}
    </Sheet>
  );
}

/** A few words under a photo, written or changed by someone who may change it. */
export function CaptionSheet(props: { item: { id: string; circleId: string }; caption: string; visible: boolean; onClose: () => void }) {
  // What is typed starts from the caption each time the sheet opens.
  return <Captioning key={`${props.item.id}-${props.visible}`} {...props} />;
}

function Captioning({ item, caption, visible, onClose }: { item: { id: string; circleId: string }; caption: string; visible: boolean; onClose: () => void }) {
  const cache = useCache();
  const [text, setText] = useState(caption);
  const save = useMutation({
    mutationFn: () => changeLibraryItem(item.id, { title: text.trim() }),
    onSuccess: async () => {
      await cache.photoChanged(item);
      onClose();
    },
  });
  return (
    <Sheet visible={visible} onClose={onClose} title={says.caption.title}>
      <View style={{ gap: 12, paddingHorizontal: layout.rowGutter, paddingTop: 4 }}>
        <Field label={says.caption.field} value={text} onChangeText={setText} maxLength={200} autoFocus error={save.isError ? messageFor(save.error) : null} returnKeyType="done" onSubmitEditing={() => save.mutate()} />
        <Button label={says.caption.save} size="lg" block loading={save.isPending} onPress={() => save.mutate()} />
      </View>
    </Sheet>
  );
}

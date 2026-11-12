import { Check, CornerLeftUp, Folder } from 'lucide-react-native';
import { View } from 'react-native';

import { messageFor } from '@/api/fetcher';
import { useGetNotes } from '@/api/generated/homeport';
import { loadState } from '@/lib/loading';
import { useTheme } from '@/theme';
import { Emoji } from '@/ui/Emoji';
import { Loading } from '@/ui/Loading';
import { Problem } from '@/ui/Problem';
import { Sheet, SheetRow } from '@/ui/Sheet';
import { words } from '@/words';

/** Where a kept journey's book is filed: a folder by its id and its name, or nowhere. */
export type KeepIn = { folderId: string; title: string } | null;

type Props = { visible: boolean; onClose: () => void; circleId: string; value: KeepIn; onChoose: (next: KeepIn) => void };

/**
 * "Keep it in": the spaces of the circle the person may put things in (the top folders of Notes), and
 * "No folder". The book can be moved further in afterwards, like any page.
 */
export function KeepInSheet({ visible, onClose, circleId, value, onChoose }: Props) {
  const { colors } = useTheme();
  const says = words.together.keep.folderSheet;
  const asked = useGetNotes(circleId, { query: { enabled: visible } });
  const load = loadState(asked);
  const spaces = (asked.data?.spaces ?? []).filter((space) => space.canEdit);
  const tick = <Check size={20} color={colors.text} strokeWidth={2.6} />;
  const choose = (next: KeepIn) => {
    onChoose(next);
    onClose();
  };
  return (
    <Sheet visible={visible} onClose={onClose} title={says.title}>
      {load.error ? (
        <View style={{ minHeight: 200 }}>
          <Problem message={messageFor(load.error)} onRetry={load.retry} retrying={load.retrying} />
        </View>
      ) : !asked.data ? (
        <View style={{ minHeight: 160 }}>
          <Loading offline={load.offline} />
        </View>
      ) : (
        <View style={{ paddingBottom: 4 }}>
          <SheetRow first icon={(c) => <CornerLeftUp size={22} color={c} />} label={says.none} note={says.noneNote} trailing={value === null ? tick : undefined} onPress={() => choose(null)} />
          {spaces.map((space) => (
            <SheetRow
              key={space.id}
              icon={(c) => (space.emoji ? <Emoji char={space.emoji} size={22} /> : <Folder size={22} color={c} />)}
              label={space.title.trim() || words.things.untitled}
              trailing={value?.folderId === space.id ? tick : undefined}
              onPress={() => choose({ folderId: space.id, title: space.title.trim() || words.things.untitled })}
            />
          ))}
        </View>
      )}
    </Sheet>
  );
}

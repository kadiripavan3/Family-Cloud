import { Folder } from 'lucide-react-native';
import { View } from 'react-native';

import type { FolderResponse } from '@/api/generated/homeport';
import { useTheme } from '@/theme';
import { Emoji } from '@/ui/Emoji';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

/** On a form that makes a page or a list from inside a space: which folder the new thing is filed in. */
export function GoesInto({ folder }: { folder: FolderResponse }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 4 }}>
      {folder.emoji ? <Emoji char={folder.emoji} size={18} /> : <Folder size={16} color={colors.muted} />}
      <Txt variant="caption" color="muted">
        {words.notes.new.goesInto(folder.title.trim() || words.things.untitled)}
      </Txt>
    </View>
  );
}

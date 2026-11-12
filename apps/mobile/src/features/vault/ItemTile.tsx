import { View } from 'react-native';

import type { VaultCategory } from '@/api/generated/homeport';
import { radius, useTheme } from '@/theme';
import { Emoji } from '@/ui/Emoji';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

type Props = {
  category: VaultCategory;
  title: string;
  /** 44 in a list, 64 at the top of the item's own page. */
  size?: 44 | 64;
};

/** The square in front of an item: a login's first letter on ink, any other drawer's emoji on a soft tile. */
export function ItemTile({ category, title, size = 44 }: Props) {
  const { colors } = useTheme();
  const big = size === 64;
  const frame = { width: size, height: size, borderRadius: big ? radius.card : radius.thumb, alignItems: 'center', justifyContent: 'center' } as const;
  const letter = [...title.trim()][0]?.toUpperCase();
  if (category === 'login' && letter) {
    return (
      <View style={[frame, { backgroundColor: colors.text }]}>
        <Txt variant={big ? 'titleLarge' : 'subheading'} allowFontScaling={false} style={{ color: colors.bg }}>
          {letter}
        </Txt>
      </View>
    );
  }
  return (
    <View style={[frame, { backgroundColor: colors.fill }]}>
      <Emoji char={words.vault.drawers[category].emoji} size={big ? 34 : 24} />
    </View>
  );
}

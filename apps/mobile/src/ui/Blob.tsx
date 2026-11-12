import { View } from 'react-native';

import { radius, useTheme } from '@/theme';

import { Emoji } from './Emoji';

/** A big emoji on a soft round ground: the picture at the top of a moment worth marking. */
export function Blob({ emoji, size = 116 }: { emoji: string; size?: number }) {
  const { colors } = useTheme();
  return (
    <View style={{ width: size, height: size, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentSoft }}>
      <Emoji char={emoji} size={Math.round(size * 0.56)} />
    </View>
  );
}

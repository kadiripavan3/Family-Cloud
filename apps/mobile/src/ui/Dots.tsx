import { View } from 'react-native';

import { radius, useTheme } from '@/theme';
import { words } from '@/words';

/** A row of small dots under a set of cards that are shown one at a time; the one in front is a longer dash. */
export function Dots({ count, at }: { count: number; at: number }) {
  const { colors } = useTheme();
  return (
    <View accessible accessibilityLabel={words.common.stepOf(at + 1, count)} style={{ flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
      {Array.from({ length: count }, (_, index) => (
        <View key={index} style={{ width: index === at ? 22 : 7, height: 7, borderRadius: radius.pill, backgroundColor: index === at ? colors.text : colors.fill2 }} />
      ))}
    </View>
  );
}

import type { ReactNode } from 'react';
import { type StyleProp, View, type ViewStyle } from 'react-native';

import { radius, useTheme } from '@/theme';

/** A raised surface for a group of rows or a card. */
export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { colors, shadow } = useTheme();
  return <View style={[{ borderRadius: radius.cardLarge, backgroundColor: colors.surface, boxShadow: shadow.sm }, style]}>{children}</View>;
}

import { BlurView } from 'expo-blur';
import type { ReactNode } from 'react';
import { Platform, type StyleProp, View, type ViewStyle } from 'react-native';

import { type Radius, radius as radii, useTheme, withAlpha } from '@/theme';

type Props = { children: ReactNode; radius: Radius; style?: StyleProp<ViewStyle>; contentStyle?: StyleProp<ViewStyle> };

/** A frosted bar that floats over the page: what is underneath shows through, blurred, so the bar's own text stays readable. */
export function GlassBar({ children, radius, style, contentStyle }: Props) {
  const { colors, scheme, shadow } = useTheme();
  return (
    <View style={[{ borderRadius: radii[radius], overflow: 'hidden', borderWidth: 1, borderColor: colors.glassLine, boxShadow: shadow.md }, style]}>
      {Platform.OS === 'android' ? (
        // No blur on Android without wiring the bar to what is behind it (see Frost): the bar is nearly solid there instead.
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: withAlpha(colors.bg, 0.9) }} />
      ) : (
        <BlurView intensity={50} tint={scheme} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
      )}
      <View style={[{ backgroundColor: colors.glassStrong }, contentStyle]}>{children}</View>
    </View>
  );
}

import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import { type StyleProp, View, type ViewStyle } from 'react-native';

import { type Radius, radius as radii, useTheme } from '@/theme';

/** A photo that fills its box, with the page's fill colour while it loads. Its corners are a radius token, or "none" for a photo that runs edge to edge. */
export function Photo({ uri, style, radius = 'card', children, label }: { uri?: string | null; style?: StyleProp<ViewStyle>; radius?: Radius | 'none'; children?: ReactNode; label?: string }) {
  const { colors } = useTheme();
  const corner = radius === 'none' ? 0 : radii[radius];
  return (
    <View style={[{ borderRadius: corner, overflow: 'hidden', backgroundColor: colors.fill }, style]}>
      {uri ? (
        // A row that is reused for something else must not show the last one's picture while the new one loads.
        <Image source={{ uri }} recyclingKey={uri} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} contentFit="cover" transition={150} accessible={!!label} accessibilityLabel={label} />
      ) : null}
      {children}
    </View>
  );
}

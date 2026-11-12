import { useEffect } from 'react';
import { type DimensionValue, type StyleProp, View, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { layout, type Radius, radius as radii, useTheme } from '@/theme';
import { words } from '@/words';

/**
 * Loading: grey shapes in the screen's own layout while content loads, never a spinner on a blank page.
 * The shapes breathe softly; with Reduce Motion on they stay still.
 */
export function Sk({ width, height, radius = 'tile', style }: { width?: DimensionValue; height: DimensionValue; radius?: Radius | 'none'; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  const glow = useSharedValue(1);
  useEffect(() => {
    glow.set(withRepeat(withTiming(0.5, { duration: 800 }), -1, true));
  }, [glow]);
  const breathing = useAnimatedStyle(() => ({ opacity: glow.get() }));
  const corner = radius === 'none' ? 0 : radii[radius];
  return <Animated.View style={[{ width, height, borderRadius: corner, backgroundColor: colors.fill2 }, breathing, style]} />;
}

/** Photo cards in a row, as on Home. */
export function RailSkeleton({ size = 232, count = 2 }: { size?: number; count?: number }) {
  return (
    <View accessibilityLabel={words.states.loading} style={{ marginTop: 24 }}>
      <Sk width={210} height={22} style={{ marginLeft: layout.rowGutter, marginBottom: 14 }} />
      <View style={{ flexDirection: 'row', gap: 14, paddingHorizontal: layout.barGutter, overflow: 'hidden' }}>
        {Array.from({ length: count }, (_, i) => (
          <View key={i} style={{ width: size, gap: 8 }}>
            <Sk height={size} radius="card" />
            <Sk width="80%" height={14} />
            <Sk width="55%" height={12} />
          </View>
        ))}
      </View>
    </View>
  );
}

/** Rows with a small picture and two lines, as in lists of people and in Activity. */
export function ListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <View accessibilityLabel={words.states.loading} style={{ paddingTop: 8 }}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: layout.rowGutter }}>
          <Sk width={56} height={56} radius="field" />
          <View style={{ flex: 1, gap: 8 }}>
            <Sk width="70%" height={14} />
            <Sk width="45%" height={12} />
          </View>
        </View>
      ))}
    </View>
  );
}

/** Cards with a wide photo, one under another. */
export function CardSkeleton({ count = 2 }: { count?: number }) {
  return (
    <View accessibilityLabel={words.states.loading} style={{ paddingHorizontal: layout.barGutter, paddingTop: 8, gap: 14 }}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={{ gap: 10 }}>
          <Sk height={200} radius="card" />
          <Sk width="65%" height={16} />
          <Sk width="90%" height={12} />
        </View>
      ))}
    </View>
  );
}

/**
 * A page that opens with a photo and a sheet over it: the photo, the round picture on the sheet's edge, a
 * title, a line, the row of numbers and a few rows.
 */
export function HeroSkeleton({ photo = 338 }: { photo?: number }) {
  const { colors } = useTheme();
  return (
    <View accessibilityLabel={words.states.loading} style={{ flex: 1 }}>
      <Sk height={photo} radius="none" />
      <View style={{ flex: 1, marginTop: -30, paddingTop: 52, paddingHorizontal: layout.gutter, alignItems: 'center', gap: 12, borderTopLeftRadius: radii.sheet, borderTopRightRadius: radii.sheet, backgroundColor: colors.bg }}>
        <View style={{ position: 'absolute', top: -38, borderRadius: radii.pill, borderWidth: 4, borderColor: colors.bg, backgroundColor: colors.bg }}>
          <Sk width={76} height={76} radius="pill" />
        </View>
        <Sk width="70%" height={26} />
        <Sk width="45%" height={14} />
        <Sk height={58} radius="field" style={{ alignSelf: 'stretch', marginTop: 6 }} />
        <View style={{ alignSelf: 'stretch', marginHorizontal: -layout.gutter }}>
          <ListSkeleton count={3} />
        </View>
      </View>
    </View>
  );
}

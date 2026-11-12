import { View } from 'react-native';

import { radius, useTheme } from '@/theme';

/** A thin bar that fills from the left: how far along something is, from 0 to 1. */
export function ProgressBar({ fraction }: { fraction: number }) {
  const { colors } = useTheme();
  const part = Math.min(Math.max(fraction, 0), 1);
  return (
    <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(part * 100) }} style={{ height: 4, borderRadius: radius.pill, overflow: 'hidden', backgroundColor: colors.fill2 }}>
      <View style={{ width: `${part * 100}%`, height: 4, borderRadius: radius.pill, backgroundColor: colors.accent }} />
    </View>
  );
}

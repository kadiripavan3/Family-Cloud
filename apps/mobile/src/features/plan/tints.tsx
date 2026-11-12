import { View } from 'react-native';

import type { DotResponse } from '@/api/generated/homeport';
import { type Colors, radius, useTheme } from '@/theme';

/**
 * The colour that tells one person apart in a calendar: the API gives each person of a circle one of five
 * tints, and 0 means "everyone's". A tint is only ever a dot, next to a face or a name.
 */
export function tintColor(colors: Colors, tint: number | null | undefined): string {
  switch (tint) {
    case 1:
      return colors.tint1;
    case 2:
      return colors.tint2;
    case 3:
      return colors.tint3;
    case 4:
      return colors.tint4;
    case 5:
      return colors.tint5;
    default:
      return colors.accent;
  }
}

/** One small dot in a person's tint. */
export function TintDot({ tint }: { tint: number | null | undefined }) {
  const { colors } = useTheme();
  return <View style={{ width: 6, height: 6, borderRadius: radius.pill, backgroundColor: tintColor(colors, tint) }} />;
}

/** How many dots fit under a day before they would run into the next one. */
const MOST = 4;

/** The row of dots under a day: one per person who has something on it. It keeps its height when there are none. */
export function TintDots({ dots }: { dots: readonly DotResponse[] }) {
  return (
    <View style={{ flexDirection: 'row', gap: 3, height: 6 }}>
      {dots.slice(0, MOST).map((dot, index) => (
        <TintDot key={dot.memberId ?? index} tint={dot.tint} />
      ))}
    </View>
  );
}

import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { useTheme } from '@/theme';
import { motion } from '@/theme/tokens';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const SIZE = 112;
const STROKE = 11;

/**
 * The big ring of a goal: how far it is as a number in the middle ("70%") with a small word under it
 * ("saved", or how much that is). It fills when it appears.
 */
export function BigRing({ percent, under }: { percent: number; under?: string | null }) {
  const { colors } = useTheme();
  const r = (SIZE - STROKE) / 2;
  const around = 2 * Math.PI * r;
  const done = Math.max(0, Math.min(1, percent / 100));
  const shown = useSharedValue(0);
  useEffect(() => {
    shown.set(withTiming(done, { duration: motion.slow }));
  }, [done, shown]);
  const arc = useAnimatedProps(() => ({ strokeDasharray: [around * shown.get(), around] }));
  return (
    <View accessible accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: percent }} style={{ width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={SIZE} height={SIZE} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={SIZE / 2} cy={SIZE / 2} r={r} stroke={colors.fill2} strokeWidth={STROKE} fill="none" />
        {done > 0 ? <AnimatedCircle cx={SIZE / 2} cy={SIZE / 2} r={r} stroke={colors.accent} strokeWidth={STROKE} fill="none" animatedProps={arc} /> : null}
      </Svg>
      <Txt variant="displayLarge" allowFontScaling={false} numberOfLines={1}>
        {words.plan.goal.percent(percent)}
      </Txt>
      {under ? (
        <Txt variant="tiny" color="muted" allowFontScaling={false} numberOfLines={1} style={{ maxWidth: SIZE - 2 * STROKE - 8 }}>
          {under}
        </Txt>
      ) : null}
    </View>
  );
}

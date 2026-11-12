import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { useTheme } from '@/theme';
import { motion } from '@/theme/tokens';

import { Emoji } from './Emoji';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** A progress ring around an emoji: how far along a goal is. It fills when it appears. */
export function Ring({ progress, emoji, size = 62 }: { progress: number; emoji: string; size?: number }) {
  const { colors } = useTheme();
  const stroke = 6;
  const r = (size - stroke) / 2;
  const around = 2 * Math.PI * r;
  const done = Math.max(0, Math.min(1, progress));
  const shown = useSharedValue(0);
  useEffect(() => {
    shown.set(withTiming(done, { duration: motion.slow }));
  }, [done, shown]);
  const arc = useAnimatedProps(() => ({ strokeDasharray: [around * shown.get(), around] }));
  return (
    <View accessible={false} style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.fill2} strokeWidth={stroke} fill="none" />
        {done > 0 ? <AnimatedCircle cx={size / 2} cy={size / 2} r={r} stroke={colors.accent} strokeWidth={stroke} fill="none" strokeLinecap="round" animatedProps={arc} /> : null}
      </Svg>
      <Emoji char={emoji} size={Math.round(size * 0.45)} />
    </View>
  );
}

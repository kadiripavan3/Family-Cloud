import type { ReactNode } from 'react';
import { type LayoutChangeEvent, Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { motion } from '@/theme/tokens';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** A quick, slightly bouncy spring, used for everything that reacts to a touch. */
export const SPRING = { damping: 18, stiffness: 320, mass: 0.6 } as const;

type TapProps = Omit<PressableProps, 'style' | 'children'> & {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** How far it shrinks while pressed. Smaller things can shrink more. */
  scaleTo?: number;
};

/**
 * Something you can press. It shrinks a touch while your finger is down and springs back.
 * With the phone's Reduce Motion on, it doesn't move.
 */
export function Tap({ children, style, scaleTo = motion.pressScale, onPressIn, onPressOut, disabled, ...rest }: TapProps) {
  const pressed = useSharedValue(0);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: withSpring(1 - pressed.get() * (1 - scaleTo), SPRING) }] }));
  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      onPressIn={(event) => {
        pressed.set(1);
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        pressed.set(0);
        onPressOut?.(event);
      }}
      style={[style, animated]}>
      {children}
    </AnimatedPressable>
  );
}

/** A list item arriving: it fades in and rises a little, each one just after the one before. Only the first few are staggered. */
export function Rise({ index = 0, children, style, onLayout }: { index?: number; children: ReactNode; style?: StyleProp<ViewStyle>; onLayout?: (event: LayoutChangeEvent) => void }) {
  return (
    <Animated.View entering={FadeInDown.duration(motion.base + 80).delay(Math.min(index, 6) * motion.stagger)} style={style} onLayout={onLayout}>
      {children}
    </Animated.View>
  );
}

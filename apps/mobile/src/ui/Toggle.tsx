import { Pressable } from 'react-native';
import Animated, { useAnimatedStyle, withSpring } from 'react-native-reanimated';

import { radius, useTheme } from '@/theme';

import { SPRING } from './Motion';

/** An on/off switch drawn with the app's colours. */
export function Toggle({ value, onChange, label }: { value: boolean; onChange: (next: boolean) => void; label: string }) {
  const { colors, shadow } = useTheme();
  const knob = useAnimatedStyle(() => ({ transform: [{ translateX: withSpring(value ? 20 : 0, SPRING) }] }), [value]);
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      // Said this way, a browser hears whether it is on as well: the web takes no `accessibilityState`.
      aria-checked={value}
      hitSlop={8}
      onPress={() => onChange(!value)}
      style={{ width: 50, height: 30, borderRadius: radius.pill, padding: 3, backgroundColor: value ? colors.accent : colors.fill2 }}>
      <Animated.View style={[{ width: 24, height: 24, borderRadius: radius.pill, backgroundColor: colors.white, boxShadow: shadow.knob }, knob]} />
    </Pressable>
  );
}

import type { ReactNode } from 'react';
import { ActivityIndicator, type StyleProp, type ViewStyle } from 'react-native';

import { radius, type TypeVariant, useTheme } from '@/theme';

import { Frost } from './Frost';
import { Tap } from './Motion';
import { Txt } from './Txt';

type Variant = 'primary' | 'ink' | 'line' | 'soft' | 'glass' | 'quiet' | 'danger';
type Size = 'lg' | 'md' | 'sm';

type Props = {
  label: string;
  /** What a screen reader says in place of the label, where the label needs what is around it to make sense ("Continue as Nora"). */
  spoken?: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  /** Shown before the label. Receives the colour the label uses. */
  icon?: (color: string) => ReactNode;
  loading?: boolean;
  disabled?: boolean;
  /** Stretch to the full width of the parent. */
  block?: boolean;
  /** Set when the button sits in a row beside other things, so it is centred on the row instead of pinned to its top. */
  inline?: boolean;
  style?: StyleProp<ViewStyle>;
};

const HEIGHT = { lg: 54, md: 46, sm: 36 } as const;
const TEXT: Record<Size, TypeVariant> = { lg: 'headline', md: 'item', sm: 'callout' };
const PADDING = { lg: 22, md: 20, sm: 16 } as const;

export function Button({ label, spoken, onPress, variant = 'primary', size = 'md', icon, loading, disabled, block, inline, style }: Props) {
  const { colors } = useTheme();
  const look: Record<Variant, { bg: string; fg: string; border?: string }> = {
    primary: { bg: colors.accent, fg: colors.onAccent },
    ink: { bg: colors.text, fg: colors.bg },
    line: { bg: 'transparent', fg: colors.text, border: colors.lineStrong },
    soft: { bg: colors.fill, fg: colors.text },
    glass: { bg: colors.photoGlass, fg: colors.onPhoto, border: colors.photoGlassLine },
    quiet: { bg: 'transparent', fg: colors.text },
    danger: { bg: colors.danger, fg: colors.onDanger },
  };
  const { bg, fg, border } = look[variant];
  const inactive = disabled || loading;

  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel={spoken ?? label}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      // The small button is drawn 36 pt high; the finger still gets 44.
      hitSlop={size === 'sm' ? 4 : undefined}
      onPress={onPress}
      style={[
        {
          minHeight: HEIGHT[size],
          paddingHorizontal: PADDING[size],
          borderRadius: radius.pill,
          backgroundColor: bg,
          borderWidth: border ? 1.5 : 0,
          borderColor: border,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          alignSelf: block ? 'stretch' : inline ? 'center' : 'flex-start',
          opacity: disabled ? 0.38 : 1,
          overflow: variant === 'glass' ? 'hidden' : undefined,
        },
        style,
      ]}>
      {variant === 'glass' ? <Frost tone="dark" /> : null}
      {loading ? <ActivityIndicator color={fg} /> : icon?.(fg)}
      <Txt variant={TEXT[size]} weight={700} numberOfLines={1} style={{ color: fg, textDecorationLine: variant === 'quiet' ? 'underline' : 'none' }}>
        {label}
      </Txt>
    </Tap>
  );
}

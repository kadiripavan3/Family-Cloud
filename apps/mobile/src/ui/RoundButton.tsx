import type { ReactNode } from 'react';

import { radius, useTheme } from '@/theme';

import { Frost } from './Frost';
import { Tap } from './Motion';

type Props = {
  /** What the button does, for screen readers. */
  label: string;
  onPress?: () => void;
  icon: (color: string) => ReactNode;
  /** "photo" sits on a picture; "soft" sits on the page. */
  tone?: 'soft' | 'photo';
};

/** A round icon button, such as Back or Close. 40 pt wide, with a 44 pt touch area. */
export function RoundButton({ label, onPress, icon, tone = 'soft' }: Props) {
  const { colors } = useTheme();
  const onPhoto = tone === 'photo';
  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
      onPress={onPress}
      scaleTo={0.9}
      style={{
        width: 40,
        height: 40,
        borderRadius: radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        backgroundColor: onPhoto ? colors.photoGlass : colors.fill,
        borderWidth: onPhoto ? 1 : 0,
        borderColor: colors.photoGlassLine,
      }}>
      {onPhoto ? <Frost tone="dark" /> : null}
      {icon(onPhoto ? colors.onPhoto : colors.text)}
    </Tap>
  );
}

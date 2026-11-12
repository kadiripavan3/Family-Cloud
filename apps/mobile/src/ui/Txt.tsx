import { Text, type TextProps } from 'react-native';

import { type Colors, type FontWeight, textStyle, type TypeVariant, useTheme } from '@/theme';

type Props = TextProps & {
  /** One of the text styles from the design tokens. It sets the size, line height, weight and letter spacing. */
  variant?: TypeVariant;
  /** A colour name from the theme, or any colour value. */
  color?: keyof Colors | (string & {});
  /** A different weight than the variant's own. */
  weight?: FontWeight;
  /** Slanted, for a quiet aside or someone's own words. There is one slanted face, semi-bold, so `weight` is ignored. */
  italic?: boolean;
  center?: boolean;
};

/**
 * How far text follows the phone's text size setting. It grows with it, up to this much: beyond that, rows
 * and bars made for one line stop holding their words.
 */
export const MAX_TEXT_SCALE = 1.6;

/** All text in the app goes through here, so every size, weight and colour comes from the tokens. */
export function Txt({ variant = 'body', color = 'text', weight, italic, center, style, ...rest }: Props) {
  const theme = useTheme();
  const resolved = color in theme.colors ? theme.colors[color as keyof Colors] : color;
  return (
    <Text
      maxFontSizeMultiplier={MAX_TEXT_SCALE}
      {...rest}
      style={[
        textStyle(variant, weight, { italic }),
        {
          color: resolved,
          textTransform: 'uppercase' in theme.type[variant] ? 'uppercase' : undefined,
          textAlign: center ? 'center' : undefined,
        },
        style,
      ]}
    />
  );
}

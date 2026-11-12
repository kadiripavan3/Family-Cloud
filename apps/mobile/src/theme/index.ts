import { type TextStyle, useColorScheme } from 'react-native';

import { useAppearance } from './appearance';
import { layout, motion, palettes, radius, shadows, space, type } from './tokens';

export { layout, motion, radius, space };

export type Scheme = 'light' | 'dark';
export type Colors = { [K in keyof (typeof palettes)['light']]: string };
/** One of the text styles in the design tokens: "body", "caption", "titleSmall" and so on. */
export type TypeVariant = keyof typeof type;
/** One of the corner sizes in the design tokens: "card", "sheet", "pill" and so on. */
export type Radius = keyof typeof radius;

/** The font file for each weight of Plus Jakarta Sans (loaded in the root layout). */
export const fontFor = {
  400: 'PlusJakartaSans_400Regular',
  500: 'PlusJakartaSans_500Medium',
  600: 'PlusJakartaSans_600SemiBold',
  700: 'PlusJakartaSans_700Bold',
  800: 'PlusJakartaSans_800ExtraBold',
} as const;
export type FontWeight = keyof typeof fontFor;

/**
 * The one slanted face (loaded in the root layout): for a quiet aside or someone's own words, always at
 * this weight.
 */
export const italicFont = 'PlusJakartaSans_600SemiBold_Italic';

export type Theme = {
  scheme: Scheme;
  colors: Colors;
  /** Box shadows: "md" lifts cards and bars, "sm" outlines quiet surfaces; "sheet", "knob", "float" and "stage" are for those places only. */
  shadow: { [K in keyof (typeof shadows)['light']]: string };
  radius: typeof radius;
  space: typeof space;
  layout: typeof layout;
  type: typeof type;
};

export function themeFor(scheme: Scheme): Theme {
  return { scheme, colors: palettes[scheme], shadow: shadows[scheme], radius, space, layout, type };
}

/** The theme in use: the person's own choice of light or dark, or else what the phone is set to. */
export function useTheme(): Theme {
  const system = useColorScheme() === 'dark' ? 'dark' : 'light';
  const chosen = useAppearance();
  return themeFor(chosen === 'system' ? system : chosen);
}

/** Always-dark theme, for screens that sit on a full-bleed photo. */
export const darkTheme = themeFor('dark');

/**
 * A text style from the tokens, for the few things that can't be a `Txt`: a box you type in, mostly.
 * Say `oneLine` for a one-line box: the phone centres the text itself there, so the line height is left out.
 */
export function textStyle(variant: TypeVariant, weight?: FontWeight, options: { oneLine?: boolean; italic?: boolean } = {}): TextStyle {
  const t = type[variant];
  return {
    fontFamily: options.italic ? italicFont : fontFor[weight ?? t.weight],
    fontSize: t.fontSize,
    letterSpacing: t.letterSpacing,
    ...(options.oneLine ? null : { lineHeight: t.lineHeight }),
  };
}

/** A token colour made see-through, for the shades laid over photos: `withAlpha(colors.stage, 0.45)`. */
export function withAlpha(hex: string, alpha: number): string {
  const full = hex.length === 4 ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}` : hex;
  const channel = (at: number) => parseInt(full.slice(at, at + 2), 16);
  return `rgba(${channel(1)}, ${channel(3)}, ${channel(5)}, ${alpha})`;
}

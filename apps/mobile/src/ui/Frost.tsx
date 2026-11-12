import { BlurView } from 'expo-blur';
import { Platform, View } from 'react-native';

import { darkTheme, useTheme, withAlpha } from '@/theme';

type Props = {
  tone?: 'theme' | 'dark';
  intensity?: number;
  /**
   * "blur" softens what is behind: for the one bar, sheet or button a screen has on a photo.
   * "tint" only darkens it a little and costs nothing to draw: for labels that repeat down a list.
   */
  mode?: 'blur' | 'tint';
};

const FILL = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: -1 } as const;

/**
 * What sits behind a glass control. Put it first inside a view that has rounded corners and `overflow: 'hidden'`,
 * and give that view a see-through colour: what is behind shows through, softened.
 * It sits behind everything else in that view, so icons and text stay sharp on top.
 */
export function Frost({ tone = 'theme', intensity = 28, mode = 'blur' }: Props) {
  const { scheme, colors } = useTheme();
  if (mode === 'tint') {
    // The theme's own glass colour is nearly solid already; on a photo the label needs a little more behind it.
    return tone === 'dark' ? <View pointerEvents="none" style={[FILL, { backgroundColor: colors.photoTint }]} /> : null;
  }
  if (Platform.OS === 'android') {
    // Android can only blur an area that has been wired to what lies behind it (expo-blur's BlurTargetView);
    // without that the library draws a thin see-through sheet, and words on a busy photo get hard to read.
    // So Android gets a denser tint on purpose: the glass is darker (or more solid) there, never unreadable.
    return <View pointerEvents="none" style={[FILL, { backgroundColor: tone === 'dark' ? withAlpha(darkTheme.colors.stage, 0.5) : withAlpha(colors.bg, 0.8) }]} />;
  }
  return <BlurView pointerEvents="none" intensity={intensity} tint={tone === 'dark' ? 'dark' : scheme} style={FILL} />;
}

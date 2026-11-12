import type { ReactNode } from 'react';
import { type StyleProp, View, type ViewStyle } from 'react-native';

import { radius, useTheme } from '@/theme';

import { Frost } from './Frost';
import { Txt } from './Txt';

/**
 * A small label on a photo, such as "3 new" or "Most loved". Labels repeat down a list, so by default the glass is
 * a tint; pass `frost="blur"` for the one label on a full-photo screen.
 */
export function Pill({ label, icon, tone = 'glass', frost = 'tint', style }: { label: string; icon?: (color: string) => ReactNode; tone?: 'glass' | 'accent' | 'photo'; frost?: 'tint' | 'blur'; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  const bg = tone === 'accent' ? colors.accent : tone === 'photo' ? colors.photoGlass : colors.glassStrong;
  const fg = tone === 'accent' ? colors.onAccent : tone === 'photo' ? colors.onPhoto : colors.text;
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 5, paddingHorizontal: 10, borderRadius: radius.thumb, overflow: 'hidden', backgroundColor: bg, alignSelf: 'flex-start' }, style]}>
      {tone === 'accent' ? null : <Frost tone={tone === 'photo' ? 'dark' : 'theme'} intensity={20} mode={frost} />}
      {icon?.(fg)}
      <Txt variant="small" weight={700} style={{ color: fg }}>
        {label}
      </Txt>
    </View>
  );
}

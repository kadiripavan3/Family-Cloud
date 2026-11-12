import type { ReactNode } from 'react';
import { type StyleProp, View, type ViewStyle } from 'react-native';

import { radius, useTheme } from '@/theme';

import { Txt } from './Txt';

type Props = {
  /** Shown at the left. Receives the colour for the box's tone. */
  icon: (color: string) => ReactNode;
  /** A short bold line above the text. */
  title?: string;
  children: ReactNode;
  /** "warn" colours the icon for something that needs attention; the box itself stays quiet. */
  tone?: 'plain' | 'warn';
  style?: StyleProp<ViewStyle>;
};

/** A quiet box that explains something: an icon, an optional bold line and a sentence or two. */
export function NoteBox({ icon, title, children, tone = 'plain', style }: Props) {
  const { colors } = useTheme();
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 13, paddingHorizontal: 14, borderRadius: radius.photo, backgroundColor: colors.fill }, style]}>
      <View style={{ marginTop: 1 }}>{icon(tone === 'warn' ? colors.warn : colors.text)}</View>
      <View style={{ flex: 1 }}>
        {title ? (
          <Txt variant="control" weight={800}>
            {title}
          </Txt>
        ) : null}
        <Txt variant="note">{children}</Txt>
      </View>
    </View>
  );
}

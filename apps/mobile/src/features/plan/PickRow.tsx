import { Check } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { layout, radius, useTheme } from '@/theme';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

type Props = {
  label: string;
  note?: string;
  /** Shown before the label: a face, an icon. */
  leading?: ReactNode;
  chosen: boolean;
  /** "radio" for one of several, "checkbox" for any number of them. */
  role?: 'radio' | 'checkbox';
  onPress: () => void;
  first?: boolean;
};

/** One choice in a sheet: what it is, a line about it, and a tick in a filled circle when it is the chosen one. */
export function PickRow({ label, note, leading, chosen, role = 'radio', onPress, first }: Props) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityLabel={words.common.spoken([label, note])}
      accessibilityState={{ checked: chosen }}
      // Said this way, a browser hears which one is chosen as well: the web takes no `accessibilityState`.
      aria-checked={chosen}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        minHeight: 52,
        paddingVertical: 11,
        paddingHorizontal: layout.gutter,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: colors.line,
        backgroundColor: pressed ? colors.fill : 'transparent',
      })}>
      {leading}
      <View style={{ flex: 1, gap: 1 }}>
        <Txt variant="headline" weight={600}>
          {label}
        </Txt>
        {note ? (
          <Txt variant="footnote" color="muted">
            {note}
          </Txt>
        ) : null}
      </View>
      <View style={{ width: 24, height: 24, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', borderWidth: chosen ? 0 : 2, borderColor: colors.lineStrong, backgroundColor: chosen ? colors.accent : 'transparent' }}>
        {chosen ? <Check size={14} color={colors.onAccent} strokeWidth={3} /> : null}
      </View>
    </Pressable>
  );
}

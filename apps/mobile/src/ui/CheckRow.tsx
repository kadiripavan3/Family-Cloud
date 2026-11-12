import { Check } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, type StyleProp, View, type ViewStyle } from 'react-native';

import { radius, useTheme } from '@/theme';

import { Txt } from './Txt';

type Props = {
  /** What ticking the box says, such as "I'm 13 or older". */
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  /** A smaller line under the label. */
  note?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

/** A box to tick, with the sentence it stands for. The whole row can be pressed. */
export function CheckRow({ label, checked, onChange, note, style }: Props) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      // Said this way, a browser hears whether it is ticked as well: the web takes no `accessibilityState`.
      aria-checked={checked}
      hitSlop={6}
      onPress={() => onChange(!checked)}
      style={[{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }, style]}>
      <View
        style={{
          width: 24,
          height: 24,
          borderRadius: radius.chip,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: checked ? 0 : 2,
          borderColor: colors.lineStrong,
          backgroundColor: checked ? colors.accent : 'transparent',
        }}>
        {checked ? <Check size={16} color={colors.onAccent} strokeWidth={3} /> : null}
      </View>
      <View style={{ flex: 1, gap: 2, paddingTop: 2 }}>
        <Txt variant="item" weight={600}>
          {label}
        </Txt>
        {note}
      </View>
    </Pressable>
  );
}

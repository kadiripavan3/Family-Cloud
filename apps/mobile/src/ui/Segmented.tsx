import { type StyleProp, View, type ViewStyle } from 'react-native';

import { layout, radius, useTheme } from '@/theme';

import { Tap } from './Motion';
import { Txt } from './Txt';

type Props<T extends string> = {
  options: readonly { id: T; label: string }[];
  value: T;
  onChange?: (id: T) => void;
  /** What the group is for, for screen readers: "Kind of circle". */
  label: string;
  /** Shown, but can't be changed: someone else decides this. */
  locked?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** A few choices side by side in one grey bar, the chosen one raised: Child, Teen, Adult. */
export function Segmented<T extends string>({ options, value, onChange, label, locked, style }: Props<T>) {
  const { colors, shadow } = useTheme();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={[{ flexDirection: 'row', marginHorizontal: layout.barGutter, padding: 4, borderRadius: radius.field, backgroundColor: colors.fill }, style]}>
      {options.map((option) => {
        const on = option.id === value;
        return (
          <Tap
            key={option.id}
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            accessibilityState={{ checked: on, disabled: !!locked }}
            // Said this way, a browser hears which one is chosen as well: the web takes no `accessibilityState`.
            aria-checked={on}
            disabled={locked}
            onPress={() => onChange?.(option.id)}
            scaleTo={0.96}
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 38, paddingVertical: 9, paddingHorizontal: 6, borderRadius: radius.tile, backgroundColor: on ? colors.bg : 'transparent', boxShadow: on ? shadow.knob : undefined }}>
            <Txt variant="callout" weight={700} numberOfLines={1} style={{ color: on ? colors.text : colors.muted }}>
              {option.label}
            </Txt>
          </Tap>
        );
      })}
    </View>
  );
}

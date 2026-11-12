import { Check, Plus } from 'lucide-react-native';
import { View } from 'react-native';

import type { KittyItemResponse } from '@/api/generated/homeport';
import { layout, radius, useTheme } from '@/theme';
import { Tap } from '@/ui/Motion';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

type Props = {
  items: readonly KittyItemResponse[];
  /** One was tapped: mark it as running low, or as not. Left out for someone who may only look. */
  onToggle?: (item: KittyItemResponse) => void;
};

/**
 * The flat's usual things as chips that wrap: ticked and in the accent colour while one is running low, a
 * plus in front of the rest. A tap says it is running low, or that it isn't any more. The kitty draws them,
 * and so does a flat's Today.
 */
export function LowChips({ items, onToggle }: Props) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 2, paddingHorizontal: layout.barGutter }}>
      {items.map((item) => {
        const ink = item.low ? colors.onAccent : colors.accentText;
        const Icon = item.low ? Check : Plus;
        return (
          <Tap
            key={item.id}
            accessibilityRole="checkbox"
            accessibilityLabel={item.name}
            accessibilityHint={item.low ? words.flat.low.hintLow : words.flat.low.hint}
            accessibilityState={{ checked: item.low, disabled: !onToggle }}
            // Said this way, a browser hears whether it is ticked as well: the web takes no `accessibilityState`.
            aria-checked={item.low}
            disabled={!onToggle}
            hitSlop={{ top: 5, bottom: 5 }}
            scaleTo={0.94}
            onPress={() => onToggle?.(item)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 34, paddingVertical: 8, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: item.low ? colors.accent : colors.accentSoft }}>
            <Icon size={13} color={ink} strokeWidth={2.8} />
            <Txt variant="caption" weight={700} style={{ color: ink }}>
              {item.name}
            </Txt>
          </Tap>
        );
      })}
    </View>
  );
}

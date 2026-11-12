import { Sparkles } from 'lucide-react-native';

import { layout, radius, useTheme } from '@/theme';
import { Tap } from '@/ui/Motion';
import { Txt } from '@/ui/Txt';

/**
 * The line that leads to "Type it" from a form: the same soft pill with a sparkle as on the + sheet. A form
 * is the long way round; writing it the way you'd say it is the short one.
 */
export function TypeItLine({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Tap accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, marginHorizontal: layout.barGutter, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: colors.fill }}>
      <Sparkles size={19} color={colors.accentText} />
      <Txt variant="control" weight={500} color="muted" numberOfLines={1} style={{ flex: 1 }}>
        {label}
      </Txt>
    </Tap>
  );
}

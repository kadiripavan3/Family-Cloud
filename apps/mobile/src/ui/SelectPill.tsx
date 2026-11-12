import { ChevronDown } from 'lucide-react-native';

import { radius, useTheme } from '@/theme';

import { Tap } from './Motion';
import { Txt } from './Txt';

type Props = {
  /** The current choice. */
  label: string;
  /** What a screen reader says: whose choice it is, and that pressing changes it. */
  spoken: string;
  onPress?: () => void;
  /** Quieter, for a choice that means "none". */
  muted?: boolean;
};

/** A small pill that holds the current choice and opens the others: a person's role. */
export function SelectPill({ label, spoken, onPress, muted }: Props) {
  const { colors } = useTheme();
  const color = muted ? colors.muted : colors.text;
  return (
    <Tap accessibilityRole="button" accessibilityLabel={spoken} hitSlop={8} onPress={onPress} scaleTo={0.94} style={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingVertical: 7, paddingLeft: 12, paddingRight: 8, borderRadius: radius.pill, backgroundColor: colors.fill }}>
      <Txt variant="footnote" weight={700} style={{ color }}>
        {label}
      </Txt>
      <ChevronDown size={14} color={color} />
    </Tap>
  );
}

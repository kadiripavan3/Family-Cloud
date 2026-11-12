import { Check } from 'lucide-react-native';
import { Pressable } from 'react-native';

import { radius, useTheme } from '@/theme';

type Props = {
  /** What is ticked, for a screen reader: "Take the bins out, Thu 12 Nov". */
  label: string;
  done: boolean;
  /** Left out for a tick that only shows: someone else's job, or a day that hasn't come round yet. */
  onChange?: (next: boolean) => void;
};

/** The round tick of a job: empty until it is done. Pressing it ticks it, pressing again takes the tick away. */
export function Tick({ label, done, onChange }: Props) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked: done, disabled: !onChange }}
      // Said this way, a browser hears whether it is ticked as well: the web takes no `accessibilityState`.
      aria-checked={done}
      aria-disabled={!onChange}
      disabled={!onChange}
      // Drawn 24 pt wide; the finger still gets 44.
      hitSlop={10}
      onPress={() => onChange?.(!done)}
      style={{
        width: 24,
        height: 24,
        borderRadius: radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: done ? 0 : 2,
        borderColor: colors.lineStrong,
        backgroundColor: done ? colors.accent : 'transparent',
        opacity: onChange || done ? 1 : 0.5,
      }}>
      {done ? <Check size={14} color={colors.onAccent} strokeWidth={3} /> : null}
    </Pressable>
  );
}

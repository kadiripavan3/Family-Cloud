import { Repeat } from 'lucide-react-native';

import type { TodayItem } from '@/api/generated/homeport';
import { useTheme } from '@/theme';

/**
 * The small mark at the end of one of Today's lines for something that comes round again (the bins, every
 * Thursday's swimming): the API says so with `repeats`. It draws nothing for a line that doesn't repeat, so
 * a line can simply end in it where it has nothing else to end in (no button, nobody's face).
 */
export function RepeatMark({ item }: { item: TodayItem }) {
  const { colors } = useTheme();
  return item.repeats ? <Repeat size={18} color={colors.muted} /> : null;
}

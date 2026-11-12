import { Clock } from 'lucide-react-native';
import { View } from 'react-native';

import { radius, useTheme } from '@/theme';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

/**
 * The small "waiting" mark after a line or a block that has a change on the phone which hasn't reached the
 * API yet (13.2 Offline). It goes by itself when the change has arrived.
 */
export function WaitingMark() {
  const { colors } = useTheme();
  return (
    <View accessible accessibilityLabel={words.notes.list.waitingSpoken} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 2, paddingHorizontal: 8, borderRadius: radius.chip, backgroundColor: colors.fill }}>
      <Clock size={12} color={colors.muted} />
      <Txt variant="tiny" weight={800} color="muted">
        {words.notes.list.waiting}
      </Txt>
    </View>
  );
}

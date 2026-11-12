import { ChevronRight } from 'lucide-react-native';

import { layout, useTheme } from '@/theme';
import { words } from '@/words';

import { Txt } from './Txt';
import { Tap } from './Motion';

/** A section's heading with an optional way to see everything in it. */
export function SectionHeader({ title, onPress }: { title: string; onPress?: () => void }) {
  const { colors } = useTheme();
  return (
    <Tap
      accessibilityRole={onPress ? 'button' : 'header'}
      accessibilityLabel={onPress ? words.common.seeAll(title) : title}
      disabled={!onPress}
      onPress={onPress}
      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: layout.section, marginBottom: 12, paddingHorizontal: layout.rowGutter }}>
      <Txt variant="titleSmall">
        {title}
      </Txt>
      {onPress ? <ChevronRight size={20} color={colors.text} /> : null}
    </Tap>
  );
}

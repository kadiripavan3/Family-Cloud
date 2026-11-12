import type { ReactNode } from 'react';
import { ScrollView } from 'react-native';

import { layout } from '@/theme';

/** A row of cards that scrolls sideways. */
export function Rail({ children }: { children: ReactNode }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: layout.barGutter, gap: 14 }}>
      {children}
    </ScrollView>
  );
}

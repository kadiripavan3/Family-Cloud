import type { ReactNode } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '@/theme';
import { EmptyState } from '@/ui/EmptyState';
import { words } from '@/words';

type Props = {
  /** What the screen will be: "Home", "Set up a circle". */
  title: string;
  /** Shown above, such as a bar with Close, for a screen that opens on top of another. */
  header?: ReactNode;
  /** The one way on from here, if the screen has one. */
  action?: ReactNode;
};

/**
 * Stands in for a whole screen that is still to be built from its design: it says which screen this is and
 * that it is on its way. Each use goes when its screen arrives; when none is left, so does this file.
 */
export function NotBuiltYet({ title, header, action }: Props) {
  const { colors } = useTheme();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      {header}
      <View style={{ flex: 1, justifyContent: 'center', paddingVertical: 48 }}>
        <EmptyState emoji="🛠️" title={title} body={words.states.notBuilt} action={action} />
      </View>
    </SafeAreaView>
  );
}

import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { layout, useTheme } from '@/theme';

import { AvoidKeyboard } from './AvoidKeyboard';

type Props = {
  children: ReactNode;
  /** Pinned to the bottom, above the keyboard: the screen's one main action. */
  footer?: ReactNode;
  /** Shown above the scrolling content, such as a back button. */
  header?: ReactNode;
};

/** The frame of an ordinary screen: safe areas, the page colour, scrolling, and a footer that rides above the keyboard. */
export function Screen({ children, footer, header }: Props) {
  const { colors } = useTheme();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <AvoidKeyboard style={{ flex: 1 }}>
        {header}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: layout.rowGutter, paddingBottom: 24 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          {children}
        </ScrollView>
        {footer ? <View style={{ paddingHorizontal: layout.rowGutter, paddingTop: 12, paddingBottom: 12, gap: 10 }}>{footer}</View> : null}
      </AvoidKeyboard>
    </SafeAreaView>
  );
}

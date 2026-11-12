import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { layout, useTheme } from '@/theme';
import { AppBar, StepProgress } from '@/ui/AppBar';
import { AvoidKeyboard } from '@/ui/AvoidKeyboard';

type Props = {
  /** How far through the three steps this screen is. Left out, the bar shows no steps. */
  step?: number;
  /** A title in the bar, for a screen that isn't one of the steps. */
  title?: string;
  /** Shown at the right of the bar, such as "Not now". */
  trailing?: ReactNode;
  /** False for a screen with nowhere to go back to by design (the last one). */
  back?: boolean;
  children: ReactNode;
  /** Pinned to the bottom: the way on. */
  footer?: ReactNode;
};

/** The frame of a step of setting up a circle: the bar with its three steps, the scrolling content edge to edge, and the button at the bottom. */
export function SetupFrame({ step, title, trailing, back = true, children, footer }: Props) {
  const { colors } = useTheme();
  const router = useRouter();
  // Someone sent here because they are in no circle has nothing behind this screen: no arrow that leads nowhere.
  const leading = back && router.canGoBack() ? 'back' : 'none';
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <AvoidKeyboard style={{ flex: 1 }}>
        <AppBar leading={leading} title={title} center={step ? <StepProgress step={step} /> : undefined} trailing={trailing} />
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {children}
        </ScrollView>
        {footer ? <View style={{ gap: 10, paddingTop: 12, paddingBottom: 12, paddingHorizontal: layout.rowGutter }}>{footer}</View> : null}
      </AvoidKeyboard>
    </SafeAreaView>
  );
}

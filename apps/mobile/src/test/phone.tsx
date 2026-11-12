import type { ReactElement, ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

/** For tests: what a component sees around it on a phone with a notch. */
export function Phone({ children }: { children: ReactNode }) {
  return (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
      {children}
    </SafeAreaProvider>
  );
}

export const onPhone = (ui: ReactElement) => <Phone>{ui}</Phone>;

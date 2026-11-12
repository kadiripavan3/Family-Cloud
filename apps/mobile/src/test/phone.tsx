import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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

/** A data layer for a test: it keeps what it is given, tries nothing twice and sets no timers, so the test run can end. */
export const newClient = () => new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retry: false }, mutations: { gcTime: Infinity, retry: false } } });

/** On a phone, with the app's data layer around it: for a screen that changes something itself (`useMutation`). */
export const inApp = (ui: ReactElement, client: QueryClient = newClient()) => (
  <QueryClientProvider client={client}>
    <Phone>{ui}</Phone>
  </QueryClientProvider>
);

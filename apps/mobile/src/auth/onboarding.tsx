import { createContext, type ReactNode, use, useMemo, useState } from 'react';

type Onboarding = {
  /** True from creating a profile until the last sign-up step is done. */
  active: boolean;
  begin: () => void;
  /** Ends sign-up and opens the app. */
  finish: () => void;
};

const OnboardingContext = createContext<Onboarding | null>(null);

/**
 * Remembers that a new person is still in the sign-up steps (their profile, then setting up a circle), so the
 * app doesn't open Home half way through: the profile exists after the first step already.
 */
export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(false);
  const value = useMemo<Onboarding>(() => ({ active, begin: () => setActive(true), finish: () => setActive(false) }), [active]);
  return <OnboardingContext value={value}>{children}</OnboardingContext>;
}

export function useOnboarding(): Onboarding {
  const value = use(OnboardingContext);
  if (!value) throw new Error('useOnboarding must be used inside OnboardingProvider');
  return value;
}

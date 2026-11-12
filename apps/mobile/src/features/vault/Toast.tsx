import { Clock } from 'lucide-react-native';
import { type ReactNode, useCallback, useSyncExternalStore } from 'react';
import { View } from 'react-native';

import { radius, useTheme } from '@/theme';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

import { useVaultLocksAt } from './session';

/** A dark pill floating above the bottom of the screen: one line that says what just happened, or what is about to. */
export function Toast({ icon, text, bottom = 108 }: { icon?: (color: string) => ReactNode; text: string; bottom?: number }) {
  const { colors, shadow } = useTheme();
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 16, right: 16, bottom, alignItems: 'center' }}>
      <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, maxWidth: '100%', paddingVertical: 11, paddingHorizontal: 16, borderRadius: radius.cardLarge, backgroundColor: colors.text, boxShadow: shadow.md }}>
        {icon?.(colors.bg)}
        <Txt variant="note" weight={700} style={{ flexShrink: 1, color: colors.bg }}>
          {text}
        </Txt>
      </View>
    </View>
  );
}

/** The clock is looked at four times a second, so no second is shown late. */
const watchClock = (heard: () => void) => {
  const timer = setInterval(heard, 250);
  return () => clearInterval(timer);
};

/** How many whole seconds are left until a moment, counted down as they pass. */
export function useSecondsUntil(at: number | null): number {
  const left = useCallback(() => (at === null ? 0 : Math.max(0, Math.ceil((at - Date.now()) / 1000))), [at]);
  return useSyncExternalStore(watchClock, left, left);
}

/** "Locks itself in 1:48": the Vault says when it will lock, and counts down. */
export function LockToast({ bottom }: { bottom?: number }) {
  const locksAt = useVaultLocksAt();
  const seconds = useSecondsUntil(locksAt);
  if (locksAt === null) return null;
  return <Toast bottom={bottom} icon={(c) => <Clock size={18} color={c} />} text={words.vault.home.locksIn(seconds)} />;
}

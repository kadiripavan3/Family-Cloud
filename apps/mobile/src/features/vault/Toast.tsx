import { Clock } from 'lucide-react-native';
import { type ReactNode, useSyncExternalStore } from 'react';
import { View } from 'react-native';

import { radius, useTheme } from '@/theme';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

import { useVaultLock } from './session';

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

/** The clock, in whole seconds, for whoever is counting down. It is looked at four times a second, so no second is shown late. */
const watchClock = (heard: () => void) => {
  const timer = setInterval(heard, 250);
  return () => clearInterval(timer);
};
const clockSeconds = () => Math.floor(Date.now() / 1000);

/** How many whole seconds are left until a moment, counted down as they pass. */
export function useSecondsUntil(at: number | null): number {
  const now = useSyncExternalStore(watchClock, clockSeconds, clockSeconds);
  return at === null ? 0 : Math.max(0, Math.ceil(at / 1000) - now);
}

/** "Locks itself in 1:48": the Vault says when it will lock, and counts down. */
export function LockToast({ bottom }: { bottom?: number }) {
  const lock = useVaultLock();
  const seconds = useSecondsUntil(lock.locksAt);
  if (!lock.unlocked) return null;
  return <Toast bottom={bottom} icon={(c) => <Clock size={18} color={c} />} text={words.vault.home.locksIn(seconds)} />;
}

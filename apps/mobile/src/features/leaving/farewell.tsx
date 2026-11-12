import { X } from 'lucide-react-native';
import { useSyncExternalStore } from 'react';
import { View } from 'react-native';

import { darkTheme, radius } from '@/theme';
import { Frost } from '@/ui/Frost';
import { Tap } from '@/ui/Motion';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

/** How long the sentence is worth showing: it is about what has just happened. */
const STAYS_MS = 10 * 60 * 1000;

let last: { text: string; at: number } | null = null;
const listeners = new Set<() => void>();
const subscribe = (heard: () => void) => {
  listeners.add(heard);
  return () => {
    listeners.delete(heard);
  };
};
const read = () => (last && Date.now() - last.at < STAYS_MS ? last.text : null);

/**
 * What the API said happened when an account was deleted, kept for the welcome screen: deleting signs the
 * person out, so the page that asked is gone by the time there is an answer, and the answer matters (the
 * sign-in may still be there, for Journey). Null takes it away.
 */
export function sayFarewell(text: string | null): void {
  last = text ? { text, at: Date.now() } : null;
  for (const heard of listeners) heard();
}

/** The sentence, on the welcome screen's photo, with a way to put it away. Nothing when nobody has just deleted an account. */
export function Farewell() {
  const text = useSyncExternalStore(subscribe, read, () => null);
  const { colors } = darkTheme;
  if (!text) return null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 16, paddingVertical: 12, paddingLeft: 14, paddingRight: 10, borderRadius: radius.photo, borderWidth: 1, borderColor: colors.photoGlassLine, backgroundColor: colors.photoGlass, overflow: 'hidden' }}>
      <Frost tone="dark" />
      <Txt variant="note" color="onPhoto" accessibilityLiveRegion="polite" style={{ flex: 1 }}>
        {text}
      </Txt>
      <Tap accessibilityRole="button" accessibilityLabel={words.settings.deleteAccount.farewell} hitSlop={12} onPress={() => sayFarewell(null)}>
        <X size={18} color={colors.onPhoto} />
      </Tap>
    </View>
  );
}

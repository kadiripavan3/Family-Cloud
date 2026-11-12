import { useIsFocused } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

/**
 * White clock and battery, for a screen whose top is a photo or the dark stage. It asks for them only while
 * its screen is in front: a screen stays mounted underneath the ones pushed on top of it, and a plain
 * `<StatusBar style="light" />` there would leave white icons on the light page above.
 */
export function LightStatusBar() {
  return useIsFocused() ? <StatusBar style="light" /> : null;
}

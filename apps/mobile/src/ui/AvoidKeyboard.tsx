import type { ReactNode } from 'react';
import { KeyboardAvoidingView, type StyleProp, type ViewStyle } from 'react-native';

/**
 * Keeps what is being typed in above the keyboard, on iPhone and on Android alike.
 *
 * Android draws the app edge to edge, so the window is no longer made smaller for the keyboard: without
 * this, the keyboard covers the bottom of the screen. "padding" adds exactly the part the keyboard covers
 * (it measures the overlap), so where a window still resizes by itself nothing is added twice.
 */
export function AvoidKeyboard({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <KeyboardAvoidingView style={style} behavior="padding">
      {children}
    </KeyboardAvoidingView>
  );
}

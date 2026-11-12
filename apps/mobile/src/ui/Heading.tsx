import type { ReactNode } from 'react';
import type { StyleProp, TextStyle } from 'react-native';

import { Txt } from './Txt';

/** The big title at the top of a screen. */
export function Heading({ children, center, style }: { children: ReactNode; center?: boolean; style?: StyleProp<TextStyle> }) {
  return (
    <Txt variant="heading" accessibilityRole="header" center={center} style={style}>
      {children}
    </Txt>
  );
}

/** The sentence under a screen's title. */
export function Lead({ children, center, style }: { children: ReactNode; center?: boolean; style?: StyleProp<TextStyle> }) {
  return (
    <Txt variant="lead" color="muted" center={center} style={[{ marginTop: 10 }, style]}>
      {children}
    </Txt>
  );
}

/** A small capital label above a group, such as "RECENT". */
export function GroupLabel({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return (
    <Txt variant="label" color="muted" style={[{ marginTop: 22, marginBottom: 8, marginHorizontal: 4 }, style]}>
      {children}
    </Txt>
  );
}

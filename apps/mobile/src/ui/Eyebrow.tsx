import type { ReactNode } from 'react';

import { Txt } from './Txt';

/** The small capital line above a title: "DUE TOMORROW". */
export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <Txt variant="label" color="accentText" numberOfLines={1}>
      {children}
    </Txt>
  );
}

import { Image } from 'expo-image';

import { icons3d } from './icons3d';
import { Txt } from './Txt';

/** The same emoji whether or not the text carries a "show as picture" mark. */
const plain = (emoji: string) => emoji.replace(/️/g, '');
const byPlain = Object.fromEntries(Object.entries(icons3d).map(([emoji, source]) => [plain(emoji), source]));

type Props = {
  /** The emoji, as text: "✈️". */
  char: string;
  /** The height of the picture, in points. */
  size: number;
};

/** An emoji drawn as its 3D icon where the app has one, and as plain text otherwise. Decorative: screen readers skip it. */
export function Emoji({ char, size }: Props) {
  const source = byPlain[plain(char)];
  if (source) {
    return <Image source={source} style={{ width: size, height: size }} contentFit="contain" accessible={false} />;
  }
  return (
    <Txt accessible={false} style={{ fontSize: size * 0.86, lineHeight: size * 1.08 }}>
      {char}
    </Txt>
  );
}

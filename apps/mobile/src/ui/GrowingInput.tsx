import { useState } from 'react';
import { type StyleProp, TextInput, type TextInputProps, type TextStyle } from 'react-native';

import { type FontWeight, textStyle, type TypeVariant, useTheme } from '@/theme';

import { MAX_TEXT_SCALE } from './Txt';
import { webNoOutline } from './web';

type Props = Omit<TextInputProps, 'style' | 'multiline'> & {
  /** What the box is for, for screen readers: it has no label of its own on screen. */
  label: string;
  /** The text style it is typed in: "heading" for a page's title, "body" for its words. */
  variant: TypeVariant;
  weight?: FontWeight;
  /** How tall it is while there is little in it. */
  minHeight?: number;
  style?: StyleProp<TextStyle>;
};

/**
 * A box to type straight into the page, with no frame: a title, a page's words. It is as tall as what is in
 * it and grows as more is typed, so the page scrolls and the box never does.
 */
export function GrowingInput({ label, variant, weight, minHeight = 0, style, ...input }: Props) {
  const { colors } = useTheme();
  const [height, setHeight] = useState(0);
  return (
    <TextInput
      maxFontSizeMultiplier={MAX_TEXT_SCALE}
      placeholderTextColor={colors.muted}
      selectionColor={colors.accent}
      {...input}
      accessibilityLabel={label}
      multiline
      // One row to begin with: a browser would otherwise start every such box two rows tall.
      rows={1}
      scrollEnabled={false}
      textAlignVertical="top"
      onContentSizeChange={(event) => setHeight(Math.ceil(event.nativeEvent.contentSize.height))}
      style={[webNoOutline, textStyle(variant, weight), { padding: 0, color: colors.text, minHeight, height: height > minHeight ? height : undefined }, style]}
    />
  );
}

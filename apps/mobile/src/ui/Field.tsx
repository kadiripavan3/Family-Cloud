import { type ReactNode, useState } from 'react';
import { Pressable, TextInput, type TextInputProps, View } from 'react-native';

import { radius, textStyle, useTheme } from '@/theme';
import { words } from '@/words';

import { MAX_TEXT_SCALE, Txt } from './Txt';
import { webNoOutline } from './web';

type Props = Omit<TextInputProps, 'style'> & {
  label: string;
  /** Shown under the field in the danger colour. */
  error?: string | null;
  /** Shown under the field when there is no error. */
  note?: string | null;
  noteTone?: 'muted' | 'ok';
  /** Text shown before what the person types, such as "@". */
  prefix?: string;
  /** Shown at the right edge, such as a tick. */
  accessory?: ReactNode;
};

/** A text field with its label inside the box, as in the designs. */
export function Field({ label, error, note, noteTone = 'muted', prefix, accessory, multiline, onFocus, onBlur, ...input }: Props) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  const borderColor = error ? colors.danger : focused ? colors.text : colors.lineStrong;

  return (
    <View style={{ gap: 6 }}>
      <View
        style={{
          borderRadius: radius.field,
          borderWidth: focused || error ? 2 : 1.5,
          borderColor,
          backgroundColor: colors.bg,
          paddingHorizontal: focused || error ? 15.5 : 16,
          paddingTop: focused || error ? 8.5 : 9,
          paddingBottom: focused || error ? 9.5 : 10,
        }}>
        <Txt variant="small" color="muted">
          {label}
        </Txt>
        <View style={{ flexDirection: 'row', alignItems: multiline ? 'flex-start' : 'center', gap: 2 }}>
          {prefix ? (
            <Txt variant="bodyLarge" weight={600}>
              {prefix}
            </Txt>
          ) : null}
          <TextInput
            maxFontSizeMultiplier={MAX_TEXT_SCALE}
            {...input}
            accessibilityLabel={label}
            multiline={multiline}
            placeholderTextColor={colors.muted}
            selectionColor={colors.accent}
            onFocus={(e) => {
              setFocused(true);
              onFocus?.(e);
            }}
            onBlur={(e) => {
              setFocused(false);
              onBlur?.(e);
            }}
            style={[
              webNoOutline,
              textStyle('bodyLarge', multiline ? 500 : 600, { oneLine: !multiline }),
              {
                flex: 1,
                minHeight: multiline ? 66 : 24,
                padding: 0,
                color: colors.text,
                textAlignVertical: multiline ? 'top' : 'center',
              },
            ]}
          />
          {accessory}
        </View>
      </View>
      {error ? (
        <Txt variant="caption" color="danger" accessibilityLiveRegion="polite" style={{ marginHorizontal: 4 }}>
          {error}
        </Txt>
      ) : note ? (
        <Txt variant="caption" color={noteTone} style={{ marginHorizontal: 4 }}>
          {note}
        </Txt>
      ) : null}
    </View>
  );
}

/** Looks like a field, but opens a picker when pressed: a date, a category. */
export function FieldButton({ label, value, icon, onPress }: { label: string; value: string; icon?: ReactNode; onPress?: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={words.common.fieldChange(label, value)}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        borderRadius: radius.field,
        borderWidth: 1.5,
        borderColor: colors.lineStrong,
        backgroundColor: colors.bg,
        paddingHorizontal: 16,
        paddingTop: 9,
        paddingBottom: 10,
        opacity: pressed ? 0.8 : 1,
      })}>
      <Txt variant="small" color="muted">
        {label}
      </Txt>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 24 }}>
        {icon}
        <Txt variant="headline" numberOfLines={1} weight={600} style={{ flex: 1 }}>
          {value}
        </Txt>
      </View>
    </Pressable>
  );
}

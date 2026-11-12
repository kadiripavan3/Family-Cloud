import { type ComponentRef, useRef } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { radius, useTheme } from '@/theme';
import { words } from '@/words';

import { Txt } from './Txt';
import { webNoOutline } from './web';

type Props = {
  value: string;
  onChange: (code: string) => void;
  /** Called once when the last digit is typed. */
  onComplete?: (code: string) => void;
  length?: number;
  disabled?: boolean;
};

/** Six boxes for a one-time code. One hidden text field takes the typing, so paste and autofill from the email work. */
export function OtpInput({ value, onChange, onComplete, length = 6, disabled }: Props) {
  const { colors } = useTheme();
  const input = useRef<ComponentRef<typeof TextInput>>(null);

  const change = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, length);
    onChange(digits);
    if (digits.length === length && digits !== value) onComplete?.(digits);
  };

  return (
    <Pressable onPress={() => input.current?.focus()} accessible={false}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {Array.from({ length }, (_, i) => {
          const active = i === Math.min(value.length, length - 1) && !disabled;
          return (
            <View
              key={i}
              style={{
                flex: 1,
                height: 60,
                borderRadius: radius.thumb,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: active ? colors.bg : colors.fill,
                borderWidth: active ? 2 : 0,
                borderColor: colors.text,
              }}>
              <Txt variant="titleLarge">
                {value[i] ?? ''}
              </Txt>
            </View>
          );
        })}
      </View>
      <TextInput
        ref={input}
        value={value}
        onChangeText={change}
        editable={!disabled}
        autoFocus
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        maxLength={length}
        caretHidden
        accessibilityLabel={words.common.digitCode(length)}
        style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.01, color: 'transparent' }, webNoOutline]}
      />
    </Pressable>
  );
}

import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';

import { messageFor } from '@/api/fetcher';
import { layout, radius, useTheme } from '@/theme';
import { Button } from '@/ui/Button';
import { Emoji } from '@/ui/Emoji';
import { Field } from '@/ui/Field';
import { Tap } from '@/ui/Motion';
import { Sheet } from '@/ui/Sheet';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

/** The emoji a space, a folder or a page can carry: the ones the app draws as 3D icons that suit a shelf of notes. */
export const NOTE_EMOJI = ['🏠', '🧒', '✈️', '💼', '📓', '🛒', '🍽️', '🍳', '📶', '🎂', '🎄', '🎉', '🎁', '🎒', '🏊', '🧳', '🐶', '👶', '💡', '🔑', '💰', '📷', '📚', '🧹', '🛠️', '🚗', '⛺', '🌍', '❤️', '⭐'];

type Props = {
  visible: boolean;
  onClose: () => void;
  /** What the sheet is for: "New space", "Rename". */
  title: string;
  label?: string;
  placeholder?: string;
  /** What it is called now, and its emoji, when something is renamed. */
  name?: string;
  emoji?: string;
  /** True to offer an emoji as well: a space, a folder, a page. */
  withEmoji?: boolean;
  /** The button that does it: "Create", "Save". */
  confirm: string;
  /** Does it. The sheet closes when this is through, and says what the API said when it isn't. */
  onSubmit: (name: string, emoji: string) => Promise<unknown>;
};

/** A name, and an emoji if wanted: for a new space or folder, and for renaming anything in Notes. */
export function NameSheet({ visible, ...rest }: Props) {
  return (
    <Sheet visible={visible} onClose={rest.onClose} title={rest.title}>
      {/* What was typed last time is gone when the sheet opens again. */}
      {visible ? <Form {...rest} /> : null}
    </Sheet>
  );
}

function Form({ onClose, label = words.notes.name.label, placeholder, name = '', emoji = '', withEmoji, confirm, onSubmit }: Omit<Props, 'visible' | 'title'>) {
  const [typed, setTyped] = useState(name);
  const [chosen, setChosen] = useState(emoji);
  const save = useMutation({ mutationFn: () => onSubmit(typed.trim(), chosen), onSuccess: onClose });
  const ready = typed.trim().length > 0 && (typed.trim() !== name.trim() || chosen !== emoji);
  return (
    <View style={{ gap: 14, paddingTop: 6, paddingHorizontal: layout.rowGutter }}>
      <Field label={label} value={typed} onChangeText={setTyped} maxLength={200} autoFocus placeholder={placeholder} returnKeyType="done" onSubmitEditing={() => (ready && !save.isPending ? save.mutate() : undefined)} error={save.isError ? messageFor(save.error) : null} />
      {withEmoji ? <EmojiGrid value={chosen} onChange={setChosen} /> : null}
      <Button label={confirm} size="lg" block disabled={!ready} loading={save.isPending} onPress={() => save.mutate()} />
    </View>
  );
}

/** The emoji to choose from, as a grid. Pressing the chosen one again takes it away. */
export function EmojiGrid({ value, onChange }: { value: string; onChange: (emoji: string) => void }) {
  const { colors } = useTheme();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={words.notes.name.emoji} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      {NOTE_EMOJI.map((emoji) => {
        const on = emoji === value;
        return (
          <Tap
            key={emoji}
            accessibilityRole="radio"
            accessibilityLabel={emoji}
            accessibilityState={{ checked: on }}
            aria-checked={on}
            onPress={() => onChange(on ? '' : emoji)}
            scaleTo={0.9}
            style={{ width: 44, height: 44, borderRadius: radius.thumb, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? colors.accentSoft : colors.fill, borderWidth: on ? 2 : 0, borderColor: colors.accent }}>
            <Emoji char={emoji} size={26} />
          </Tap>
        );
      })}
      {value ? (
        <Tap accessibilityRole="button" accessibilityLabel={words.notes.name.noEmoji} onPress={() => onChange('')} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 10 }}>
          <Txt variant="footnote" weight={700} color="muted">
            {words.notes.name.noEmoji}
          </Txt>
        </Tap>
      ) : null}
    </View>
  );
}

import { ArrowUp, Mic, Plus } from 'lucide-react-native';
import { type ReactNode, useState } from 'react';
import { ActivityIndicator, TextInput, View } from 'react-native';

import { layout, radius, textStyle, useTheme } from '@/theme';
import { GlassBar } from '@/ui/GlassBar';
import { Tap } from '@/ui/Motion';
import { MAX_TEXT_SCALE, Txt } from '@/ui/Txt';
import { webNoOutline } from '@/ui/web';
import { words } from '@/words';

/** The end of a page with one big button: the button, and a line of small print under it. */
export function Foot({ children, fine }: { children?: ReactNode; fine?: string }) {
  return (
    <View style={{ paddingTop: 12, paddingHorizontal: layout.rowGutter, paddingBottom: 12, gap: 10 }}>
      {children}
      {fine ? (
        <Txt variant="small" weight={500} color="muted" center>
          {fine}
        </Txt>
      ) : null}
    </View>
  );
}

/** The glass bar that floats over the end of a page: two lines of words and one or two small buttons. */
export function CtaBar({ title, line, children }: { title: string; line?: string | null; children?: ReactNode }) {
  return (
    <GlassBar radius="sheet" contentStyle={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingLeft: 20, paddingRight: 10, minHeight: 56 }}>
      <View style={{ flex: 1 }}>
        <Txt variant="item" weight={800} numberOfLines={1}>
          {title}
        </Txt>
        {line ? (
          <Txt variant="footnote" color="muted" numberOfLines={1}>
            {line}
          </Txt>
        ) : null}
      </View>
      {children}
    </GlassBar>
  );
}

type AddProps = {
  /** What the empty box says: "What did they just say?" */
  placeholder: string;
  /** The words were sent (the return key, or the arrow that appears once something is typed). True clears the box. */
  onSubmit: (text: string) => Promise<boolean> | boolean;
  busy?: boolean;
  /** What the microphone does. Left out, there is none. */
  onMic?: () => void;
  micLabel?: string;
  /** True while a recording is attached to what is being typed: the microphone is drawn in the accent colour. */
  micOn?: boolean;
  /** Shown above the box: chips to tap instead of typing, who it is about. */
  above?: ReactNode;
  /** Why it didn't work, in a sentence. */
  problem?: string | null;
  maxLength?: number;
};

/**
 * The box to type in that is pinned to the end of a page: a plus, the words, a microphone. What is typed
 * is sent with the return key or the arrow.
 */
export function AddBar({ placeholder, onSubmit, busy, onMic, micLabel, micOn, above, problem, maxLength = 500 }: AddProps) {
  const { colors } = useTheme();
  const [text, setText] = useState('');
  const send = async () => {
    const typed = text.trim();
    if (!typed || busy) return;
    if (await onSubmit(typed)) setText('');
  };
  return (
    <View style={{ paddingTop: 10, paddingBottom: 12, gap: 10, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.surface }}>
      {above}
      {problem ? (
        <Txt variant="caption" color="danger" accessibilityLiveRegion="polite" style={{ paddingHorizontal: layout.gutter }}>
          {problem}
        </Txt>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 46, marginHorizontal: layout.barGutter, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: colors.fill }}>
        <Plus size={19} color={colors.accentText} />
        <TextInput
          accessibilityLabel={placeholder}
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          selectionColor={colors.accent}
          maxFontSizeMultiplier={MAX_TEXT_SCALE}
          value={text}
          onChangeText={setText}
          maxLength={maxLength}
          returnKeyType="send"
          submitBehavior="submit"
          onSubmitEditing={() => void send()}
          style={[webNoOutline, textStyle('bodySmall', 500, { oneLine: true }), { flex: 1, minHeight: 46, padding: 0, color: colors.text }]}
        />
        {onMic ? (
          <Tap accessibilityRole="button" accessibilityLabel={micLabel ?? words.templates.sound.add} hitSlop={12} onPress={onMic}>
            <Mic size={19} color={micOn ? colors.accentText : colors.text} />
          </Tap>
        ) : null}
        {busy ? (
          <ActivityIndicator color={colors.muted} />
        ) : text.trim() ? (
          <Tap accessibilityRole="button" accessibilityLabel={words.templates.board.send} hitSlop={10} onPress={() => void send()} style={{ width: 30, height: 30, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent }}>
            <ArrowUp size={17} color={colors.onAccent} strokeWidth={2.6} />
          </Tap>
        ) : null}
      </View>
    </View>
  );
}

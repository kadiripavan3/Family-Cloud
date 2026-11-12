import { useRouter } from 'expo-router';
import { Check, Mic } from 'lucide-react-native';
import { type ComponentRef, useRef, useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { messageFor } from '@/api/fetcher';
import type { ReadItemResponse } from '@/api/generated/homeport';
import { useCircle } from '@/features/circles/current';
import { takeHandedIn } from '@/features/jot/handedIn';
import { KIND_ICONS, readingLine } from '@/features/jot/kinds';
import { OnPhoto } from '@/features/jot/OnPhoto';
import { useJotting } from '@/features/jot/useJotting';
import { useReading } from '@/features/jot/useReading';
import { AudienceChip } from '@/features/sharing/AudienceChip';
import { newClientId } from '@/lib/ids';
import { layout, radius, textStyle, useTheme } from '@/theme';
import { AvoidKeyboard } from '@/ui/AvoidKeyboard';
import { Button } from '@/ui/Button';
import { GroupLabel } from '@/ui/Heading';
import { Tap } from '@/ui/Motion';
import { RowGroup } from '@/ui/Rows';
import { MAX_TEXT_SCALE, Txt } from '@/ui/Txt';
import { webNoOutline } from '@/ui/web';
import { words } from '@/words';

/** The bars of the sound picture, as the design draws them: how tall each is, of the tallest. */
const WAVE = [0.2, 0.45, 0.7, 0.4, 0.9, 0.6, 0.3, 0.75, 1, 0.55, 0.35, 0.8, 0.5, 0.25, 0.65, 0.95, 0.45, 0.3, 0.7, 0.4, 0.2];

/**
 * 14.6 Say it all at once: one sentence comes apart into separate things, each shown with how it was read,
 * each one removable before "Add all". A code is noticed and held for the Vault instead of landing in a
 * list.
 *
 * The microphone is the phone's (native/jot/README.md). Here a typed or pasted sentence stands in for what
 * it would hear, and the screen says so; everything after the words is the real thing.
 */
export default function Voice() {
  return (
    <OnPhoto photo="lake">
      <Heard />
    </OnPhoto>
  );
}

function Heard() {
  const { colors, shadow } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const circle = useCircle();
  const { file } = useJotting(circle.id);
  const [text, setText] = useState(() => takeHandedIn('voice')?.text ?? '');
  /** While the sentence is being typed it is a box; after that it stands in quotes, as heard. */
  const [typing, setTyping] = useState(text.trim().length === 0);
  /** The things left out, by their place in the reading. Another sentence starts with nothing left out. */
  const [leftOut, setLeftOut] = useState<{ of: string; places: number[] }>({ of: '', places: [] });
  const [micSaid, setMicSaid] = useState(false);
  const clientId = useRef(newClientId());
  const box = useRef<ComponentRef<typeof TextInput>>(null);
  const { reading } = useReading(circle.id, text);

  const sentence = text.trim();
  const items = sentence ? (reading?.items ?? []) : [];
  const out = leftOut.of === sentence ? leftOut.places : [];
  const kept = items.filter((_, index) => !out.includes(index));
  const toggle = (index: number) => setLeftOut({ of: sentence, places: out.includes(index) ? out.filter((one) => one !== index) : [...out, index] });
  const add = () => {
    if (kept.length === 0) return;
    // Everything kept: the sentence as it was said. Something left out: the words of what stays.
    const said = out.length === 0 ? sentence : kept.map((item) => item.words).join(', ');
    // On to what was filed: back to it when voice was opened from there, otherwise in voice's place.
    file.mutate({ text: said, source: 'voice', clientId: clientId.current }, { onSuccess: () => router.dismissTo('/jot/filed') });
  };
  const edit = () => {
    setTyping(true);
    // The box is drawn on the next pass; then it takes the keyboard.
    setTimeout(() => box.current?.focus(), 0);
  };

  return (
    <AvoidKeyboard style={{ flex: 1, justifyContent: 'flex-end' }}>
      <View style={{ maxHeight: '92%', paddingTop: 10, paddingBottom: Math.max(insets.bottom, 16) + 8, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, backgroundColor: colors.surface, boxShadow: shadow.sheet }}>
        <View style={{ alignSelf: 'center', width: 38, height: 5, borderRadius: radius.pill, marginBottom: 8, backgroundColor: colors.fill2 }} />
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 6 }}>
          <View accessible={false} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, height: 44, marginTop: 6, marginBottom: 2 }}>
            {WAVE.map((tall, index) => (
              <View key={index} style={{ width: 3, height: 44 * tall, borderRadius: radius.pill, backgroundColor: colors.accent }} />
            ))}
          </View>

          {typing || !sentence ? (
            <TextInput
              ref={box}
              accessibilityLabel={words.jot.voice.label}
              placeholder={words.jot.voice.placeholder}
              placeholderTextColor={colors.muted}
              selectionColor={colors.accent}
              maxFontSizeMultiplier={MAX_TEXT_SCALE}
              autoFocus
              multiline
              value={text}
              onChangeText={setText}
              onBlur={() => setTyping(false)}
              maxLength={2000}
              style={[webNoOutline, textStyle('body', 500), { minHeight: 44, marginTop: 6, marginHorizontal: 24, padding: 0, textAlign: 'center', textAlignVertical: 'top', color: colors.text }]}
            />
          ) : (
            <Tap accessibilityRole="button" accessibilityLabel={words.common.spoken([words.jot.voice.heard(sentence), words.jot.voice.edit])} onPress={edit} style={{ marginTop: 6, marginHorizontal: 24 }}>
              <Txt variant="body" color="muted" center>
                {words.jot.voice.heard(sentence)}
              </Txt>
            </Tap>
          )}
          <Txt variant="footnote" color="muted" center style={{ marginTop: 8, marginHorizontal: 24 }}>
            {micSaid ? words.jot.voice.micLater : words.jot.voice.standIn}
          </Txt>

          {sentence ? (
            <>
              <GroupLabel style={{ marginTop: 14, marginHorizontal: layout.gutter }}>{items.length ? words.jot.voice.things(kept.length) : words.jot.voice.nothing}</GroupLabel>
              {items.length ? (
                <RowGroup>
                  {items.map((item, index) => (
                    <Thing key={index} item={item} first={index === 0} on={!out.includes(index)} onPress={() => toggle(index)} circleId={circle.id} />
                  ))}
                </RowGroup>
              ) : null}
            </>
          ) : null}
          {file.isError ? (
            <Txt variant="caption" color="danger" accessibilityLiveRegion="polite" style={{ marginTop: 10, marginHorizontal: layout.gutter }}>
              {messageFor(file.error)}
            </Txt>
          ) : null}
        </ScrollView>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 14, paddingHorizontal: 16 }}>
          <Button size="lg" label={words.jot.voice.add(kept.length, out.length === 0)} disabled={kept.length === 0} loading={file.isPending} onPress={add} style={{ flex: 1 }} />
          {/* On a phone build this listens. Here it says so, and the box above takes the sentence. */}
          <Tap
            accessibilityRole="button"
            accessibilityLabel={words.jot.voice.mic}
            onPress={() => {
              setMicSaid(true);
              edit();
            }}
            scaleTo={0.9}
            style={{ width: 54, height: 54, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent }}>
            <Mic size={22} color={colors.onAccent} />
          </Tap>
        </View>
      </View>
    </AvoidKeyboard>
  );
}

/** One thing the sentence holds: what it is, how it was read, and a tick that takes it out again. */
function Thing({ item, first, on, onPress, circleId }: { item: ReadItemResponse; first: boolean; on: boolean; onPress: () => void; circleId: string }) {
  const { colors } = useTheme();
  const Icon = KIND_ICONS[item.as];
  const line = on ? readingLine(item) : words.jot.voice.leftOut;
  return (
    <Tap
      accessibilityRole="checkbox"
      accessibilityLabel={words.common.spoken([item.title, line])}
      accessibilityState={{ checked: on }}
      // Said this way, a browser hears whether it is ticked as well: the web takes no `accessibilityState`.
      aria-checked={on}
      onPress={onPress}
      scaleTo={0.99}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 54, paddingVertical: 14, paddingHorizontal: 16, borderTopWidth: first ? 0 : 1, borderTopColor: colors.line, opacity: on ? 1 : 0.5 }}>
      <Icon size={22} color={colors.text} />
      <View style={{ flex: 1, gap: 1 }}>
        <Txt variant="item" weight={600} style={{ textDecorationLine: on ? 'none' : 'line-through' }}>
          {item.title}
        </Txt>
        <Txt variant="footnote" color="muted">
          {line}
        </Txt>
      </View>
      {/* A code goes to the Vault, which is the person's alone; everything else gets its tick. */}
      {!on ? null : item.as === 'code' ? <AudienceChip quiet thing={{ circleId, chip: { audience: 'me' } }} /> : <Check size={20} color={colors.ok} strokeWidth={2.6} />}
    </Tap>
  );
}

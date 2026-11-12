import { useRouter } from 'expo-router';
import { Check, ListChecks, Mic, SlidersHorizontal } from 'lucide-react-native';
import { type ComponentRef, useRef, useState } from 'react';
import { TextInput, View } from 'react-native';

import { messageFor } from '@/api/fetcher';
import { type Audience, type JotResponse, useGetJotWays } from '@/api/generated/homeport';
import { useCircle } from '@/features/circles/current';
import { KIND_ICONS, readingChip } from '@/features/jot/kinds';
import { HeldCode, NoteLink } from '@/features/jot/Note';
import { OnPhoto } from '@/features/jot/OnPhoto';
import { useJotting } from '@/features/jot/useJotting';
import { useReading } from '@/features/jot/useReading';
import { StartsAsPill } from '@/features/sharing/StartsAsPill';
import { newClientId } from '@/lib/ids';
import { radius, textStyle, useTheme } from '@/theme';
import { AvoidKeyboard } from '@/ui/AvoidKeyboard';
import { Button } from '@/ui/Button';
import { Frost } from '@/ui/Frost';
import { RoundButton } from '@/ui/RoundButton';
import { MAX_TEXT_SCALE, Txt } from '@/ui/Txt';
import { webNoOutline } from '@/ui/web';
import { words } from '@/words';

/** How many filed lines stay above the bar. The rest are on "What was filed". */
const SHOWN = 4;

/**
 * 14.2 The jot bar: one line, the keyboard, and nothing else of the app. It is what a widget's line, a
 * quick-settings tile and a long press on the icon open (`homeport://jot`). The line is read a short moment
 * after the last key and the reading shows under it; Enter files it and the bar stays for the next one, so
 * ten things are ten lines. Each filed line says where it went and can be undone. Something that looks like
 * a code is held back until the person says where it goes.
 */
export default function JotBar() {
  return (
    <OnPhoto photo="lake" backLabel={words.jot.bar.close} trailing={<Ways />}>
      <Bar />
    </OnPhoto>
  );
}

/** The two ways on from the bar: what was filed today, and the ways in. */
function Ways() {
  const router = useRouter();
  return (
    <>
      <RoundButton tone="photo" label={words.jot.bar.filed} icon={(c) => <ListChecks size={20} color={c} />} onPress={() => router.push('/jot/filed')} />
      <RoundButton tone="photo" label={words.jot.bar.ways} icon={(c) => <SlidersHorizontal size={20} color={c} />} onPress={() => router.push('/jot/ways')} />
    </>
  );
}

function Bar() {
  const { colors, shadow } = useTheme();
  const router = useRouter();
  const circle = useCircle();
  const ways = useGetJotWays(circle.id).data;
  const { file, undo, move, keepInVault } = useJotting(circle.id);
  const [text, setText] = useState('');
  /** Who the next line's things are seen by: the circle's own way until the person changes it here. */
  const [audience, setAudience] = useState<Audience | null>(null);
  /** What was filed since the bar opened, the latest last. */
  const [filed, setFiled] = useState<JotResponse[]>([]);
  const clientId = useRef(newClientId());
  const box = useRef<ComponentRef<typeof TextInput>>(null);
  const { reading } = useReading(circle.id, text);

  const typed = text.trim();
  const add = () => {
    if (!typed || file.isPending) return;
    file.mutate(
      { text: typed, source: 'app', clientId: clientId.current, audience: audience ?? undefined },
      {
        onSuccess: (made) => {
          // The next line is a new one: it gets an id of its own.
          clientId.current = newClientId();
          setText('');
          setFiled((before) => [...before.filter((old) => !made.some((one) => one.id === old.id)), ...made]);
          box.current?.focus();
          // "Straight to the Vault" was chosen on Ways in: a code doesn't wait to be asked about.
          const code = made.find((one) => one.became === 'code');
          if (code && ways?.codes === 'vault') keepInVault(code);
        },
      },
    );
  };
  const takeBack = (jot: JotResponse) => undo.mutate(jot, { onSuccess: () => setFiled((before) => before.filter((one) => one.id !== jot.id)) });
  const justANote = (jot: JotResponse) => move.mutate({ jot, to: 'note' }, { onSuccess: (after) => setFiled((before) => before.map((one) => (one.id === after.id ? after : one))) });

  const held = filed.filter((jot) => jot.became === 'code');
  const lines = filed.filter((jot) => jot.became !== 'code').slice(-SHOWN);
  const problem = [file, undo, move].find((one) => one.isError)?.error;

  return (
    <AvoidKeyboard style={{ flex: 1, justifyContent: 'flex-end', paddingBottom: 10 }}>
      <View accessibilityLiveRegion="polite" style={{ alignItems: 'flex-start', gap: 6, marginHorizontal: 12, marginBottom: 12 }}>
        {lines.map((jot) => (
          <View key={jot.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 36, paddingVertical: 8, paddingLeft: 10, paddingRight: 14, borderRadius: radius.photo, overflow: 'hidden', backgroundColor: colors.photoGlass, borderWidth: 1, borderColor: colors.photoGlassLine }}>
            <Frost tone="dark" intensity={16} />
            <Check size={16} color={colors.accent} strokeWidth={3} />
            <View accessible accessibilityLabel={words.jot.bar.filedLine(jot.title, jot.where)} style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, flexShrink: 1 }}>
              <Txt variant="note" weight={700} color="onPhoto" numberOfLines={1} style={{ flexShrink: 1 }}>
                {jot.title}
              </Txt>
              <Txt variant="footnote" color="onPhoto" numberOfLines={1} style={{ opacity: 0.75, flexShrink: 1 }}>
                {jot.where}
              </Txt>
            </View>
            <NoteLink label={words.jot.bar.undo} spoken={words.jot.bar.undoLine(jot.title)} disabled={undo.isPending} onPress={() => takeBack(jot)} />
          </View>
        ))}
      </View>

      {held.map((jot) => (
        <View key={jot.id} style={{ marginHorizontal: 10, marginBottom: 10, padding: 12, borderRadius: radius.stage, backgroundColor: colors.surface, boxShadow: shadow.md }}>
          <HeldCode jot={jot} busy={move.isPending} onVault={() => keepInVault(jot)} onNote={() => justANote(jot)} />
        </View>
      ))}

      <View style={{ gap: 10, marginHorizontal: 10, paddingTop: 14, paddingBottom: 10, paddingLeft: 16, paddingRight: 12, borderRadius: radius.stage, backgroundColor: colors.surface, boxShadow: shadow.md }}>
        <TextInput
          ref={box}
          accessibilityLabel={words.jot.bar.label}
          placeholder={words.jot.bar.placeholder}
          placeholderTextColor={colors.muted}
          selectionColor={colors.accent}
          maxFontSizeMultiplier={MAX_TEXT_SCALE}
          autoFocus
          value={text}
          onChangeText={setText}
          maxLength={2000}
          returnKeyType="done"
          // Enter adds, and the keyboard stays for the next line.
          submitBehavior="submit"
          onSubmitEditing={add}
          style={[webNoOutline, textStyle('subheading', 500, { oneLine: true }), { minHeight: 26, padding: 0, color: colors.text }]}
        />
        {typed && reading?.items.length ? (
          <View accessibilityLabel={words.jot.bar.reading} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {reading.items.map((item, index) => {
              const Icon = KIND_ICONS[item.as];
              return (
                <View key={index} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '100%', paddingVertical: 6, paddingLeft: 9, paddingRight: 11, borderRadius: radius.photo, backgroundColor: colors.accentSoft }}>
                  <Icon size={14} color={colors.accentText} />
                  <Txt variant="caption" weight={700} color="accentText" numberOfLines={1} style={{ flexShrink: 1 }}>
                    {readingChip(item, circle.myMemberId)}
                  </Txt>
                </View>
              );
            })}
          </View>
        ) : null}
        {problem ? (
          <Txt variant="caption" color="danger" accessibilityLiveRegion="polite">
            {messageFor(problem)}
          </Txt>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <StartsAsPill circle={circle} value={audience ?? circle.startsAs} onChange={setAudience} />
          <View style={{ flex: 1 }} />
          <RoundButton label={words.jot.bar.voice} icon={(c) => <Mic size={20} color={c} />} onPress={() => router.push('/jot/voice')} />
          <Button size="sm" inline label={words.jot.bar.add} disabled={!typed} loading={file.isPending} onPress={add} />
        </View>
      </View>
    </AvoidKeyboard>
  );
}

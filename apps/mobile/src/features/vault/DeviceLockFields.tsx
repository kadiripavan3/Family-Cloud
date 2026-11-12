import { ScanFace, TriangleAlert } from 'lucide-react-native';
import { Platform, View } from 'react-native';

import { Field } from '@/ui/Field';
import { NoteBox } from '@/ui/NoteBox';
import { words } from '@/words';

import type { DeviceLock } from './actions';
import { canAskThePhone } from './keeper';
import { PASSCODE_MIN } from './look';

/** What was typed into the two passcode boxes. Kept by the screen, and cleared when it closes. */
export type TypedLock = { passcode: string; again: string };
export const NOTHING_TYPED: TypedLock = { passcode: '', again: '' };

/**
 * How this phone will keep the key, worked out from what was typed: behind Face ID where the phone has it,
 * otherwise behind the passcode, once it is long enough and typed the same twice. Null until then.
 */
export function lockFrom(typed: TypedLock): DeviceLock | null {
  if (canAskThePhone()) return { how: 'device' };
  return typed.passcode.length >= PASSCODE_MIN && typed.passcode === typed.again ? { how: 'passcode', passcode: typed.passcode } : null;
}

/**
 * How the key is kept on this phone between unlocks: a line that says "behind Face ID" on a phone that has
 * it; otherwise two boxes for a passcode. In a browser it says plainly, right here, that the preview is for
 * trying things out and not for real secrets.
 */
export function DeviceLockFields({ value, onChange, disabled }: { value: TypedLock; onChange: (next: TypedLock) => void; disabled?: boolean }) {
  const says = words.vault.setUp;
  if (canAskThePhone()) {
    return (
      <NoteBox icon={(c) => <ScanFace size={20} color={c} />} title={says.faceId.title}>
        {says.faceId.body}
      </NoteBox>
    );
  }
  const web = Platform.OS === 'web';
  const short = value.passcode.length > 0 && value.passcode.length < PASSCODE_MIN;
  const different = value.again.length > 0 && value.passcode !== value.again;
  return (
    <View style={{ gap: 12 }}>
      {web ? (
        <NoteBox tone="warn" icon={(c) => <TriangleAlert size={20} color={c} />} title={says.browser.title}>
          {says.browser.body}
        </NoteBox>
      ) : null}
      <Field
        label={web ? says.passcode.label : says.passcode.phoneLabel}
        value={value.passcode}
        onChangeText={(passcode) => onChange({ ...value, passcode })}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        editable={!disabled}
        error={short ? says.passcode.short : null}
        note={says.passcode.note}
      />
      <Field
        label={says.passcode.again}
        value={value.again}
        onChangeText={(again) => onChange({ ...value, again })}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        editable={!disabled}
        error={different ? says.passcode.different : null}
      />
    </View>
  );
}

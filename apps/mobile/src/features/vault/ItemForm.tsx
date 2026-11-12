import { Eye, EyeOff, Sparkles } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import type { VaultCategory } from '@/api/generated/homeport';
import { addDays, formatDayLong, today } from '@/lib/dates';
import { useTheme } from '@/theme';
import { Button } from '@/ui/Button';
import { Chip } from '@/ui/Chip';
import { DayPicker } from '@/ui/DayPicker';
import { Field, FieldButton } from '@/ui/Field';
import { Tap } from '@/ui/Motion';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

import type { ItemDraft } from './actions';
import { totpSecretFrom } from './crypto/totp';
import { generatePassword } from './generate';
import { isWeak } from './health';
import { FIELD_LIMIT, type FieldKind, type FieldName, FIELDS, SECRET_NOTE_LIMIT } from './inside';
import { DRAWERS } from './look';
import { usedElsewhere } from './session';

/** A new item, before anything is typed. */
export const emptyDraft = (category: VaultCategory): ItemDraft => ({ category, title: '', site: '', fields: {}, expiresOn: null });

/**
 * What stands between a draft and saving it: a title, and a one-time code secret that a code can be made
 * from. Returns the draft as it is saved (the secret tidied), or the name of the field to look at again.
 */
export function readyToSave(draft: ItemDraft): { draft: ItemDraft } | { wrong: 'title' | 'totp' } {
  if (!draft.title.trim()) return { wrong: 'title' };
  const typed = draft.fields.totp?.trim();
  if (!typed) return { draft };
  const secret = totpSecretFrom(typed);
  return secret ? { draft: { ...draft, fields: { ...draft.fields, totp: secret } } } : { wrong: 'totp' };
}

/** A field's name in the form: a login's first box takes an email address or a username. */
function formLabel(category: VaultCategory, name: FieldName): string {
  const says = words.vault.item.fields;
  if (name === 'username') return says.usernameField;
  if (name === 'totp') return says.totpField;
  if (name === 'code' && category === 'card') return says.securityCode;
  return says[name];
}

type Props = {
  draft: ItemDraft;
  onChange: (next: ItemDraft) => void;
  /** Given for a new item: the six drawers to choose from. A saved item stays in its drawer. */
  onCategory?: (category: VaultCategory) => void;
  /** The item being changed, so its own password doesn't count as "used elsewhere". */
  itemId: string | null;
  /** The field `readyToSave` said to look at again. */
  wrong?: 'title' | 'totp' | null;
  disabled?: boolean;
};

/**
 * The form of an item, for adding one and for changing one: its title and label, which are stored in the
 * clear, and under them its own fields by drawer, which are scrambled on this phone when it is saved.
 */
export function ItemForm({ draft, onChange, onCategory, itemId, wrong, disabled }: Props) {
  const [pickingDay, setPickingDay] = useState(false);
  const says = words.vault.form;
  const { category } = draft;
  const set = (name: FieldName, value: string) => onChange({ ...draft, fields: { ...draft.fields, [name]: value } });
  const password = category === 'login' || category === 'wifi' ? (draft.fields.password ?? '') : '';
  const elsewhere = password ? usedElsewhere(itemId, password) : [];

  return (
    <View style={{ gap: 12, paddingTop: 8 }}>
      {onCategory ? (
        <View accessibilityRole="radiogroup" accessibilityLabel={says.kind} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {DRAWERS.map((one) => (
            <Chip key={one} label={words.vault.drawers[one].one} emoji={words.vault.drawers[one].emoji} selected={one === category} onPress={() => onCategory(one)} />
          ))}
        </View>
      ) : null}
      <Field label={says.title} value={draft.title} onChangeText={(title) => onChange({ ...draft, title })} maxLength={200} placeholder={says.titlePlaceholder[category]} editable={!disabled} error={wrong === 'title' ? says.needTitle : null} />
      <Field label={says.site[category]} value={draft.site} onChangeText={(site) => onChange({ ...draft, site })} maxLength={120} placeholder={says.sitePlaceholder[category]} autoCapitalize="none" autoCorrect={false} editable={!disabled} />
      <Txt variant="caption" color="muted" style={{ marginHorizontal: 4 }}>
        {says.clearNote}
      </Txt>

      {FIELDS[category].map((field) => (
        <Typed
          key={`${category}-${field.name}`}
          kind={field.kind}
          label={formLabel(category, field.name)}
          value={draft.fields[field.name] ?? ''}
          onChange={(value) => set(field.name, value)}
          disabled={disabled}
          canGenerate={field.name === 'password'}
          limit={field.name === 'text' ? SECRET_NOTE_LIMIT : FIELD_LIMIT}
          long={field.name === 'text'}
          error={field.kind === 'totp' && wrong === 'totp' ? words.vault.item.badTotp : null}
          note={field.kind === 'totp' ? says.totpNote : field.name === 'password' && password ? (elsewhere.length ? says.reusedNow(elsewhere) : isWeak(password) ? says.weakNow : null) : null}
        />
      ))}

      {category === 'id' ? (
        <View style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row' }}>
            <FieldButton label={words.vault.item.fields.expiresOn} value={draft.expiresOn ? formatDayLong(draft.expiresOn) : says.expiresNone} onPress={() => setPickingDay(true)} />
          </View>
          {draft.expiresOn ? <Button label={says.expiresNone} variant="soft" size="sm" onPress={() => onChange({ ...draft, expiresOn: null })} /> : null}
          <DayPicker
            visible={pickingDay}
            onClose={() => setPickingDay(false)}
            title={says.expiresTitle}
            value={draft.expiresOn ?? addDays(today(), 365)}
            byYear
            onChange={(day) => {
              onChange({ ...draft, expiresOn: day });
              setPickingDay(false);
            }}
          />
        </View>
      ) : null}
      {onCategory ? (
        <Txt variant="caption" color="muted" style={{ marginHorizontal: 4 }}>
          {says.startsAs}
        </Txt>
      ) : null}
    </View>
  );
}

type TypedProps = { kind: FieldKind; label: string; value: string; onChange: (value: string) => void; disabled?: boolean; canGenerate?: boolean; limit: number; long?: boolean; error?: string | null; note?: string | null };

/** One box of the form. A secret is typed hidden, with an eye to look at it, and a password can be made instead of thought up. */
function Typed({ kind, label, value, onChange, disabled, canGenerate, limit, long, error, note }: TypedProps) {
  const { colors } = useTheme();
  const [shown, setShown] = useState(false);
  const says = words.vault;
  const plain = { autoCapitalize: 'none', autoCorrect: false, spellCheck: false, autoComplete: 'off' } as const;
  if (kind === 'long' || long) return <Field label={label} value={value} onChangeText={onChange} maxLength={limit} multiline editable={!disabled} {...(long ? plain : {})} />;
  if (kind === 'plain') return <Field label={label} value={value} onChangeText={onChange} maxLength={limit} editable={!disabled} {...plain} />;
  if (kind === 'totp') return <Field label={label} value={value} onChangeText={onChange} maxLength={limit} editable={!disabled} error={error} note={note} {...plain} />;
  return (
    <Field
      label={label}
      value={value}
      onChangeText={onChange}
      maxLength={limit}
      secureTextEntry={!shown}
      editable={!disabled}
      note={note}
      {...plain}
      accessory={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          {canGenerate ? (
            <Tap
              accessibilityRole="button"
              accessibilityLabel={says.form.generateSpoken}
              hitSlop={10}
              disabled={disabled}
              onPress={() => {
                onChange(generatePassword());
                setShown(true);
              }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Sparkles size={18} color={colors.accentText} />
              <Txt variant="caption" weight={700} color="accentText">
                {says.form.generate}
              </Txt>
            </Tap>
          ) : null}
          <Tap accessibilityRole="button" accessibilityLabel={shown ? says.item.hide(label) : says.item.show(label)} hitSlop={10} onPress={() => setShown((old) => !old)}>
            {shown ? <EyeOff size={20} color={colors.muted} /> : <Eye size={20} color={colors.muted} />}
          </Tap>
        </View>
      }
    />
  );
}

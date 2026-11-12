import { Check, Copy, Eye, EyeOff } from 'lucide-react-native';
import { type ReactNode, useEffect, useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import type { VaultAccess } from '@/api/generated/homeport';
import { formatDayLong } from '@/lib/dates';
import { useTheme } from '@/theme';
import { Card } from '@/ui/Card';
import { Tap } from '@/ui/Motion';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

import { totp, TOTP_STEP_SECONDS, totpSecondsLeft } from './crypto/totp';
import { type FieldKind, type FieldName, FIELDS, type Inside } from './inside';

/** What a field is called on the page. A card's short code is its security code; a username that is an email address is called that. */
export function fieldLabel(inside: Pick<Inside, 'category' | 'fields'>, name: FieldName): string {
  const says = words.vault.item.fields;
  if (name === 'username') return says.username(inside.fields.username ?? '');
  if (name === 'code' && inside.category === 'card') return says.securityCode;
  return says[name];
}

type Props = {
  inside: Inside;
  /** What this person may do. With "use" a secret is never shown, and can be copied once per visit. */
  access: VaultAccess;
  /** For an ID: the day it runs out, which is kept in the clear. */
  expiresOn?: string | null;
  onCopy: (text: string) => void;
};

/**
 * 9.3 What is inside an item, as one card of rows: each field's name over its value, with the eye to show a
 * secret and a way to copy it without showing it. A one-time code is worked out here and counts down.
 */
export function ItemFields({ inside, access, expiresOn, onCopy }: Props) {
  const rows = FIELDS[inside.category].filter((field) => inside.fields[field.name]);
  return (
    <Card style={{ marginHorizontal: 16, overflow: 'hidden' }}>
      {rows.map((field, index) => (
        <FieldRow key={field.name} first={index === 0} kind={field.kind} label={fieldLabel(inside, field.name)} value={inside.fields[field.name] ?? ''} canSee={access !== 'use'} onCopy={onCopy} />
      ))}
      {inside.category === 'id' && expiresOn ? <Line first={rows.length === 0} label={words.vault.item.fields.expiresOn} value={formatDayLong(expiresOn)} /> : null}
    </Card>
  );
}

/** One row: the small name over the value, and what can be done with it at the end. */
function Line({ first, label, value, spoken, lines, children }: { first: boolean; label: string; value: string; spoken?: string; lines?: number; children?: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 58, paddingVertical: 11, paddingHorizontal: 16, borderTopWidth: first ? 0 : 1, borderTopColor: colors.line }}>
      <View accessible accessibilityLabel={words.common.spoken([label, spoken ?? value])} style={{ flex: 1, gap: 1 }}>
        <Txt variant="small" color="muted">
          {label}
        </Txt>
        <Txt variant="item" numberOfLines={lines} selectable style={{ fontVariant: ['tabular-nums'] }}>
          {value}
        </Txt>
      </View>
      {children}
    </View>
  );
}

/** A small icon at the end of a row that does something: 20 points drawn, 44 to touch. */
function IconTap({ label, onPress, disabled, children }: { label: string; onPress: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <Tap accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled }} disabled={disabled} hitSlop={12} onPress={onPress} scaleTo={0.88} style={{ opacity: disabled ? 0.5 : 1 }}>
      {children}
    </Tap>
  );
}

function FieldRow({ first, kind, label, value, canSee, onCopy }: { first: boolean; kind: FieldKind; label: string; value: string; canSee: boolean; onCopy: (text: string) => void }) {
  const { colors } = useTheme();
  const [shown, setShown] = useState(false);
  const [copiedOnce, setCopiedOnce] = useState(false);
  const says = words.vault.item;

  if (kind === 'totp') return <CodeRow first={first} label={label} secret={value} onCopy={onCopy} />;
  if (kind === 'long') return <Line first={first} label={label} value={value} />;
  if (kind === 'plain') {
    return (
      <Line first={first} label={label} value={value} lines={1}>
        <IconTap label={says.copy(label)} onPress={() => onCopy(value)}>
          <Copy size={20} color={colors.muted} />
        </IconTap>
      </Line>
    );
  }
  // A secret. Someone who "can use" it never sees it here, and copies it once per visit.
  return (
    <Line first={first} label={label} value={shown && canSee ? value : says.dots} spoken={shown && canSee ? value : ''} lines={shown ? undefined : 1}>
      {canSee ? (
        <IconTap label={shown ? says.hide(label) : says.show(label)} onPress={() => setShown((old) => !old)}>
          {shown ? <EyeOff size={20} color={colors.muted} /> : <Eye size={20} color={colors.muted} />}
        </IconTap>
      ) : null}
      <IconTap
        label={canSee ? says.copy(label) : says.copyOnce(label)}
        disabled={!canSee && copiedOnce}
        onPress={() => {
          setCopiedOnce(true);
          onCopy(value);
        }}>
        {!canSee && copiedOnce ? <Check size={20} color={colors.muted} /> : <Copy size={20} color={colors.muted} />}
      </IconTap>
    </Line>
  );
}

/** The one-time code of this moment, the ring that shows how long it still has, and a way to copy it. */
function CodeRow({ first, label, secret, onCopy }: { first: boolean; label: string; secret: string; onCopy: (text: string) => void }) {
  const { colors } = useTheme();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const says = words.vault.item;
  const code = totp(secret, now);
  if (!code) return <Line first={first} label={label} value={says.badTotp} />;
  const left = totpSecondsLeft(now);
  // A 24-point ring with a 7-point hole, as drawn: a 5-point line on a circle of radius 9.5.
  const around = 2 * Math.PI * 9.5;
  return (
    <Line first={first} label={label} value={says.code(code)} spoken={says.codeSpoken(code, left)} lines={1}>
      <Svg width={24} height={24} style={{ transform: [{ rotate: '-90deg' }] }} accessible={false}>
        <Circle cx={12} cy={12} r={9.5} stroke={colors.fill2} strokeWidth={5} fill="none" />
        <Circle cx={12} cy={12} r={9.5} stroke={colors.accent} strokeWidth={5} fill="none" strokeDasharray={[(around * left) / TOTP_STEP_SECONDS, around]} />
      </Svg>
      <IconTap label={says.copy(label)} onPress={() => onCopy(code)}>
        <Copy size={20} color={colors.muted} />
      </IconTap>
    </Line>
  );
}

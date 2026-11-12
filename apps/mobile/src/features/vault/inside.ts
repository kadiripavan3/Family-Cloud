import type { VaultCategory } from '@/api/generated/homeport';

import { fromUtf8, utf8 } from './crypto/bytes';

/**
 * What is inside an item: everything that is sealed with the item's key before it leaves the phone. The API
 * stores it as one scrambled piece and never learns its shape, so the shape is written down here and nowhere
 * else (docs/07-vault-protocol.md "Items": "What the plaintext looks like is the app's business").
 *
 * It is JSON: `{ v: 1, title, site, category, fields }`. The title, the site and the drawer are repeated
 * inside, so a phone can notice when the labels the API shows in the clear were changed to point at
 * something else.
 */
export type Inside = {
  v: 1;
  title: string;
  site: string;
  category: VaultCategory;
  /** The item's own fields, by name. A field that was left empty is not in here. */
  fields: Fields;
};

export type FieldName = 'username' | 'password' | 'totp' | 'holder' | 'number' | 'expires' | 'code' | 'pin' | 'network' | 'text' | 'notes';
export type Fields = Partial<Record<FieldName, string>>;

/**
 * How a field is drawn and typed:
 *  - `secret`: shown as dots until the eye is pressed, and never shown at all to someone who "can use" it;
 *  - `totp`: a secret that is never shown as it is: the screen shows the six digits worked out from it;
 *  - `plain`: shown as it is (an email address, the name on a card, the name of a network);
 *  - `long`: plain, over several lines.
 */
export type FieldKind = 'secret' | 'totp' | 'plain' | 'long';

/** Each drawer's fields, in the order they are drawn. The first secret one is what "copy" in a list copies. */
export const FIELDS: Record<VaultCategory, readonly { name: FieldName; kind: FieldKind }[]> = {
  login: [
    { name: 'username', kind: 'plain' },
    { name: 'password', kind: 'secret' },
    { name: 'totp', kind: 'totp' },
    { name: 'notes', kind: 'long' },
  ],
  card: [
    { name: 'holder', kind: 'plain' },
    { name: 'number', kind: 'secret' },
    { name: 'expires', kind: 'plain' },
    { name: 'code', kind: 'secret' },
    { name: 'pin', kind: 'secret' },
    { name: 'notes', kind: 'long' },
  ],
  id: [
    { name: 'number', kind: 'secret' },
    { name: 'notes', kind: 'long' },
  ],
  wifi: [
    { name: 'network', kind: 'plain' },
    { name: 'password', kind: 'secret' },
    { name: 'notes', kind: 'long' },
  ],
  code: [
    { name: 'code', kind: 'secret' },
    { name: 'notes', kind: 'long' },
  ],
  secret: [{ name: 'text', kind: 'secret' }],
};

/** The longest a single field may be. The whole item has to fit the API's 64 KB once it is sealed. */
export const FIELD_LIMIT = 4000;
export const SECRET_NOTE_LIMIT = 20000;

/** The field whose strength is judged: a login's or a network's password. The other drawers have none. */
export function passwordOf(inside: Pick<Inside, 'category' | 'fields'>): string | null {
  return inside.category === 'login' || inside.category === 'wifi' ? (inside.fields.password ?? null) : null;
}

/** What "copy" copies from a list, without opening the item's screen: its first secret field that isn't empty. */
export function mainSecret(inside: Pick<Inside, 'category' | 'fields'>): string | null {
  for (const field of FIELDS[inside.category]) {
    const value = inside.fields[field.name];
    if (field.kind === 'secret' && value) return value;
  }
  return null;
}

/** What a guest is shown on a pass for this item: the code, or the network and its password. Null when it has nothing to show. */
export function guestTextOf(inside: Pick<Inside, 'category' | 'fields'>, network: (name: string, password: string) => string): string | null {
  const { network: name, password } = inside.fields;
  if (inside.category === 'wifi' && name && password) return network(name, password);
  return mainSecret(inside);
}

/** An item's inside, tidied: fields of its own drawer only, without the empty ones. */
export function insideOf(category: VaultCategory, title: string, site: string, typed: Fields): Inside {
  const fields: Fields = {};
  for (const { name, kind } of FIELDS[category]) {
    const value = typed[name];
    // A secret is kept exactly as typed: a space at the end of a password is part of it.
    const kept = kind === 'secret' || kind === 'totp' ? value : value?.trim();
    if (kept) fields[name] = kept;
  }
  return { v: 1, title: title.trim(), site: site.trim(), category, fields };
}

/** The bytes that get sealed. */
export function encodeInside(inside: Inside): Uint8Array {
  return utf8(JSON.stringify(inside));
}

/** What opening an item gave that the app can't use: not this app's format, or a newer one. */
export class NotReadable extends Error {
  constructor() {
    super('NotReadable: not this app\'s format, or a newer one');
    this.name = 'NotReadable';
  }
}

const NAMES = new Set<string>(Object.values(FIELDS).flatMap((fields) => fields.map((field) => field.name)));

/** The inside of an item, from the bytes that came out of its seal. Throws `NotReadable` for anything that isn't this app's format. */
export function decodeInside(bytes: Uint8Array): Inside {
  let read: unknown;
  try {
    read = JSON.parse(fromUtf8(bytes));
  } catch {
    throw new NotReadable();
  }
  if (!read || typeof read !== 'object') throw new NotReadable();
  const { v, title, site, category, fields } = read as Record<string, unknown>;
  if (v !== 1 || typeof title !== 'string' || typeof site !== 'string' || typeof category !== 'string' || !(category in FIELDS) || !fields || typeof fields !== 'object') throw new NotReadable();
  const kept: Fields = {};
  for (const [name, value] of Object.entries(fields as Record<string, unknown>)) {
    if (NAMES.has(name) && typeof value === 'string') kept[name as FieldName] = value;
  }
  return { v: 1, title, site, category: category as VaultCategory, fields: kept };
}

/**
 * True when the labels the API shows in the clear are the ones that were sealed inside. When they differ,
 * someone changed a label without the item's key: the screen says so instead of showing "Netflix" over what
 * is really the bank's password.
 */
export function labelsMatch(inside: Inside, clear: { title?: string | null; site?: string | null; category?: string | null }): boolean {
  return inside.title === (clear.title ?? '').trim() && inside.site === (clear.site ?? '').trim() && inside.category === clear.category;
}

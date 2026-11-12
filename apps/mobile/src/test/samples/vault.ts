/**
 * Made-up answers for the tests of the Vault: whole objects, the way the API sends them. Import them from
 * '@/test/samples/vault'; the people and circles every test shares are in '@/test/samples'.
 *
 * The keys in here are real ones, made for the tests and for nothing else, so a test can seal something the
 * way a phone does and check that a screen opens it.
 */
import type {
  EntrustedVaultResponse,
  VaultAttentionResponse,
  VaultEmergencyResponse,
  VaultHelperResponse,
  VaultHelpersResponse,
  VaultHelpingResponse,
  VaultHomeResponse,
  VaultItemPersonResponse,
  VaultItemResponse,
  VaultItemRowResponse,
  VaultOpenedResponse,
  VaultPersonResponse,
  VaultRecordResponse,
  VaultRecoveryResponse,
  VaultSharingResponse,
} from '@/api/generated/homeport';
import { toBase64Url } from '@/features/vault/crypto/bytes';
import { publicKeyOf, seal, sealFor } from '@/features/vault/crypto/seal';
import { encodeInside, type Inside } from '@/features/vault/inside';

import { everyone, onlyMe, withAlex } from './spine';

/** A private key made up for the tests: Nora's, and the public key that belongs to it. */
export const NORA_KEY = Uint8Array.from({ length: 32 }, (_, i) => (i * 7 + 3) & 0xff);
export const NORA_PUBLIC = toBase64Url(publicKeyOf(NORA_KEY));
/** And Alex's. */
export const ALEX_KEY = Uint8Array.from({ length: 32 }, (_, i) => (i * 11 + 5) & 0xff);
export const ALEX_PUBLIC = toBase64Url(publicKeyOf(ALEX_KEY));
/** A Vault key as it is shown, in its six groups. */
export const VAULT_KEY = 'KT4M 9QXZ PL2A 77HD VB3N E8RW';

const AT = '2026-11-12T09:00:00Z';
export const NETFLIX = 'aaaaaaaa-2222-4222-8222-222222222222';
export const DOOR = 'bbbbbbbb-2222-4222-8222-222222222222';

/** Nora's own Vault record, once she has one. (The wrapped private key here is a stand-in: tests that unlock put the key in themselves.) */
export function vaultRecord(over: Partial<VaultRecordResponse> = {}): VaultRecordResponse {
  return { setUp: true, publicKey: NORA_PUBLIC, wrappedPrivateKey: 'AQ-wrapped-private-key', salt: 'c2FsdHNhbHRzYWx0c2FsdA', kdf: { n: 32768, r: 8, p: 1 }, keyVersion: 1, keySaved: true, createdAt: AT, ...over };
}
/** Before a Vault exists. */
export const noVault: VaultRecordResponse = { setUp: false, publicKey: null, wrappedPrivateKey: null, salt: null, kdf: null, keyVersion: 0, keySaved: false, createdAt: null };

export function itemRow(over: Partial<VaultItemRowResponse> = {}): VaultItemRowResponse {
  return {
    id: NETFLIX,
    circleId: 'c-linds',
    title: 'Netflix',
    category: 'login',
    site: 'netflix.com',
    expiresOn: null,
    renewSoon: false,
    health: 'ok',
    updatedAt: AT,
    mine: false,
    canEdit: false,
    chip: withAlex,
    owner: { memberId: 'm-alex', name: 'Alex Strand', avatarUrl: null },
    myAccess: 'see',
    myState: 'ready',
    sample: false,
    glance: 'Login · netflix.com',
    ...over,
  };
}
export const doorRow = itemRow({ id: DOOR, title: 'Front door code', category: 'code', site: 'home', glance: 'Code · home', chip: everyone });

/** 9.2 The Vault's home, as the drawing has it: six drawers, two passwords that need a look, two things shared. */
export function vaultHome(over: Partial<VaultHomeResponse> = {}): VaultHomeResponse {
  return {
    drawers: [
      { category: 'login', items: 31 },
      { category: 'card', items: 4 },
      { category: 'id', items: 9 },
      { category: 'wifi', items: 2 },
      { category: 'code', items: 5 },
      { category: 'secret', items: 6 },
    ],
    needsALook: { total: 2, weak: 0, reused: 1, leaked: 1 },
    sharedWithYouCount: 2,
    sharedWithYou: [itemRow(), doorRow],
    ...over,
  };
}

export function itemPerson(over: Partial<VaultItemPersonResponse> = {}): VaultItemPersonResponse {
  return { memberId: 'm-alex', name: 'Alex Strand', avatarUrl: null, kind: 'person', role: 'adult', owner: false, you: false, publicKey: ALEX_PUBLIC, missing: null, access: 'see', state: 'ready', once: false, stopsAt: null, openedAt: null, changedAt: null, ...over };
}
export const noraOwns = itemPerson({ memberId: 'm-nora', name: 'Nora Lind', owner: true, you: true, publicKey: NORA_PUBLIC, access: 'change' });
export const miaNoPhone = itemPerson({ memberId: 'm-mia', name: 'Mia', kind: 'child', role: 'child', publicKey: null, missing: 'no_phone', access: null, state: null });
export const leaNoVault = itemPerson({ memberId: 'm-lea', name: 'Lea', publicKey: null, missing: 'no_vault', access: null, state: null });

/** An item of Nora's own: a login, shared with Alex to see. */
export function vaultItem(over: Partial<VaultItemResponse> = {}): VaultItemResponse {
  return {
    id: NETFLIX,
    circleId: 'c-linds',
    title: 'Netflix',
    category: 'login',
    site: 'netflix.com',
    expiresOn: null,
    renewSoon: false,
    health: 'ok',
    version: 1,
    updatedAt: AT,
    changedAt: AT,
    mine: true,
    canEdit: true,
    chip: onlyMe,
    owner: { memberId: 'm-nora', name: 'Nora Lind', avatarUrl: null },
    myAccess: 'change',
    myState: 'ready',
    once: false,
    stopsAt: null,
    sample: false,
    glance: 'Login · netflix.com',
    about: [],
    people: [noraOwns, itemPerson()],
    ...over,
  };
}

/** What is inside the Netflix login. */
export const NETFLIX_INSIDE: Inside = { v: 1, title: 'Netflix', site: 'netflix.com', category: 'login', fields: { username: 'linds.home@example.com', password: 'p0pcorn!Friday#night', totp: 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ' } };
/** An item key made up for the tests. */
export const ITEM_KEY = Uint8Array.from({ length: 32 }, (_, i) => (i * 13 + 1) & 0xff);

/**
 * What `POST /v1/vault/items/{id}/open` answers, sealed for real the way a phone seals: the inside with an
 * item key, that key wrapped for whoever opens it (Nora, unless another private key's owner is given).
 */
export function openedAnswer(inside: Inside = NETFLIX_INSIDE, over: Partial<VaultOpenedResponse> = {}, forKey: Uint8Array = NORA_KEY): VaultOpenedResponse {
  return { id: NETFLIX, version: 1, ciphertext: seal(ITEM_KEY, encodeInside(inside), 'item'), wrappedKey: sealFor(publicKeyOf(forKey), ITEM_KEY, 'item-key'), access: 'change', once: false, ...over };
}

export function sharing(over: Partial<VaultSharingResponse> = {}): VaultSharingResponse {
  return { itemId: NETFLIX, title: 'Netflix', audience: 'some', everyone: 'see', mine: true, people: [noraOwns, itemPerson(), miaNoPhone, leaNoVault], ...over };
}

export function vaultPerson(over: Partial<VaultPersonResponse> = {}): VaultPersonResponse {
  return { memberId: 'm-alex', name: 'Alex Strand', avatarUrl: null, hasVault: true, publicKey: ALEX_PUBLIC, ...over };
}

export function emergency(over: Partial<VaultEmergencyResponse> = {}): VaultEmergencyResponse {
  return { state: 'off', trusted: null, waitHours: 48, items: [], noteMine: null, askedAt: null, opensAt: null, refusedAt: null, openedAt: null, ...over };
}

export function entrusted(over: Partial<EntrustedVaultResponse> = {}): EntrustedVaultResponse {
  return { id: 'e-1', owner: vaultPerson({ memberId: 'm-nora', name: 'Nora Lind', publicKey: NORA_PUBLIC }), state: 'ready', waitHours: 48, askedAt: null, opensAt: null, refusedAt: null, openedAt: null, note: null, items: [], ...over };
}

export function helper(over: Partial<VaultHelperResponse> = {}): VaultHelperResponse {
  return { id: 'h-alex', person: vaultPerson(), state: 'accepted', hasShare: true, askedAt: AT, answeredAt: AT, ...over };
}
export function helpers(over: Partial<VaultHelpersResponse> = {}): VaultHelpersResponse {
  return { helpers: [], needed: 2, ready: false, sharesDue: false, ...over };
}

export function helping(over: Partial<VaultHelpingResponse> = {}): VaultHelpingResponse {
  return { id: 'hp-1', person: vaultPerson({ memberId: 'm-nora', name: 'Nora Lind', publicKey: NORA_PUBLIC }), state: 'asked', askedAt: AT, recovery: null, ...over };
}

export function recovery(over: Partial<VaultRecoveryResponse> = {}): VaultRecoveryResponse {
  return {
    id: 'r-1',
    state: 'open',
    startedAt: AT,
    lapsesAt: '2026-11-19T09:00:00Z',
    endedAt: null,
    tempPublicKey: ALEX_PUBLIC,
    needed: 2,
    given: 0,
    ready: false,
    helpers: [
      { person: vaultPerson(), given: false, resealedShare: null },
      { person: vaultPerson({ memberId: 'm-astrid', name: 'Astrid Lind' }), given: false, resealedShare: null },
    ],
    ...over,
  };
}

/** What needs the person now: nothing, unless a test says so. */
export function attention(over: Partial<VaultAttentionResponse> = {}): VaultAttentionResponse {
  return { emergency: null, recovery: null, helperAsks: [], helpNeeded: [], entrusted: [], waitingForKeys: 0, sharesDue: false, ...over };
}

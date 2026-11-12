import {
  addGuestPassCard,
  changeVaultItem,
  createVaultItem,
  type EntrustedVaultResponse,
  finishVaultRecovery,
  getEmergency,
  getShareToPassOn,
  getVault,
  getVaultWaiting,
  giveVaultKeys,
  type GuestPassResponse,
  openEntrustedItem,
  openVaultItem,
  passShareOn,
  replaceVaultKey,
  saveEmergency,
  saveHelperShares,
  saveVaultSharing,
  setUpVault,
  startVaultRecovery,
  type VaultAccess,
  type VaultCategory,
  type VaultEmergencyResponse,
  type VaultHelpersResponse,
  type VaultItemPersonResponse,
  type VaultItemResponse,
  type VaultRecordResponse,
  type VaultRecoveryResponse,
  type VaultShareWith,
  type VaultSharingResponse,
} from '@/api/generated/homeport';
import { newClientId } from '@/lib/ids';

import { fromBase64Url, fromUtf8, sameBytes, toBase64Url, utf8, wipe } from './crypto/bytes';
import { sealForGuest } from './crypto/guest';
import { DoesNotOpen, newKey, newKeyPair, open, openMine, publicKeyOf, seal, sealFor } from './crypto/seal';
import { join, split } from './crypto/shamir';
import { belongsTo, newVaultKey, normalizeVaultKey, unwrapPrivateKey, type VaultRecord, wrapPrivateKey } from './crypto/vaultKey';
import { healthOf } from './health';
import { decodeInside, encodeInside, type Fields, type Inside, insideOf, labelsMatch, passwordOf } from './inside';
import { keptChanged } from './kept';
import { forgetKept, forgetRecovery, keepBehindDevice, keepBehindPasscode, keepRecovery, takeFromDevice, takeRecovery, takeWithPasscode } from './keeper';
import { forgetPassword, holdFreshVaultKey, isVaultUnlocked, rememberPassword, unlockVault, usedElsewhere, VaultLocked, vaultPrivateKey, vaultUsed } from './session';

/**
 * What the phone does with keys, step by step, as docs/07-vault-protocol.md "The messages" describes each
 * flow: the calls to the API on one side, the cryptography (`./crypto`) on the other, and the unlocked Vault
 * (`./session`) in between. No React in here. Every function that needs the private key throws `VaultLocked`
 * when the Vault is locked.
 *
 * Nothing these return or take is ever handed to the data layer: a screen keeps what it shows of an opened
 * item in its own state, and lets go of it when it closes or the Vault locks.
 */

type Progress = (done: number) => void;

/** A record the API answered for someone who has a Vault, with nothing missing. Throws for one who hasn't. */
export function recordOf(vault: VaultRecordResponse): VaultRecord {
  if (!vault.setUp || !vault.publicKey || !vault.wrappedPrivateKey || !vault.salt) throw new Error('no Vault has been set up');
  return { publicKey: vault.publicKey, wrappedPrivateKey: vault.wrappedPrivateKey, salt: vault.salt, kdf: vault.kdf };
}

const myPublicKey = () => publicKeyOf(vaultPrivateKey());

/**
 * An item key a screen hands back, checked before it is wrapped for anyone: a key the screen has let go of
 * meanwhile is all zeros, and must be handed to nobody as if it were the item's key.
 */
function stillHeld(itemKey: Uint8Array): Uint8Array {
  if (itemKey.length !== 32 || sameBytes(itemKey, new Uint8Array(32))) throw new VaultLocked();
  return itemKey;
}

// ---------- a person's Vault ----------

/** How this phone keeps the key between unlocks: behind Face ID, or behind a passcode the person chose. */
export type DeviceLock = { how: 'device' } | { how: 'passcode'; passcode: string };

/** One of two slow sums in a row, as its half of the whole. */
const half = (onProgress: Progress | undefined, from: number): Progress | undefined => (onProgress ? (done) => onProgress(from + done / 2) : undefined);

/** Keeps the private key on this phone or browser between unlocks, the way the person chose. */
export async function keepOnThisPhone(account: string, privateKey: Uint8Array, lock: DeviceLock, onProgress?: Progress): Promise<void> {
  if (lock.how === 'device') await keepBehindDevice(account, privateKey);
  else await keepBehindPasscode(account, privateKey, lock.passcode, onProgress);
  await keptChanged(account);
}

/** Keeps the key of the unlocked Vault on this phone: after unlocking with the Vault key on a new phone. */
export function keepUnlockedVault(account: string, lock: DeviceLock, onProgress?: Progress): Promise<void> {
  return keepOnThisPhone(account, vaultPrivateKey(), lock, onProgress);
}

/**
 * The first time: makes the key pair and the Vault key on this phone, and sends the public key and the
 * wrapped private key. The phone keeps its own copy first, and only then is the API told: a Vault must never
 * exist whose key no phone holds and nobody has seen. The Vault is unlocked afterwards, and the Vault key is
 * held to be shown once.
 */
export async function setUpNewVault(account: string, lock: DeviceLock, onProgress?: Progress): Promise<VaultRecordResponse> {
  const pair = newKeyPair();
  const vaultKey = newVaultKey();
  const wrapped = await wrapPrivateKey(vaultKey, pair.privateKey, half(onProgress, 0));
  await keepOnThisPhone(account, pair.privateKey, lock, half(onProgress, 0.5));
  let record: VaultRecordResponse;
  try {
    record = await setUpVault({ publicKey: toBase64Url(pair.publicKey), ...wrapped });
  } catch (error) {
    // No Vault was made (or there is one already, with another key): this phone's copy opens nothing.
    await forgetKept(account);
    await keptChanged(account);
    wipe(pair.privateKey);
    throw error;
  }
  unlockVault(pair.privateKey);
  holdFreshVaultKey(vaultKey);
  return record;
}

/** A new phone: the Vault key the person typed opens the private key out of their record. Throws `DoesNotOpen` when it is the wrong key. */
export async function unlockWithVaultKey(typed: string, vault: VaultRecordResponse, onProgress?: Progress): Promise<void> {
  unlockVault(await unwrapPrivateKey(typed, recordOf(vault), onProgress));
}

/** This phone, with Face ID: the phone's secure storage hands the key back. It still has to be this Vault's key. */
export async function unlockWithDevice(account: string, vault: VaultRecordResponse, prompt: string): Promise<void> {
  const key = await takeFromDevice(account, prompt);
  if (!belongsTo(key, recordOf(vault).publicKey)) {
    wipe(key);
    throw new DoesNotOpen();
  }
  unlockVault(key);
}

/** This phone or browser, with the passcode chosen on it. Throws `DoesNotOpen` when the passcode is wrong. */
export async function unlockWithPasscode(account: string, vault: VaultRecordResponse, passcode: string, onProgress?: Progress): Promise<void> {
  const key = await takeWithPasscode(account, passcode, onProgress);
  if (!belongsTo(key, recordOf(vault).publicKey)) {
    wipe(key);
    throw new DoesNotOpen();
  }
  unlockVault(key);
}

/**
 * A new Vault key for the same key pair: the private key wrapped afresh. The old Vault key stops working,
 * every helper's share is thrown away by the API, and the new key is held to be shown once.
 */
export async function makeNewVaultKey(onProgress?: Progress): Promise<VaultRecordResponse> {
  const vaultKey = newVaultKey();
  const record = await replaceVaultKey(await wrapPrivateKey(vaultKey, vaultPrivateKey(), onProgress));
  holdFreshVaultKey(vaultKey);
  return record;
}

// ---------- items ----------

/** An item, opened: what is inside, and what the phone needs to save a change or share it. Kept by the screen that shows it, never by the data layer. */
export type Opened = {
  inside: Inside;
  /** The item's own key. Wipe it when the screen closes. */
  itemKey: Uint8Array;
  /** The version of the ciphertext that was read: sent back when saving a new one. */
  version: number;
  access: VaultAccess;
  /** True when this was the one time: the API has erased this person's key for it. */
  once: boolean;
  /** True when the title, site or drawer the API shows are not the ones sealed inside. */
  labelsChanged: boolean;
};

/** What the API shows of an item in the clear, as far as opening needs it. */
type Clear = { id: string; title?: string | null; site?: string | null; category?: string | null };

/**
 * Opens an item: asks the API for its ciphertext and this person's wrapped key (the only route that hands
 * them out; the API writes down who and when), unwraps the item key with the private key, and opens the
 * ciphertext with it.
 */
export async function openItem(item: Clear): Promise<Opened> {
  // Asked before the API is: a locked Vault must never spend a look it can't use.
  vaultPrivateKey();
  const handed = await openVaultItem(item.id);
  // Taken afresh after the wait: had the Vault locked meanwhile, bytes held from before would be zeros. This says "locked" instead.
  const itemKey = openMine(vaultPrivateKey(), handed.wrappedKey, 'item-key');
  const inside = decodeInside(open(itemKey, handed.ciphertext, 'item'));
  vaultUsed();
  rememberPassword(item.id, inside.title, passwordOf(inside));
  return { inside, itemKey, version: handed.version, access: handed.access, once: handed.once, labelsChanged: !labelsMatch(inside, item) };
}

export type ItemDraft = { category: VaultCategory; title: string; site: string; fields: Fields; /** For an ID: the day it runs out, or null. */ expiresOn: string | null };

/** The phone's verdict on the password in a draft: weak by length and variety, reused when another item opened since unlocking holds the same one. */
function verdict(itemId: string | null, inside: Inside) {
  const password = passwordOf(inside);
  return healthOf(password, usedElsewhere(itemId, password).length > 0);
}

/** A new item: a fresh item key, the inside sealed with it, the key wrapped for its maker. It starts as "only you". */
export async function createItem(circleId: string, clientId: string, draft: ItemDraft): Promise<VaultItemResponse> {
  const mine = myPublicKey();
  const inside = insideOf(draft.category, draft.title, draft.site, draft.fields);
  const itemKey = newKey();
  try {
    const made = await createVaultItem({
      clientId,
      circleId,
      title: inside.title,
      category: inside.category,
      site: inside.site,
      expiresOn: draft.category === 'id' && draft.expiresOn ? draft.expiresOn : undefined,
      health: verdict(null, inside),
      ciphertext: seal(itemKey, encodeInside(inside), 'item'),
      wrappedKey: sealFor(mine, itemKey, 'item-key'),
    });
    vaultUsed();
    rememberPassword(made.id, inside.title, passwordOf(inside));
    return made;
  } finally {
    wipe(itemKey);
  }
}

/** Saves a change: the labels in the clear, and a new ciphertext sealed with the same item key. Refused by the API if someone else saved since `opened.version`. */
export async function saveItem(item: VaultItemResponse, opened: Pick<Opened, 'itemKey' | 'version'>, draft: ItemDraft): Promise<VaultItemResponse> {
  vaultPrivateKey();
  const inside = insideOf(item.category, draft.title, draft.site, draft.fields);
  const isId = item.category === 'id';
  const saved = await changeVaultItem(item.id, {
    title: inside.title,
    site: inside.site,
    expiresOn: isId && draft.expiresOn ? draft.expiresOn : undefined,
    removeExpiry: isId && !draft.expiresOn && item.expiresOn ? true : undefined,
    health: verdict(item.id, inside),
    ciphertext: seal(opened.itemKey, encodeInside(inside), 'item'),
    version: opened.version,
  });
  vaultUsed();
  rememberPassword(item.id, inside.title, passwordOf(inside));
  return saved;
}

/** An item was deleted: its password is no longer one to compare with. */
export function itemGone(id: string): void {
  forgetPassword(id);
}

// ---------- sharing ----------

/** Who an item is shared with after the sheet is saved: the people named, each with what they may do. An empty list is "only you". */
export type ShareDraft = { memberId: string; access: VaultAccess; once: boolean; stopsAt: string | null }[];

/** True for someone who holds, or once held, a key to the item: taking them off the list is the moment to give it a new one. */
const heldAKey = (person: VaultItemPersonResponse) => !person.owner && person.access !== null && person.state !== null && person.state !== 'waiting';

/** Whether saving this draft takes the item away from someone who has had its key. */
export function removesSomeone(sharing: VaultSharingResponse, draft: ShareDraft): boolean {
  const named = new Set(draft.map((person) => person.memberId));
  return sharing.people.some((person) => heldAKey(person) && !named.has(person.memberId));
}

/**
 * Saves who an item is shared with: the audience and each person's wrapped key, in one request.
 *
 *  - Someone new, someone who was waiting, and someone whose key was used up or had stopped gets the item key
 *    wrapped for them, if they have a Vault. Without a Vault they wait: `giveWaitingKeys` hands it over later.
 *  - Someone who holds a working key keeps it; only what they may do is changed.
 *  - When someone who has had the key is taken off, the item gets a new key in the same request (`rotation`):
 *    sealed again, the new key wrapped for the owner, for everyone who stays, and for the trusted person if
 *    the item opens to them in an emergency. The key the removed person may have kept opens nothing that is
 *    stored from then on.
 */
export async function shareItem(item: Clear, opened: Pick<Opened, 'inside' | 'itemKey' | 'version'>, sharing: VaultSharingResponse, draft: ShareDraft): Promise<VaultSharingResponse> {
  const mine = myPublicKey();
  const roster = new Map(sharing.people.map((person) => [person.memberId, person]));
  const rotate = removesSomeone(sharing, draft);
  const itemKey = rotate ? newKey() : stillHeld(opened.itemKey);
  try {
    const people: VaultShareWith[] = draft.map((person) => {
      const now = roster.get(person.memberId);
      const needsKey = rotate || now?.state !== 'ready';
      return {
        memberId: person.memberId,
        access: person.access,
        once: person.once,
        stopsAt: person.stopsAt ?? undefined,
        wrappedKey: needsKey && now?.publicKey ? sealFor(fromBase64Url(now.publicKey), itemKey, 'item-key') : undefined,
      };
    });
    let rotation;
    if (rotate) {
      const emergency = await getEmergency();
      const inEscrow = emergency.state !== 'off' && emergency.items.some((one) => one.id === item.id);
      rotation = {
        version: opened.version,
        ciphertext: seal(itemKey, encodeInside(opened.inside), 'item'),
        myWrappedKey: sealFor(mine, itemKey, 'item-key'),
        emergencyWrappedKey: inEscrow && emergency.trusted?.publicKey ? sealFor(fromBase64Url(emergency.trusted.publicKey), itemKey, 'escrow-key') : undefined,
      };
    }
    const saved = await saveVaultSharing(item.id, { audience: draft.length > 0 ? 'some' : 'me', people, rotation });
    vaultUsed();
    return saved;
  } finally {
    if (rotate) wipe(itemKey);
  }
}

/**
 * Hands keys to people who were waiting for one of this person's items: someone who set up their Vault
 * later, or joined later. For each item the phone opens its own copy of the key and wraps it for each person
 * with the public key the API reports. Returns how many keys were handed over.
 */
export async function giveWaitingKeys(): Promise<number> {
  vaultPrivateKey();
  const waiting = await getVaultWaiting();
  const byItem = new Map<string, typeof waiting>();
  for (const one of waiting) byItem.set(one.itemId, [...(byItem.get(one.itemId) ?? []), one]);
  let given = 0;
  for (const [itemId, people] of byItem) {
    const handed = await openVaultItem(itemId);
    const itemKey = openMine(vaultPrivateKey(), handed.wrappedKey, 'item-key');
    try {
      await giveVaultKeys(itemId, { keys: people.map((person) => ({ memberId: person.memberId, wrappedKey: sealFor(fromBase64Url(person.publicKey), itemKey, 'item-key') })) });
      given += people.length;
    } finally {
      wipe(itemKey);
    }
  }
  vaultUsed();
  return given;
}

// ---------- if something happens ----------

export type EmergencyDraft = { trustedMemberId: string; trustedPublicKey: string; waitHours: number; itemIds: string[]; note: string };

/**
 * Turns emergency access on, or replaces it. The escrow is made here: each chosen item's key wrapped for the
 * trusted person, the note sealed for them, and once more for its writer so they can read it again.
 */
export async function saveEmergencyAccess(draft: EmergencyDraft): Promise<VaultEmergencyResponse> {
  vaultPrivateKey();
  const trusted = fromBase64Url(draft.trustedPublicKey);
  const items = [];
  for (const id of draft.itemIds) {
    const handed = await openVaultItem(id);
    const itemKey = openMine(vaultPrivateKey(), handed.wrappedKey, 'item-key');
    items.push({ id, wrappedKey: sealFor(trusted, itemKey, 'escrow-key') });
    wipe(itemKey);
  }
  const note = draft.note.trim();
  const saved = await saveEmergency({
    trustedMemberId: draft.trustedMemberId,
    waitHours: draft.waitHours,
    items,
    note: note ? sealFor(trusted, utf8(note), 'escrow-note') : undefined,
    noteMine: note ? sealFor(myPublicKey(), utf8(note), 'own-note') : undefined,
  });
  vaultUsed();
  return saved;
}

/** The owner's own note for the family, read again on their phone. */
export function readOwnNote(emergency: Pick<VaultEmergencyResponse, 'noteMine'>): string {
  return emergency.noteMine ? fromUtf8(openMine(vaultPrivateKey(), emergency.noteMine, 'own-note')) : '';
}

/** The trusted person's side, once it is open: the note that was written for them. */
export function readEntrustedNote(entrusted: Pick<EntrustedVaultResponse, 'note'>): string {
  return entrusted.note ? fromUtf8(openMine(vaultPrivateKey(), entrusted.note, 'escrow-note')) : '';
}

/** The trusted person's side, once it is open: one of the items that were entrusted, opened with its key from the escrow. */
export async function openEntrusted(entrustedId: string, itemId: string): Promise<Inside> {
  vaultPrivateKey();
  const handed = await openEntrustedItem(entrustedId, itemId);
  const itemKey = openMine(vaultPrivateKey(), handed.wrappedKey, 'escrow-key');
  try {
    vaultUsed();
    return decodeInside(open(itemKey, handed.ciphertext, 'item'));
  } finally {
    wipe(itemKey);
  }
}

// ---------- helpers and getting back in ----------

/**
 * Splits the Vault key for the helpers who said yes, so that any two of them together rebuild it, and seals
 * one share for each. The Vault key is checked first: a typo would hand out shares of a key that opens nothing.
 */
export async function splitForHelpers(typedVaultKey: string, vault: VaultRecordResponse, helpers: VaultHelpersResponse, onProgress?: Progress): Promise<VaultHelpersResponse> {
  vaultPrivateKey();
  const vaultKey = normalizeVaultKey(typedVaultKey);
  if (!vaultKey) throw new DoesNotOpen();
  wipe(await unwrapPrivateKey(vaultKey, recordOf(vault), onProgress));
  const accepted = helpers.helpers.filter((helper) => helper.state === 'accepted' && helper.person.publicKey);
  if (accepted.length < 2) throw new Error('two helpers who said yes are needed');
  const secret = utf8(vaultKey);
  const shares = split(secret, accepted.length);
  try {
    const saved = await saveHelperShares({ shares: accepted.map((helper, at) => ({ helperId: helper.id, sealedShare: sealFor(fromBase64Url(helper.person.publicKey!), shares[at]!, 'helper-share') })) });
    vaultUsed();
    return saved;
  } finally {
    wipe(secret, ...shares);
  }
}

/**
 * A helper's part in a recovery: their own share, opened with their private key and sealed again for the
 * temporary key of the new phone. Only works while the recovery is open.
 */
export async function passMyShareOn(helpingId: string): Promise<void> {
  vaultPrivateKey();
  const toPassOn = await getShareToPassOn(helpingId);
  const share = openMine(vaultPrivateKey(), toPassOn.sealedShare, 'helper-share');
  try {
    await passShareOn(helpingId, { recoveryId: toPassOn.recoveryId, resealedShare: sealFor(fromBase64Url(toPassOn.tempPublicKey), share, 'recovery-share') });
    vaultUsed();
  } finally {
    wipe(share);
  }
}

/** A new phone without the Vault key: makes a temporary key pair, starts a recovery with its public half, and keeps the private half until the recovery ends. */
export async function startRecovery(account: string): Promise<VaultRecoveryResponse> {
  const pair = newKeyPair();
  try {
    const recovery = await startVaultRecovery({ clientId: newClientId(), tempPublicKey: toBase64Url(pair.publicKey) });
    await keepRecovery(account, { id: recovery.id, privateKey: pair.privateKey });
    return recovery;
  } finally {
    wipe(pair.privateKey);
  }
}

/** True when this phone holds the temporary key a recovery was started with. */
export async function isMyRecovery(account: string, recovery: Pick<VaultRecoveryResponse, 'id' | 'tempPublicKey'>): Promise<boolean> {
  const kept = await takeRecovery(account);
  try {
    return !!kept && kept.id === recovery.id && belongsTo(kept.privateKey, recovery.tempPublicKey);
  } finally {
    wipe(kept?.privateKey);
  }
}

/**
 * Two helpers have passed their shares on: the new phone opens them with its temporary private key, joins
 * them into the Vault key, opens the private key with it, and closes the recovery. The Vault is unlocked
 * afterwards. The Vault key that was rebuilt is not kept: the next step is a new one.
 */
export async function finishRecovery(account: string, recovery: VaultRecoveryResponse, onProgress?: Progress): Promise<void> {
  const kept = await takeRecovery(account);
  const shares: Uint8Array[] = [];
  let rebuilt: Uint8Array | null = null;
  try {
    if (!kept || kept.id !== recovery.id) throw new Error('this phone did not start this recovery');
    const passedOn = recovery.helpers.flatMap((helper) => (helper.resealedShare ? [helper.resealedShare] : []));
    if (passedOn.length < 2) throw new Error('two helpers have to pass their share on first');
    for (const sealed of passedOn.slice(0, 2)) shares.push(openMine(kept.privateKey, sealed, 'recovery-share'));
    rebuilt = join(shares[0]!, shares[1]!);
    let vaultKey: string;
    try {
      vaultKey = fromUtf8(rebuilt);
    } catch {
      // Shares that don't fit together give rubbish, not an error.
      throw new DoesNotOpen();
    }
    unlockVault(await unwrapPrivateKey(vaultKey, recordOf(await getVault()), onProgress));
  } finally {
    wipe(kept?.privateKey, rebuilt, ...shares);
  }
  await finishVaultRecovery(recovery.id);
  await forgetRecovery(account);
}

// ---------- a door code on a guest pass ----------

/** A new guest pass's key, sealed for its maker's own Vault, so any of their phones can build the whole link again. Needs only the maker's public key: the Vault can be locked. */
export function passKeyForMaker(vault: VaultRecordResponse | undefined): string | undefined {
  if (!vault?.setUp || !vault.publicKey) return undefined;
  const passKey = newKey();
  try {
    // While unlocked the phone knows its own public key and doesn't take the API's word for it.
    return sealFor(isVaultUnlocked() ? myPublicKey() : fromBase64Url(vault.publicKey), passKey, 'pass-key');
  } finally {
    wipe(passKey);
  }
}

/** The key of a pass this person made, for the part of its link after the #. Null when the pass has none they can open. */
export function passKeyOf(pass: Pick<GuestPassResponse, 'keyForMaker'>): string | null {
  if (!pass.keyForMaker) return null;
  const key = openMine(vaultPrivateKey(), pass.keyForMaker, 'pass-key');
  try {
    return toBase64Url(key);
  } finally {
    wipe(key);
  }
}

/** Puts a sealed card on a pass: the text sealed with the pass's key on this phone. The API gets the card and its label, never the key. */
export async function addSealedCard(pass: Pick<GuestPassResponse, 'id' | 'keyForMaker'>, card: { label: string; text: string; once: boolean; thingId?: string }): Promise<GuestPassResponse> {
  const key = passKeyOf(pass);
  if (!key) throw new Error('this pass has no key this phone can open');
  const { ciphertext } = sealForGuest(card.text, key);
  const saved = await addGuestPassCard(pass.id, { clientId: newClientId(), label: card.label, ciphertext, once: card.once, thingId: card.thingId });
  vaultUsed();
  return saved;
}

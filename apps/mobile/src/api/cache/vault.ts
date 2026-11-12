import {
  type EntrustedVaultResponse,
  getGetEmergencyQueryKey,
  getGetEntrustedVaultQueryKey,
  getGetVaultHelpersQueryKey,
  getGetVaultItemQueryKey,
  getGetVaultQueryKey,
  getGetVaultSharingQueryKey,
  type VaultEmergencyResponse,
  type VaultHelpersResponse,
  type VaultItemResponse,
  type VaultRecordResponse,
  type VaultSharingResponse,
} from '@/api/generated/homeport';

import type { CacheTools } from './tools';

/**
 * The Vault: passwords, cards, IDs, codes, and who may use them. What the app does to what it has loaded
 * when something of this place changes: one function per thing that can happen, made of `tools` (see
 * tools.ts). Screens call them through `useCache()`.
 *
 * Only what the API answers is ever written here: labels in the clear, who shares with whom, scrambled
 * pieces. Nothing a phone has opened (a password, a note, a key) goes into the data layer at all; a screen
 * keeps that in its own state while it shows it. A test (`nothingSecretIsKept`) holds this true.
 */
export const vaultCache = (tools: CacheTools) => {
  const { client, stale } = tools;
  /** Everything of a person's own Vault: the record, what needs them, people who wait, helpers, emergency access. */
  const myVault = () => stale('/v1/vault');

  return {
    /** A Vault was set up, its key was replaced, or the person said they saved it: the API sent the record back. */
    vaultRecordChanged: (record: VaultRecordResponse) => {
      client.setQueryData(getGetVaultQueryKey(), record);
      // Other people's sharing sheets list who has a Vault; the person's own lists of who can help follow too.
      return Promise.all([myVault(), stale('/v1/circles/')]);
    },

    /** An item was added to the Vault: the API sent its clear part back. */
    vaultItemMade: (item: VaultItemResponse) => {
      client.setQueryData(getGetVaultItemQueryKey(item.id), item);
      return Promise.all([tools.thingMade(item.circleId), myVault()]);
    },

    /** An item's labels or its scrambled part were saved: the API sent its clear part back. */
    vaultItemSaved: (item: VaultItemResponse) => {
      client.setQueryData(getGetVaultItemQueryKey(item.id), item);
      return Promise.all([tools.thingChanged(item), myVault()]);
    },

    /** An item was deleted. */
    vaultItemDeleted: (item: { id: string; circleId: string }) => Promise.all([tools.thingGone(item), myVault()]),

    /** An item was opened once and its key is used up, or it was handed out: where the person stands with it has changed. */
    vaultItemOpened: (item: { id: string }) => client.invalidateQueries({ queryKey: getGetVaultItemQueryKey(item.id) }),

    /** Who an item is shared with was saved, or keys were handed to people who waited: the API sent the roster back. */
    vaultItemShared: (item: { id: string; circleId: string }, sharing: VaultSharingResponse) => {
      const lists = Promise.all([tools.thingChanged(item), myVault()]);
      // The roster itself has just been read.
      client.setQueryData(getGetVaultSharingQueryKey(item.id), sharing);
      return lists;
    },

    /** Keys were handed to people who waited, for any number of items. */
    vaultKeysGiven: () => Promise.all([myVault(), stale('/v1/things/')]),

    /** Emergency access was turned on, changed, refused or switched off. */
    vaultEmergencyChanged: (emergency?: VaultEmergencyResponse) => {
      const all = myVault();
      if (emergency) client.setQueryData(getGetEmergencyQueryKey(), emergency);
      return all;
    },

    /** A helper was asked or taken off, or the key was split for them again. */
    vaultHelpersChanged: (helpers?: VaultHelpersResponse) => {
      const all = myVault();
      if (helpers) client.setQueryData(getGetVaultHelpersQueryKey(), helpers);
      return all;
    },

    /** Something the person does for someone else's Vault changed: an answer to being asked as a helper, a share passed on, a Vault asked for. */
    vaultHelpGiven: () => myVault(),

    /** A Vault this person is trusted with was asked for: the API sent back where the request stands. */
    vaultAskedFor: (entrusted: EntrustedVaultResponse) => {
      const all = myVault();
      client.setQueryData(getGetEntrustedVaultQueryKey(entrusted.id), entrusted);
      return all;
    },

    /** A recovery was started, finished or cancelled. */
    vaultRecoveryChanged: () => myVault(),
  };
};

import { answerAsk, getVaultItem, getVaultSharing } from '@/api/generated/homeport';
import { openItem, shareItem } from '@/features/vault/actions';
import { ask, ids } from '@/test/samples/activity';
import { itemPerson, noraOwns, sharing, vaultItem } from '@/test/samples/vault';

import { allowAsk, CantAllow, sendAnswer } from '../asks';

let mockUnlocked = true;
jest.mock('@/api/generated/homeport', () => ({ answerAsk: jest.fn(), getVaultItem: jest.fn(), getVaultSharing: jest.fn() }));
jest.mock('@/features/vault/actions', () => ({ openItem: jest.fn(), shareItem: jest.fn() }));
jest.mock('@/features/vault/session', () => {
  class VaultLocked extends Error {}
  return { isVaultUnlocked: () => mockUnlocked, VaultLocked };
});

const ASKED = { askId: ids.ask, thingId: ids.pin, memberId: 'm-alex', until: '2026-11-11T23:00:00Z', once: false };
const item = vaultItem({ id: ids.pin, title: 'Bank card PIN' });
/** Alex had one look and used it; Lea holds a working key. */
const alexUsedIt = itemPerson({ state: 'used', once: true });
const lea = itemPerson({ memberId: 'm-lea', name: 'Lea', access: 'use', state: 'ready', stopsAt: '2026-12-01T21:00:00Z' });
const roster = sharing({ itemId: ids.pin, people: [noraOwns, alexUsedIt, lea] });
const opened = () => ({ inside: { v: 1, title: 'Bank card PIN', site: '', category: 'code', fields: {} }, itemKey: Uint8Array.from({ length: 32 }, (_, i) => i + 1), version: 3, access: 'change', once: false, labelsChanged: false });

describe('allowing an ask to see a Vault item', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUnlocked = true;
    jest.mocked(getVaultItem).mockResolvedValue(item);
    jest.mocked(getVaultSharing).mockResolvedValue(roster);
    jest.mocked(openItem).mockImplementation(async () => opened() as never);
    jest.mocked(shareItem).mockResolvedValue(roster);
    jest.mocked(answerAsk).mockResolvedValue(ask({ state: 'allowed' }));
  });

  it("shares the item on the phone first, for as long as they asked, and only then tells the API 'allow'", async () => {
    const order: string[] = [];
    jest.mocked(shareItem).mockImplementation(async () => {
      order.push('shared');
      return roster;
    });
    jest.mocked(answerAsk).mockImplementation(async () => {
      order.push('answered');
      return ask({ state: 'allowed' });
    });
    const done = await allowAsk(ASKED);
    expect(order).toEqual(['shared', 'answered']);
    // Everyone who has it keeps exactly what they have; the asker gets it until the moment they asked for.
    expect(shareItem).toHaveBeenCalledWith(item, expect.objectContaining({ version: 3 }), roster, [
      { memberId: 'm-lea', access: 'use', once: false, stopsAt: '2026-12-01T21:00:00Z' },
      { memberId: 'm-alex', access: 'see', once: false, stopsAt: '2026-11-11T23:00:00Z' },
    ]);
    expect(answerAsk).toHaveBeenCalledWith(ids.ask, { allow: true });
    expect(done).toEqual({ ask: ask({ state: 'allowed' }), item: { id: ids.pin, circleId: 'c-linds' } });
  });

  it('shares for one look when that is what was asked for', async () => {
    await allowAsk({ ...ASKED, until: null, once: true });
    expect(jest.mocked(shareItem).mock.calls[0]?.[3]).toContainEqual({ memberId: 'm-alex', access: 'see', once: true, stopsAt: null });
  });

  it('lets go of what the phone opened, whether or not sharing worked', async () => {
    const held = opened();
    jest.mocked(openItem).mockResolvedValue(held as never);
    jest.mocked(shareItem).mockRejectedValue(new Error('the API said no'));
    await expect(allowAsk(ASKED)).rejects.toThrow('the API said no');
    expect([...held.itemKey].every((byte) => byte === 0)).toBe(true);
    expect(answerAsk).not.toHaveBeenCalled();
  });

  it('asks nothing of the API while the Vault is locked', async () => {
    mockUnlocked = false;
    await expect(allowAsk(ASKED)).rejects.toThrow();
    expect(getVaultItem).not.toHaveBeenCalled();
    expect(openItem).not.toHaveBeenCalled();
  });

  it('refuses a sample item, which was never scrambled, before opening anything', async () => {
    jest.mocked(getVaultItem).mockResolvedValue(vaultItem({ id: ids.pin, sample: true }));
    await expect(allowAsk(ASKED)).rejects.toEqual(new CantAllow('sample'));
    expect(openItem).not.toHaveBeenCalled();
  });

  it('refuses when the asker has no Vault to seal a key for, without spending a look at the item', async () => {
    jest.mocked(getVaultSharing).mockResolvedValue(sharing({ itemId: ids.pin, people: [noraOwns, itemPerson({ publicKey: null, missing: 'no_vault', state: 'waiting' })] }));
    const refused = await allowAsk(ASKED).catch((error: unknown) => error);
    expect(refused).toBeInstanceOf(CantAllow);
    expect((refused as CantAllow).why).toBe('no_vault');
    expect(openItem).not.toHaveBeenCalled();
    expect(answerAsk).not.toHaveBeenCalled();
  });
});

describe('the answer itself', () => {
  it('is sent as the API reads it: allow, yes or no', async () => {
    jest.mocked(answerAsk).mockResolvedValue(ask({ state: 'declined' }));
    await sendAnswer(ids.ask, false);
    expect(answerAsk).toHaveBeenCalledWith(ids.ask, { allow: false });
  });
});

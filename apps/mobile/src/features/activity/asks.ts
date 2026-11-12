import { answerAsk, type AskResponse, getVaultItem, getVaultSharing, type VaultItemPersonResponse } from '@/api/generated/homeport';
import { openItem, type ShareDraft, shareItem } from '@/features/vault/actions';
import { isVaultUnlocked, VaultLocked } from '@/features/vault/session';

/**
 * Answering an ask to see something in the Vault: what the phone does, step by step. No React in here.
 *
 * Allowing has two steps, because only the owner's phone can open a Vault item to someone (the API never
 * holds a key): first the item is shared with whoever asked, with the Vault's own code and for as long as
 * they asked for; then the API is told "allow". It refuses that until the asker can really open the item.
 */

/** What an "Allow" button of Activity carries: which question, about which item, who asked and for how long. */
export type Asked = { askId: string; thingId: string; memberId: string; until?: string | null; once?: boolean | null };

/** Why this phone can't allow an ask: the item is a sample (never scrambled), or the asker has no Vault to seal a key for. */
export class CantAllow extends Error {
  constructor(readonly why: 'sample' | 'no_vault') {
    super('CantAllow');
    this.name = 'CantAllow';
  }
}

/**
 * The owner's answer, sent as the API reads it: `{ allow }`.
 *
 * Written to fit the generated client on both sides of a rename. In the API's description this request once
 * had the same name as an answer to an event (`AnswerRequest`: going, maybe, can't), so a client made from
 * that description types it as that one; the API has since named it `AskAnswerRequest`, and a client made
 * from then on types it as what it is. So the body is typed as "whatever `answerAsk` takes" and written by
 * hand, here and only here; with the newer client the cast says nothing new and can go.
 */
export function sendAnswer(askId: string, allow: boolean): Promise<AskResponse> {
  return answerAsk(askId, { allow } as unknown as Parameters<typeof answerAsk>[1]);
}

/** True for someone the item is shared with right now: they hold a working key, or wait for one. */
const hasItNow = (person: VaultItemPersonResponse) => person.access !== null && (person.state === 'ready' || person.state === 'waiting');

/**
 * Allows an ask. The Vault has to be unlocked (`VaultLocked` otherwise, before anything is asked of the
 * API). Everyone who has the item keeps exactly what they have; the asker gets a key wrapped for them, for
 * one look or until the moment they asked for. What the phone opened on the way is let go of before this returns.
 */
export async function allowAsk(asked: Asked): Promise<{ ask: AskResponse; item: { id: string; circleId: string } }> {
  if (!isVaultUnlocked()) throw new VaultLocked();
  const item = await getVaultItem(asked.thingId);
  if (item.sample) throw new CantAllow('sample');
  const sharing = await getVaultSharing(item.id);
  const asker = sharing.people.find((person) => person.memberId === asked.memberId);
  if (!asker?.publicKey) throw new CantAllow('no_vault');

  const opened = await openItem(item);
  try {
    const others = sharing.people.filter((person) => !person.owner && !person.you && person.memberId !== asked.memberId && hasItNow(person));
    const draft: ShareDraft = [
      ...others.map((person) => ({ memberId: person.memberId, access: person.access ?? 'see', once: person.once, stopsAt: person.stopsAt })),
      // What they may do stays as it was when they had it before; someone new may see it. (Someone who may
      // change it keeps it: "one look" is for looking.)
      { memberId: asked.memberId, access: asker.access ?? 'see', once: asker.access !== 'change' && asked.once === true, stopsAt: asked.until ?? null },
    ];
    await shareItem(item, opened, sharing, draft);
  } finally {
    opened.itemKey.fill(0);
  }
  return { ask: await sendAnswer(asked.askId, true), item: { id: item.id, circleId: item.circleId } };
}

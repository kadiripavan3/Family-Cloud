import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'expo-router';

import { useCache } from '@/api/cache';
import { type Audience, jot, type JotResponse, type JotSource, moveJot, type ReadAs, undoJot } from '@/api/generated/homeport';

import { handToVault } from './heldCode';
import { phoneNow } from './phone';

/**
 * What can be done with a jot, wherever it is done from (the bar, what was filed, voice, a widget's chip,
 * the pinned note's line): file a line, undo one, move one, and send a held-back code on to the Vault. Each
 * tells the rest of the app what happened, so Today, Plan and the lists follow.
 */
export function useJotting(circleId: string) {
  const cache = useCache();
  const router = useRouter();

  /** Reads a line and files everything in it. `clientId` is made once per line, so a second press files nothing twice. */
  const file = useMutation({
    mutationFn: (line: { text: string; source: JotSource; clientId: string; audience?: Audience }) => jot(circleId, { ...phoneNow(), ...line }),
    onSuccess: (made) => void cache.jotFiled(circleId, made),
  });

  const undo = useMutation({
    mutationFn: (one: JotResponse) => undoJot(one.id),
    onSuccess: (_nothing, one) => void cache.jotUndone(circleId, one),
  });

  /** To another kind, or (for a list) to another list. This is also "it's just a note" for something held back. */
  const move = useMutation({
    mutationFn: ({ jot: one, to, listId }: { jot: JotResponse; to: ReadAs; listId?: string }) => moveJot(one.id, { to, listId, ...phoneNow() }),
    onSuccess: (after, { jot: before }) => void cache.jotMoved(circleId, before, after),
  });

  /**
   * "Keep in the Vault": the words go to the Vault's own screen in memory (never in the address), and the
   * jot is forgotten once the Vault says it has saved them.
   */
  const keepInVault = (one: JotResponse) => {
    handToVault({
      words: one.words,
      circleId,
      kept: async () => {
        await undoJot(one.id);
        await cache.jotUndone(circleId, one);
      },
    });
    router.push('/new/password');
  };

  return { file, undo, move, keepInVault };
}

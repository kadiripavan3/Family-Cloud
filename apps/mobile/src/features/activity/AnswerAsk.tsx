import { useMutation } from '@tanstack/react-query';
import { useIsFocused } from 'expo-router';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { useCache } from '@/api/cache';
import { messageFor } from '@/api/fetcher';
import { type ActivityLine, useGetVault } from '@/api/generated/homeport';
import { Locked } from '@/features/vault/Locked';
import { problemOf } from '@/features/vault/problems';
import { isVaultUnlocked, useVaultUnlocked } from '@/features/vault/session';
import { useSecretAction } from '@/features/vault/useSecretAction';
import { Working } from '@/features/vault/Working';
import { firstName } from '@/lib/names';
import { layout } from '@/theme';
import { Button } from '@/ui/Button';
import { Loading } from '@/ui/Loading';
import { Sheet } from '@/ui/Sheet';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

import { allowAsk, type Asked, CantAllow, sendAnswer } from './asks';
import { sentenceOf } from './rows';

const says = words.activity.answer;

/** A line of Activity that asks, as far as answering it needs: the question, who asked, and what "Allow" carries. */
export type Question = { lineId: string; sentence: string; note: string | null; asker: string; asked: Asked };

/** The question a line holds, when it has an "Allow" button with everything allowing needs. Null for any other line. */
export function questionOf(line: ActivityLine): Question | null {
  const allow = line.buttons?.find((button) => button.act === 'allow_ask');
  if (!allow?.askId || !allow.thingId || !allow.memberId) return null;
  return {
    lineId: line.id ?? allow.askId,
    sentence: sentenceOf(line),
    note: line.note ?? null,
    asker: firstName(line.people?.[0]?.name ?? ''),
    asked: { askId: allow.askId, thingId: allow.thingId, memberId: allow.memberId, until: allow.until, once: allow.once },
  };
}

/** The sentence for an answer that didn't go through: why this phone can't, or what the API or the Vault said. */
function problemFor(error: unknown, asker: string): string {
  if (error instanceof CantAllow) return error.why === 'sample' ? says.sample : says.noVault(asker);
  return problemOf(error);
}

/**
 * Answering an ask from Activity. `allow(question)` is the button on the line: with the Vault unlocked it
 * does its work right there (the line's button spins), and says so when done. With the Vault locked, or when
 * it didn't work, the sheet opens: it asks to unlock and then carries on by itself, or says what went wrong.
 * `choose(question)` is the line itself: the sheet with both answers, "Allow" and "Not now".
 *
 * Allowing handles keys, so it runs as a secret action and never through the data layer; only the API's own
 * answer (the ask, allowed) is handed to the cache.
 */
export function useAnswerAsk(onDone: (said: string) => void): { allow: (question: Question) => void; choose: (question: Question) => void; busyLine: string | null; sheet: ReactNode } {
  const cache = useCache();
  const allowing = useSecretAction();
  const unlocked = useVaultUnlocked();
  const inFront = useIsFocused();
  const [open, setOpen] = useState<{ question: Question; wants: 'choose' | 'allow' } | null>(null);
  const [busyLine, setBusyLine] = useState<string | null>(null);
  // The record of the person's own Vault, for the locked page inside the sheet.
  const vault = useGetVault({ query: { enabled: open !== null && !unlocked } });
  const decline = useMutation({ mutationFn: (askId: string) => sendAnswer(askId, false), onSuccess: (ask) => cache.askAnswered(ask) });
  const { run, clear } = allowing;
  const resetDecline = decline.reset;

  const close = useCallback(() => {
    setOpen(null);
    clear();
    resetDecline();
  }, [clear, resetDecline]);

  /** The two steps of allowing; true when both went through. */
  const work = useCallback(
    async (question: Question) => {
      const ok = await run(async () => {
        const { ask } = await allowAsk(question.asked);
        await cache.askAnswered(ask);
      });
      if (ok) onDone(says.allowed(question.asker));
      return ok;
    },
    [run, cache, onDone],
  );

  const allow = useCallback(
    (question: Question) => {
      if (!isVaultUnlocked()) return setOpen({ question, wants: 'allow' });
      setBusyLine(question.lineId);
      void work(question).then((ok) => {
        setBusyLine(null);
        // What went wrong is said on the sheet, with the way to try again.
        if (!ok) setOpen({ question, wants: 'choose' });
      });
    },
    [work],
  );
  const choose = useCallback((question: Question) => setOpen({ question, wants: 'choose' }), []);

  // Unlocked while the sheet waits to allow: it carries on by itself, once.
  const carried = useRef<string | null>(null);
  useEffect(() => {
    if (!open || open.wants !== 'allow' || !unlocked || carried.current === open.question.lineId) return;
    carried.current = open.question.lineId;
    void work(open.question).then((ok) => {
      carried.current = null;
      if (ok) close();
      else setOpen((now) => (now ? { ...now, wants: 'choose' } : now));
    });
  }, [open, unlocked, work, close]);

  const question = open?.question;
  const sheet = (
    // The locked page can lead to another screen (typing the Vault key): the sheet steps aside while that one
    // is in front, and is there again, carrying on by itself, when the person comes back with the Vault unlocked.
    <Sheet visible={open !== null && inFront} onClose={close} title={question?.sentence}>
      {!question ? null : allowing.busy ? (
        <View style={{ paddingHorizontal: layout.rowGutter, paddingBottom: 8 }}>
          <Working text={says.working} progress={allowing.progress} />
        </View>
      ) : open.wants === 'allow' && !unlocked ? (
        // Locked: the Vault's own locked page, with every way of unlocking it.
        <View style={{ paddingTop: 14, paddingBottom: 8 }}>
          {vault.data ? (
            vault.data.setUp ? (
              <Locked vault={vault.data} title={says.locked.title} body={says.locked.body} />
            ) : (
              <Sentence>{says.notSetUp}</Sentence>
            )
          ) : vault.isError ? (
            <Sentence danger>{messageFor(vault.error)}</Sentence>
          ) : (
            <View style={{ minHeight: 120 }}>
              <Loading offline={vault.isPaused} />
            </View>
          )}
        </View>
      ) : (
        <>
          <Sentence>{says.what(question.asker, question.note)}</Sentence>
          {allowing.error ? <Sentence danger>{problemFor(allowing.error, question.asker)}</Sentence> : null}
          {decline.isError ? <Sentence danger>{messageFor(decline.error)}</Sentence> : null}
          <View style={{ gap: 10, paddingTop: 6, paddingHorizontal: layout.rowGutter }}>
            <Button
              label={says.allow}
              size="lg"
              block
              disabled={decline.isPending}
              onPress={() => {
                clear();
                if (!isVaultUnlocked()) return setOpen({ question, wants: 'allow' });
                void work(question).then((ok) => (ok ? close() : undefined));
              }}
            />
            <Button
              label={says.decline}
              variant="soft"
              size="lg"
              block
              loading={decline.isPending}
              onPress={() =>
                decline.mutate(question.asked.askId, {
                  onSuccess: () => {
                    onDone(says.declined(question.asker));
                    close();
                  },
                })
              }
            />
          </View>
        </>
      )}
    </Sheet>
  );

  return { allow, choose, busyLine, sheet };
}

/** A sentence of the sheet. */
function Sentence({ children, danger }: { children: string; danger?: boolean }) {
  return (
    <Txt variant={danger ? 'caption' : 'callout'} color={danger ? 'danger' : 'muted'} accessibilityLiveRegion={danger ? 'polite' : undefined} style={{ paddingHorizontal: layout.gutter, paddingBottom: 10 }}>
      {children}
    </Txt>
  );
}

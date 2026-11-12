import { useQueryClient } from '@tanstack/react-query';
import { createContext, type ReactNode, use, useEffect, useMemo, useSyncExternalStore } from 'react';

import { cacheFor } from '@/api/cache';
import { onAnswer } from '@/api/fetcher';
import { type ChecklistResponse, type PageResponse, useGetMe } from '@/api/generated/homeport';
import { useOnline } from '@/api/online';

import { ChangesEngine } from './engine';
import { changeStore } from './store';
import type { Change, ChangeInput, ChangeStore, QueueView, Target } from './types';

const EngineContext = createContext<ChangesEngine | null | undefined>(undefined);

const nothing = () => () => {};
const NOTHING: QueueView = { changes: [], sending: false, held: false, stuck: null, aliases: {}, notices: [] };

/**
 * 13.2 Offline: what a person changes on a list or a page (a tick, a new line, a block) is put in line here
 * and shown at once. It goes to the API in the order it was made, a moment later when there is a connection,
 * and whenever the connection is back when there wasn't: also after the app was closed in between. The work
 * itself is `ChangesEngine`; this starts it for whoever is signed in, tells it about the connection, and
 * lets screens see what waits (`useWaiting`) and add to it (`useChanges`).
 *
 * It wraps every signed-in screen (`app/(app)/_layout.tsx`), so what was ticked in a list keeps going up
 * after the list was closed.
 */
export function ChangesProvider({ children, store = changeStore }: { children: ReactNode; store?: ChangeStore }) {
  const client = useQueryClient();
  const owner = useGetMe().data?.id;
  const online = useOnline();
  const engine = useMemo(
    () =>
      owner
        ? new ChangesEngine({
            store,
            owner,
            // The API sends the list or the page back as it stands with the changes in: that is what every screen shows next.
            onSent: (target, now) => {
              const cache = cacheFor(client);
              if (target.kind === 'checklist') void cache.listSent(target.id, now as ChecklistResponse | undefined).catch(() => undefined);
              else void cache.pageSent(target.id, now as PageResponse | undefined).catch(() => undefined);
            },
          })
        : null,
    [owner, store, client],
  );

  useEffect(() => {
    if (!engine) return;
    engine.start();
    // What was waiting for a list or a page that has just been deleted goes with it, whichever screen asked
    // for the deletion; and nothing of a deleted account stays on the phone.
    const stopHearing = onAnswer((method, path) => {
      if (method !== 'DELETE') return;
      const thing = /^\/v1\/things\/([^/?]+)$/.exec(path);
      if (thing?.[1]) engine.forget(thing[1]);
      else if (path === '/v1/me') void engine.discardEverything();
    });
    return () => {
      stopHearing();
      engine.stop();
    };
  }, [engine]);

  useEffect(() => engine?.setOnline(online), [engine, online]);

  return <EngineContext value={engine}>{children}</EngineContext>;
}

function useEngine(): ChangesEngine | null {
  const engine = use(EngineContext);
  if (engine === undefined) throw new Error('The queue of changes is used outside ChangesProvider.');
  return engine;
}

/**
 * What waits for one list or page: its changes in order, whether they are held back for now, what came back
 * as "gone" or "refused". The same object until something about that queue changes.
 */
export function useWaiting(target: Target | null): QueueView {
  const engine = useEngine();
  return useSyncExternalStore(engine?.subscribe ?? nothing, () => (engine && target ? engine.viewOf(target) : NOTHING));
}

type Changes = {
  /** Puts a change in line: it shows at once and is sent as soon as it can be. */
  add: (input: ChangeInput) => Change | null;
  /** Tries a queue again now. */
  retry: (target: Target) => void;
  /** Lets go of what waits for one list or page. */
  discard: (target: Target) => void;
  /** The person has read what came back as "gone" or "refused". */
  dismiss: (target: Target) => void;
};

/** How a screen changes a list or a page: never by calling the API itself, always through the queue. */
export function useChanges(): Changes {
  const engine = useEngine();
  return useMemo<Changes>(
    () => ({
      add: (input) => engine?.add(input) ?? null,
      retry: (target) => engine?.retry(target),
      discard: (target) => engine?.discard(target),
      dismiss: (target) => engine?.dismiss(target),
    }),
    [engine],
  );
}

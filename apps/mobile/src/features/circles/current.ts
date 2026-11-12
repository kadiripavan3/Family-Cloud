import { useEffect, useSyncExternalStore } from 'react';

import { type CircleResponse, useGetCircles } from '@/api/generated/homeport';
import { keep } from '@/lib/keep';

/**
 * The current circle. A person is in up to twenty circles and looks at one at a time: Home, People, search
 * and the + button all mean that one. Which one it is, is remembered on the phone for each account, and it
 * is the first circle until the person picks another.
 *
 * Every place reads it with `useCircle()`. Inside the signed-in app there always is one: someone without a
 * circle is sent to set one up before any of these screens is drawn (`app/(app)/_layout.tsx`).
 */

const key = (account: string) => `homeport.circle.${account}`;

type Chosen = {
  /** Whose choice this is. Null while nobody is signed in. */
  account: string | null;
  /** The circle they picked, or null for "the first one". */
  circleId: string | null;
  /** True once the phone has been asked what was picked last time. */
  known: boolean;
};

let chosen: Chosen = { account: null, circleId: null, known: true };
const listeners = new Set<() => void>();

function set(next: Chosen) {
  chosen = next;
  for (const listener of listeners) listener();
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
const read = () => chosen;

/**
 * Says who is signed in, so their own last circle is the current one. Called by the root layout whenever
 * that changes; the app waits to open until the phone has answered.
 */
export async function chosenCircleFor(account: string | null): Promise<void> {
  if (chosen.account === account && chosen.known) return;
  set({ account, circleId: null, known: account === null });
  if (account === null) return;
  const circleId = await keep.get(key(account));
  // Someone else signed in while the phone was answering: their answer is on its way.
  if (chosen.account === account) set({ account, circleId, known: true });
}

/** Makes another circle the current one, and remembers it on this phone. For places outside React; screens use `useSwitchCircle()`. */
export function switchCircle(circleId: string): void {
  if (chosen.circleId === circleId) return;
  set({ ...chosen, circleId });
  if (chosen.account) void keep.set(key(chosen.account), circleId);
}

/** For the root layout: follows who is signed in, and says whether their last circle is known yet. */
export function useChosenCircleKnown(account: string | null): boolean {
  const state = useSyncExternalStore(subscribe, read, read);
  useEffect(() => {
    void chosenCircleFor(account);
  }, [account]);
  return state.known && state.account === account;
}

/**
 * Every circle the person is in, in the order they joined them, each with its people. Empty until they are
 * loaded, which inside the signed-in app they always are.
 */
export function useCircles(): CircleResponse[] {
  return useGetCircles().data ?? NONE;
}
const NONE: CircleResponse[] = [];

/** Which of these circles is the current one: the one that was picked, if the person is still in it, else the first. */
export function currentOf(circles: readonly CircleResponse[], circleId: string | null): CircleResponse | undefined {
  return circles.find((circle) => circle.id === circleId) ?? circles[0];
}

/** The current circle, or undefined for someone who is in none. For the few screens that are shown to people without a circle. */
export function useCircleIfAny(): CircleResponse | undefined {
  const circles = useCircles();
  const { circleId } = useSyncExternalStore(subscribe, read, read);
  return currentOf(circles, circleId);
}

/** The current circle: the one Home, People, search and the + button are about. */
export function useCircle(): CircleResponse {
  const circle = useCircleIfAny();
  if (!circle) throw new Error('useCircle() was called for someone who is in no circle. Screens under app/(app) are only drawn once there is one; elsewhere use useCircleIfAny().');
  return circle;
}

/** How a screen makes another circle the current one: `const switchTo = useSwitchCircle(); switchTo(circle.id)`. */
export function useSwitchCircle(): (circleId: string) => void {
  return switchCircle;
}

/** For tests: forgets who is signed in and what they picked. */
export function resetChosenCircle(): void {
  set({ account: null, circleId: null, known: true });
}

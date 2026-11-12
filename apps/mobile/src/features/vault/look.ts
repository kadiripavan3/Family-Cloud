import type { VaultCategory } from '@/api/generated/homeport';

/** The six drawers, in the order they are drawn. */
export const DRAWERS: readonly VaultCategory[] = ['login', 'card', 'id', 'wifi', 'code', 'secret'];

export function isDrawer(value: unknown): value is VaultCategory {
  return typeof value === 'string' && (DRAWERS as readonly string[]).includes(value);
}

/**
 * For what other people change while this phone isn't looking (a helper said yes, the trusted person asked,
 * an owner took something back): every visit to the screen asks again, however lately it was loaded.
 */
export const ASK_EACH_VISIT = { refetchOnMount: 'always' } as const;

/** The shortest a passcode for this phone or browser may be. */
export const PASSCODE_MIN = 8;

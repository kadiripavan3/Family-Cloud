import type { VaultCategory } from '@/api/generated/homeport';

/** The six drawers, in the order they are drawn. */
export const DRAWERS: readonly VaultCategory[] = ['login', 'card', 'id', 'wifi', 'code', 'secret'];

export function isDrawer(value: unknown): value is VaultCategory {
  return typeof value === 'string' && (DRAWERS as readonly string[]).includes(value);
}

/** The shortest a passcode for this phone or browser may be. */
export const PASSCODE_MIN = 8;

import type { Href } from 'expo-router';

import type { SheetResponse } from '@/api/generated/homeport';

/** The address of the formula builder for a tab: for a tile or a column that is there, or for a new one. */
export function formulaHref(sheet: SheetResponse, what: { tile?: string; column?: string; as?: 'tile' | 'column'; name?: string }): Href {
  return { pathname: '/money/formula', params: { sheet: sheet.id, tab: sheet.tab.id, ...what } };
}

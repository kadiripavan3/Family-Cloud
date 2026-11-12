import { type BillResponse, getGetBillQueryKey, getGetSplitQueryKey, type RowChangedResponse, type SheetResponse, type SplitResponse } from '@/api/generated/homeport';

import type { Query } from '@tanstack/react-query';

import type { CacheTools } from './tools';

/** As much of a bill or a split as a change needs to say where it happened. */
type Where = { id: string; circleId: string };
/** The same for a sheet. A row's card doesn't always know the circle its sheet is in. */
type WhichSheet = { id: string; circleId?: string | null };

/**
 * Money: bills, sheets, splits. What the app does to what it has loaded when something of this place changes: one function
 * per thing that can happen, made of `tools` (see tools.ts). Screens call them through `useCache()`.
 */
export const moneyCache = (tools: CacheTools) => {
  const { client, stale } = tools;
  /** Everything a circle lists about its money (Money's first page, the bills, the sheets, the splits), and Today, which shows what is due. */
  const listsOf = (circleId: string) => stale(`/v1/circles/${circleId}/`);
  /** The lists that show a sheet: its own circle's when that is known, and otherwise every circle's that is loaded. */
  const listsOfSheet = (sheet: WhichSheet) => (sheet.circleId ? listsOf(sheet.circleId) : stale('/v1/circles/'));

  return {
    // ---------- bills ----------

    /** A bill was added: the API sent it back. It is ready to open, and every list of the circle is asked for again. */
    billMade: (bill: BillResponse) => {
      client.setQueryData(getGetBillQueryKey(bill.id), bill);
      return tools.thingMade(bill.circleId);
    },

    /** A bill changed (a share paid or taken back, its amount, how it comes round): the API sent it back. Only the lists that show it are asked for again. */
    billSaved: (bill: BillResponse) => {
      client.setQueryData(getGetBillQueryKey(bill.id), bill);
      return Promise.all([listsOf(bill.circleId), stale('/v1/members/', `/v1/things/${bill.id}`)]);
    },

    /** Something was linked to a bill (the scan of its letter): the bill and what it is linked to are asked for again. */
    billLinked: (bill: Where) => Promise.all([stale(`/v1/bills/${bill.id}`, `/v1/things/${bill.id}`), tools.thingMade(bill.circleId)]),

    // ---------- sheets ----------

    /** A sheet was started (blank, from a template, or kept from the loan planner): the lists of its circle are asked for again. */
    sheetMade: (sheet: SheetResponse) => tools.thingMade(sheet.circleId),

    /**
     * Cells of a row were changed, or a row was added: the API sent the row back with the tiles and the row
     * of totals worked out again. They are written into every loaded copy of that tab at once, so the totals
     * move without waiting; then the sheet, its rows as cards and the lists that show its first tile are asked
     * for again.
     */
    sheetRowSaved: (sheet: WhichSheet, tabId: string, changed: RowChangedResponse) => {
      for (const query of client.getQueryCache().findAll({ predicate: (one) => one.queryKey[0] === `/v1/sheets/${sheet.id}` })) {
        const loaded = query.state.data as SheetResponse | undefined;
        if (!loaded || loaded.tab.id !== tabId) continue;
        const known = loaded.tab.rows.some((row) => row.id === changed.row.id);
        const before = changed.row.number - 1;
        // A new row goes where its number says, when the rows loaded so far reach that far.
        const rows = known ? loaded.tab.rows.map((row) => (row.id === changed.row.id ? changed.row : row)) : loaded.tab.rows.length >= before ? [...loaded.tab.rows.slice(0, before), changed.row, ...loaded.tab.rows.slice(before)] : loaded.tab.rows;
        const next: SheetResponse = {
          ...loaded,
          tabs: loaded.tabs.map((tab) => (tab.id === tabId ? { ...tab, rows: changed.rowCount } : tab)),
          tab: { ...loaded.tab, rows, rowCount: changed.rowCount, tiles: changed.tiles, columns: loaded.tab.columns.map((column) => ({ ...column, total: changed.totals[column.id] ?? column.total })) },
        };
        query.setState({ data: next });
      }
      return Promise.all([stale(`/v1/sheets/${sheet.id}`, '/v1/sheet-rows/'), listsOfSheet(sheet)]);
    },

    /** Anything else about a sheet changed (its name, a tab, a column, a tile, a row removed, a paper): it is asked for again, with its rows as cards, what a formula can be built from, and the lists that show it. */
    sheetChanged: (sheet: WhichSheet) => Promise.all([stale(`/v1/sheets/${sheet.id}`, '/v1/sheet-rows/', '/v1/sheet-tabs/', `/v1/things/${sheet.id}`), listsOfSheet(sheet)]),

    /**
     * A tab was removed. Everything else about the sheet is asked for again, but not the tab that is gone: the
     * screen is on its way to another tab, and asking for the removed one would only be answered "not there".
     */
    sheetTabRemoved: (sheet: WhichSheet, tabId: string) => {
      const ofSheet = (query: Query) => query.queryKey.some((part) => typeof part === 'string' && part.startsWith(`/v1/sheets/${sheet.id}`));
      const ofTab = (query: Query) => query.queryKey.some((part) => typeof part === 'object' && part !== null && (part as { tab?: unknown }).tab === tabId);
      return Promise.all([client.invalidateQueries({ predicate: (query) => ofSheet(query) && !ofTab(query) }), stale('/v1/sheet-rows/', '/v1/sheet-tabs/'), listsOfSheet(sheet)]);
    },

    // ---------- splitting costs ----------

    /** A split was started or renamed: the API sent it back. */
    splitSaved: (split: SplitResponse) => {
      client.setQueryData(getGetSplitQueryKey(split.id), split);
      return Promise.all([listsOf(split.circleId), stale(`/v1/things/${split.id}`)]);
    },

    /** An expense or a payment was added, changed or taken back: where everyone stands is asked for again, and so is what Money says about who owes whom. */
    splitChanged: (split: Where) => Promise.all([stale(`/v1/splits/${split.id}`), listsOf(split.circleId)]),
  };
};

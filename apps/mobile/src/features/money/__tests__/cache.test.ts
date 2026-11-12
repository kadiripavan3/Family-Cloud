import { cacheFor } from '@/api/cache';
import { newClient } from '@/test/phone';
import { alexBrief, bill, cell, rowChanged, sheet, SHEET_ID, sheetRow, split, tiles } from '@/test/samples/money';

const stale = (client: ReturnType<typeof newClient>, key: unknown[]) => client.getQueryState(key)?.isInvalidated;
const DAY = { day: '2026-11-12' };

/** A phone that has loaded Money, a sheet (two of its tabs) and a few things beside them. */
function loadedEverywhere() {
  const client = newClient();
  client.setQueryData(['/v1/circles/c-linds/money', DAY], { dueSoon: [] });
  client.setQueryData(['/v1/circles/c-linds/today', DAY], { items: [] });
  client.setQueryData(['infinite', '/v1/circles/c-linds/bills', { show: 'due' }], { pages: [], pageParams: [] });
  client.setQueryData(['infinite', '/v1/circles/c-linds/sheets'], { pages: [], pageParams: [] });
  client.setQueryData(['/v1/circles/c-crew/money', DAY], { dueSoon: [] });
  client.setQueryData([`/v1/sheets/${SHEET_ID}`, { tab: undefined, limit: 100, ...DAY }], sheet());
  client.setQueryData([`/v1/sheets/${SHEET_ID}`, { tab: 'tab-savings', limit: 100, ...DAY }], sheet({ tab: { ...sheet().tab, id: 'tab-savings', name: 'Savings' } }));
  client.setQueryData(['/v1/sheet-rows/row-3', DAY], { row: {} });
  client.setQueryData(['/v1/sheet-tabs/tab-budget/formula', ''], { columns: [] });
  client.setQueryData(['/v1/me/settings'], {});
  return client;
}

describe('what Money does with loaded data after a change', () => {
  it('shows a bill that was just paid at once, and asks again for the lists that show it', async () => {
    const client = loadedEverywhere();
    const paid = bill({ paid: true });
    client.setQueryData([`/v1/bills/${paid.id}`], bill());
    await cacheFor(client).billSaved(paid);
    expect(client.getQueryData([`/v1/bills/${paid.id}`])).toEqual(paid);
    expect(stale(client, [`/v1/bills/${paid.id}`])).toBe(false);
    expect(stale(client, ['/v1/circles/c-linds/money', DAY])).toBe(true);
    expect(stale(client, ['/v1/circles/c-linds/today', DAY])).toBe(true);
    expect(stale(client, ['infinite', '/v1/circles/c-linds/bills', { show: 'due' }])).toBe(true);
    // Another circle's money, and what has nothing to do with bills, are left alone.
    expect(stale(client, ['/v1/circles/c-crew/money', DAY])).toBe(false);
    expect(stale(client, ['/v1/me/settings'])).toBe(false);
  });

  it('has a new bill ready to open, and asks again for every list of its circle', async () => {
    const client = loadedEverywhere();
    const made = bill();
    await cacheFor(client).billMade(made);
    expect(client.getQueryData([`/v1/bills/${made.id}`])).toEqual(made);
    expect(stale(client, ['/v1/circles/c-linds/money', DAY])).toBe(true);
    await cacheFor(client).billLinked(made);
    expect(stale(client, [`/v1/bills/${made.id}`])).toBe(true);
  });

  it('moves the totals of a tab the moment a cell is saved, in every loaded copy of that tab', async () => {
    const client = loadedEverywhere();
    const ticked = sheetRow(3, 'Cabins, 9 nights', [alexBrief], 235000, true);
    const moved = [tiles[0]!, { ...tiles[1]!, cell: cell.money(485000) }, { ...tiles[2]!, cell: cell.money(279000) }];
    const total = { ...sheet().tab.columns[3]!.total!, cell: cell.number(3) };
    await cacheFor(client).sheetRowSaved({ id: SHEET_ID, circleId: 'c-linds' }, 'tab-budget', rowChanged(ticked, { tiles: moved, totals: { 'col-paid': total } }));
    const now = client.getQueryData<ReturnType<typeof sheet>>([`/v1/sheets/${SHEET_ID}`, { tab: undefined, limit: 100, ...DAY }])!;
    expect(now.tab.rows[2]!.cells['col-paid']!.ticked).toBe(true);
    expect(now.tab.tiles[2]!.cell.cents).toBe(279000);
    expect(now.tab.columns[3]!.total!.cell.number).toBe(3);
    // A column whose total didn't come back keeps the one it had.
    expect(now.tab.columns[2]!.total!.cell.cents).toBe(764000);
    // Another tab of the same sheet is not written over, only asked for again.
    const other = client.getQueryData<ReturnType<typeof sheet>>([`/v1/sheets/${SHEET_ID}`, { tab: 'tab-savings', limit: 100, ...DAY }])!;
    expect(other.tab.tiles[2]!.cell.cents).toBe(514000);
    expect(stale(client, [`/v1/sheets/${SHEET_ID}`, { tab: 'tab-savings', limit: 100, ...DAY }])).toBe(true);
    expect(stale(client, ['/v1/sheet-rows/row-3', DAY])).toBe(true);
    expect(stale(client, ['infinite', '/v1/circles/c-linds/sheets'])).toBe(true);
    expect(stale(client, ['/v1/circles/c-crew/money', DAY])).toBe(false);
  });

  it('puts a new row where its number says, and counts it', async () => {
    const client = loadedEverywhere();
    const added = sheetRow(7, 'Souvenirs', [], 9000, false);
    await cacheFor(client).sheetRowSaved({ id: SHEET_ID, circleId: 'c-linds' }, 'tab-budget', rowChanged(added, { rowCount: 7 }));
    const now = client.getQueryData<ReturnType<typeof sheet>>([`/v1/sheets/${SHEET_ID}`, { tab: undefined, limit: 100, ...DAY }])!;
    expect(now.tab.rows.map((row) => row.number)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(now.tab.rowCount).toBe(7);
    expect(now.tabs[0]!.rows).toBe(7);
  });

  it("asks every circle's lists again when a row's card doesn't know which circle its sheet is in", async () => {
    const client = loadedEverywhere();
    await cacheFor(client).sheetRowSaved({ id: SHEET_ID, circleId: null }, 'tab-budget', rowChanged(sheetRow(1, 'Flights', [alexBrief], 150000, true)));
    expect(stale(client, ['infinite', '/v1/circles/c-linds/sheets'])).toBe(true);
    expect(stale(client, ['/v1/circles/c-crew/money', DAY])).toBe(true);
    expect(stale(client, ['/v1/me/settings'])).toBe(false);
  });

  it('asks for a sheet again when a column, a tile or a tab changed, with what a formula can be built from', async () => {
    const client = loadedEverywhere();
    await cacheFor(client).sheetChanged({ id: SHEET_ID, circleId: 'c-linds' });
    expect(stale(client, [`/v1/sheets/${SHEET_ID}`, { tab: undefined, limit: 100, ...DAY }])).toBe(true);
    expect(stale(client, ['/v1/sheet-tabs/tab-budget/formula', ''])).toBe(true);
    expect(stale(client, ['/v1/sheet-rows/row-3', DAY])).toBe(true);
    expect(stale(client, ['infinite', '/v1/circles/c-linds/sheets'])).toBe(true);
  });

  it("doesn't ask for a tab that was just removed", async () => {
    const client = loadedEverywhere();
    await cacheFor(client).sheetTabRemoved({ id: SHEET_ID, circleId: 'c-linds' }, 'tab-savings');
    expect(stale(client, [`/v1/sheets/${SHEET_ID}`, { tab: 'tab-savings', limit: 100, ...DAY }])).toBe(false);
    expect(stale(client, [`/v1/sheets/${SHEET_ID}`, { tab: undefined, limit: 100, ...DAY }])).toBe(true);
    expect(stale(client, ['infinite', '/v1/circles/c-linds/sheets'])).toBe(true);
  });

  it('keeps a split the API sent back, and asks again for where everyone stands after an expense or a payment', async () => {
    const client = loadedEverywhere();
    const renamed = split({ title: 'Lisbon 2026' });
    client.setQueryData([`/v1/splits/${renamed.id}`], split());
    await cacheFor(client).splitSaved(renamed);
    expect(client.getQueryData([`/v1/splits/${renamed.id}`])).toEqual(renamed);
    expect(stale(client, [`/v1/splits/${renamed.id}`])).toBe(false);
    expect(stale(client, ['/v1/circles/c-crew/money', DAY])).toBe(true);
    await cacheFor(client).splitChanged(renamed);
    expect(stale(client, [`/v1/splits/${renamed.id}`])).toBe(true);
    expect(stale(client, ['/v1/circles/c-linds/money', DAY])).toBe(false);
  });
});

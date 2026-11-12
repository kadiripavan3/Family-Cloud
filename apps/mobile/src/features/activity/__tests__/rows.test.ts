import { activityPage, askLine, dueLine, listLine, NOW, oldLine, passLine, photosLine, wheelLine } from '@/test/samples/activity';

import { freshIds, rowsOf, sentenceOf } from '../rows';

const asked = (...pages: ReturnType<typeof activityPage>[]) => ({ pages, pageParams: pages.map(() => undefined) });
const keys = (rows: ReturnType<typeof rowsOf>) => rows.map((row) => row.key);

describe("the rows of Activity's list", () => {
  it('lays the lines under Today and Earlier this week, with what is due after what is new today', () => {
    expect(keys(rowsOf(asked(activityPage()), new Set(), NOW))).toEqual(['label-today', 'line-ask', 'line-photos', dueLine.id, 'line-wheel', 'label-week', 'line-pass', 'line-list']);
  });

  it('puts what is due first on a day with nothing new, and last when everything is', () => {
    const quiet = activityPage({ items: [wheelLine] });
    expect(keys(rowsOf(asked(quiet), new Set(), NOW))).toEqual(['label-today', dueLine.id, 'line-wheel']);
    const lively = activityPage({ items: [askLine, photosLine] });
    expect(keys(rowsOf(asked(lively), new Set(), NOW))).toEqual(['label-today', 'line-ask', 'line-photos', dueLine.id]);
  });

  it('shows Today for what is due alone, and no label over nothing', () => {
    expect(keys(rowsOf(asked(activityPage({ items: [] })), new Set(), NOW))).toEqual(['label-today', dueLine.id]);
    expect(rowsOf(asked(activityPage({ items: [], due: [] })), new Set(), NOW)).toEqual([]);
    expect(rowsOf(undefined)).toEqual([]);
  });

  it('puts older lines under Earlier, and takes what is due from the first page only', () => {
    const second = activityPage({ items: [oldLine], due: [{ ...dueLine, id: 'due:again' }] });
    const rows = rowsOf(asked(activityPage(), second), new Set(), NOW);
    expect(keys(rows).slice(-2)).toEqual(['label-earlier', 'line-old']);
    expect(keys(rows)).not.toContain('due:again');
  });

  it('shows a line once when it arrives on two pages', () => {
    const rows = rowsOf(asked(activityPage({ items: [askLine, photosLine] }), activityPage({ items: [photosLine, passLine], due: [] })), new Set(), NOW);
    expect(keys(rows).filter((key) => key === 'line-photos')).toHaveLength(1);
  });

  it('keeps the highlight of what was new when the tab was opened, though the API now calls it seen', () => {
    const seen = activityPage({ items: [{ ...askLine, fresh: false }, { ...photosLine, fresh: false }, listLine], fresh: 0 });
    const fresh = (rows: ReturnType<typeof rowsOf>) => rows.flatMap((row) => (row.type === 'line' && row.fresh ? [row.key] : []));
    expect(fresh(rowsOf(asked(seen), new Set(), NOW))).toEqual([]);
    expect(fresh(rowsOf(asked(seen), new Set(['line-ask', 'line-photos']), NOW))).toEqual(['line-ask', 'line-photos']);
  });
});

describe('what a line says', () => {
  it('reads its sentence as plain words', () => {
    expect(sentenceOf(askLine)).toBe('Alex asks to see Bank card PIN in the Vault');
    expect(sentenceOf({})).toBe('');
  });

  it('names the new lines as one piece of text, the same for the same lines', () => {
    expect(freshIds(asked(activityPage()))).toBe('line-ask,line-photos');
    expect(freshIds(asked(activityPage({ items: [wheelLine] })))).toBe('');
    expect(freshIds(undefined)).toBe('');
  });
});

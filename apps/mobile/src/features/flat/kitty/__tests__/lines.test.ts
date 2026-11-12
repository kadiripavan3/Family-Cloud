import { kittyLine, kittyView } from '@/test/samples/flat';

import { potRows } from '../lines';

describe("the kitty's rows", () => {
  it("draws each purchase as a row and a month's paying in as one", () => {
    const rows = potRows(kittyView().lines);
    expect(rows.map((row) => row.kind)).toEqual(['out', 'out', 'in']);
    const paidIn = rows[2]!;
    expect(paidIn).toMatchObject({ kind: 'in', title: 'Paid in for November', cents: 2000 });
    expect(paidIn.kind === 'in' ? paidIn.lines.map((line) => line.id) : []).toEqual(['line-in-lea', 'line-in-kai']);
  });

  it('keeps two months apart, each where its newest line stands', () => {
    const rows = potRows([
      kittyLine({ id: 'in-dec', kind: 'in', title: 'Paid in for December', cents: 1000 }),
      kittyLine({ id: 'out-1' }),
      kittyLine({ id: 'in-nov-1', kind: 'in', title: 'Paid in for November', cents: 1000 }),
      kittyLine({ id: 'in-dec-2', kind: 'in', title: 'Paid in for December', cents: 500 }),
    ]);
    expect(rows.map((row) => row.id)).toEqual(['in-dec', 'out-1', 'in-nov-1']);
    expect(rows[0]).toMatchObject({ cents: 1500 });
  });

  it('has nothing to draw for an empty month', () => {
    expect(potRows([])).toEqual([]);
  });
});

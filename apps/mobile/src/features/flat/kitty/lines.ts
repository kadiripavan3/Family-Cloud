import type { KittyLineResponse } from '@/api/generated/homeport';

/** One row under "In and out": something that was bought, or everyone's paying in for one month together. */
export type PotRow = { kind: 'out'; id: string; line: KittyLineResponse } | { kind: 'in'; id: string; title: string; cents: number; lines: KittyLineResponse[] };

/**
 * The month's lines as the page draws them. Each purchase is a row of its own; what was paid in for one
 * month is one row ("Paid in for November · You and Lea · +€20.00"), standing where the newest of it is.
 */
export function potRows(lines: readonly KittyLineResponse[]): PotRow[] {
  const rows: PotRow[] = [];
  for (const line of lines) {
    if (line.kind !== 'in') {
      rows.push({ kind: 'out', id: line.id, line });
      continue;
    }
    const together = rows.find((row) => row.kind === 'in' && row.title === line.title);
    if (together && together.kind === 'in') {
      together.lines.push(line);
      together.cents += line.cents;
    } else {
      rows.push({ kind: 'in', id: line.id, title: line.title, cents: line.cents, lines: [line] });
    }
  }
  return rows;
}

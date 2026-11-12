/**
 * What a person types for an amount ("45", "4.50", "4,5", "€ 12") as whole cents. Null for nothing typed;
 * undefined when it can't be read as an amount.
 */
export function centsFrom(typed: string): number | null | undefined {
  const text = typed.replace(/[^\d.,-]/g, '').replace(',', '.');
  if (text === '') return typed.trim() === '' ? null : undefined;
  if (!/^\d{1,9}(\.\d{0,2})?$/.test(text)) return undefined;
  return Math.round(Number(text) * 100);
}

/** Cents as they are typed into the box again: 4500 is "45", 4550 is "45.50". */
export function typedFrom(cents: number | null): string {
  if (cents === null) return '';
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
}

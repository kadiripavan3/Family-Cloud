import { Calendar, Check, Coins, Euro, Hash, ListChecks, type LucideIcon, Sigma, TriangleAlert, Type, User } from 'lucide-react-native';
import { View } from 'react-native';

import type { CellResponse, ColumnKind, ColumnResponse, PersonBrief } from '@/api/generated/homeport';
import { formatDay } from '@/lib/dates';
import { formatAmount, formatMoney, formatMoneyExact, formatMoneyRound } from '@/lib/money';
import { firstName } from '@/lib/names';
import { radius, useTheme } from '@/theme';
import { Avatar } from '@/ui/Avatar';
import { Txt } from '@/ui/Txt';
import { locale, words } from '@/words';

import { FIGURES } from '../parts';

/** A plain number as people read it: 1480 is "1,480", 12.5 stays "12.5". */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 6 }).format(value);
}

/**
 * A cell in words: on a tile, in a list, for a screen reader. Money carries its currency: whole when it is
 * whole ("€7,640"), or always with its cents when `exact` (an answer, a box to check).
 */
export function cellText(cell: CellResponse | null | undefined, currency: string, exact = false): string {
  if (!cell) return '';
  switch (cell.kind) {
    case 'money':
      return cell.cents === null ? '' : exact ? formatMoneyExact(cell.cents, currency) : formatMoney(cell.cents, currency);
    case 'number':
      return cell.number === null ? '' : formatNumber(cell.number);
    case 'text':
      return cell.text ?? '';
    case 'date':
      return cell.date ? formatDay(cell.date) : '';
    case 'tick':
      return cell.ticked ? words.money.rowCard.ticked : words.money.rowCard.notTicked;
    case 'person':
      return words.money.sheet.names(peopleOf(cell).map((person) => firstName(person.name)));
    case 'problem':
      return cell.problem ?? words.money.sheet.cantWorkOut;
    default:
      return '';
  }
}

/**
 * A cell on a tile or at the end of a row in a list, where there is little room: money from a thousand up is
 * written without its cents ("€67,687"), everything else as `cellText` writes it. The cell itself keeps
 * every cent; a screen reader is told the whole amount.
 */
export function cellHeadline(cell: CellResponse | null | undefined, currency: string): string {
  if (cell?.kind === 'money' && cell.cents !== null && Math.abs(cell.cents) >= 100_000) return formatMoneyRound(cell.cents, currency);
  return cellText(cell, currency);
}

/** The people a cell holds. */
export function peopleOf(cell: CellResponse | null | undefined): PersonBrief[] {
  return (cell?.people ?? []) as PersonBrief[];
}

const ICONS: Record<ColumnKind, LucideIcon> = { text: Type, number: Hash, money: Euro, date: Calendar, tick: Check, choice: ListChecks, person: User, formula: Sigma };

/** The small icon that says what a column holds: in its header, and on the chip that picks a kind. Money in another currency than the euro gets coins. */
export function KindIcon({ kind, currency, size, color }: { kind: ColumnKind; currency: string; size: number; color: string }) {
  const Icon = kind === 'money' && currency !== 'EUR' ? Coins : ICONS[kind];
  return <Icon size={size} color={color} />;
}

/** How wide a column of each kind is drawn in the grid, at least. The first column takes what is left. */
const WIDTHS: Record<ColumnKind, number> = { text: 132, number: 84, money: 94, date: 96, tick: 50, choice: 108, person: 54, formula: 94 };
/** The widest a long name may make its column. */
const WIDEST = 190;

/**
 * How wide a column is drawn: as wide as what it holds needs, and wider when its name wouldn't fit in the
 * header beside its icon. (The name's width is a fair guess from its length; a guess that is a little short
 * only cuts the last letter at the column's edge.)
 */
export function columnWidth(column: ColumnResponse): number {
  const header = 16 + Math.ceil(column.name.length * 6.8) + (column.kind === 'tick' ? 6 : 13);
  return Math.max(WIDTHS[column.kind], Math.min(WIDEST, header));
}

/** True for a column whose values stand at the right of their cell: figures line up that way. */
export function isFigure(column: ColumnResponse): boolean {
  return column.kind === 'money' || column.kind === 'number' || column.kind === 'formula';
}

/** How many faces a cell of the grid shows before it counts the rest. */
const FACES = 2;

type Props = {
  cell: CellResponse | undefined;
  /** Bold, for the row of totals. */
  strong?: boolean;
};

/**
 * What stands in one cell of the grid, by what the cell holds: words, a figure (money without its sign, as
 * the column's header says the currency), a day, faces. A cell whose formula can't be worked out shows a
 * small warning; the row's card says why. (A tick is drawn by the grid itself: it can be pressed.)
 */
export function CellValue({ cell, strong }: Props) {
  const { colors } = useTheme();
  if (!cell || cell.kind === 'empty') return null;
  if (cell.kind === 'person') {
    const people = peopleOf(cell);
    return (
      <View accessible accessibilityLabel={words.money.sheet.names(people.map((person) => firstName(person.name)))} style={{ flexDirection: 'row', alignItems: 'center' }}>
        {people.slice(0, FACES).map((person, index) => (
          <View key={person.memberId ?? index} style={{ marginLeft: index === 0 ? 0 : -10 }}>
            <Avatar uri={person.avatarUrl} name={person.name ?? ''} size={24} />
          </View>
        ))}
        {people.length > FACES ? (
          <Txt variant="tiny" color="muted" style={{ marginLeft: 2 }}>
            {words.money.sheet.more(people.length - FACES)}
          </Txt>
        ) : null}
      </View>
    );
  }
  if (cell.kind === 'problem') {
    return (
      <View accessible accessibilityLabel={cell.problem ?? words.money.sheet.cantWorkOut}>
        <TriangleAlert size={15} color={colors.warn} />
      </View>
    );
  }
  if (cell.kind === 'tick') return <TickBox on={cell.ticked === true} />;
  const figure = cell.kind === 'money' || cell.kind === 'number';
  const text = cell.kind === 'money' ? (cell.cents === null ? '' : formatAmount(cell.cents)) : cellText(cell, '');
  return (
    <Txt variant="note" weight={strong ? 800 : 600} numberOfLines={1} style={figure ? FIGURES : undefined}>
      {text}
    </Txt>
  );
}

/** The small square of a tick column: filled with a tick when it is on. */
export function TickBox({ on }: { on: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={{ width: 20, height: 20, borderRadius: radius.chip, alignItems: 'center', justifyContent: 'center', borderWidth: on ? 0 : 2, borderColor: colors.lineStrong, backgroundColor: on ? colors.accent : 'transparent' }}>
      {on ? <Check size={12} color={colors.onAccent} strokeWidth={3} /> : null}
    </View>
  );
}

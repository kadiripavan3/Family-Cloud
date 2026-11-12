import { Plus, Sigma } from 'lucide-react-native';
import { type ReactNode, useState } from 'react';
import { Pressable, ScrollView, useWindowDimensions, View } from 'react-native';

import type { ColumnResponse, RowResponse, SheetResponse } from '@/api/generated/homeport';
import { formatAmount } from '@/lib/money';
import { useTheme } from '@/theme';
import { Tap } from '@/ui/Motion';
import { MAX_TEXT_SCALE, Txt } from '@/ui/Txt';
import { words } from '@/words';

import { FIGURES } from '../parts';
import { CellValue, cellText, columnWidth, isFigure, KindIcon, TickBox } from './cells';

/** The narrow column of row numbers. */
const NUMBER = 30;
/** The narrowest the first column may get before the others start to scroll sideways. */
const MIN_FIRST = 132;
/** How wide the first column stays once they do: as drawn. */
const PINNED_FIRST = 162;
/** The cell that adds a column, after the last one. */
const ADD = 44;

type Props = {
  sheet: SheetResponse;
  /** The rows loaded so far, in their order. */
  rows: readonly RowResponse[];
  /** Ticks that were just pressed, shown before the API has answered: by row id and column id. */
  flips: Readonly<Record<string, boolean>>;
  /** The column whose total is chosen: the bar under the grid says what it does. */
  selected: string | null;
  onSelect: (column: ColumnResponse) => void;
  onOpenRow: (row: RowResponse) => void;
  onRowMenu: (row: RowResponse) => void;
  onTick: (row: RowResponse, column: ColumnResponse, next: boolean) => void;
  onColumn: (column: ColumnResponse) => void;
  onAddColumn: () => void;
  onAddRow: () => void;
};

/** The key a pressed tick is kept under until the API has answered. */
export const flipKey = (rowId: string, columnId: string) => `${rowId}:${columnId}`;

/**
 * A sheet's grid, shaped for a phone. The row numbers and the first column stay where they are; when the
 * other columns don't fit beside them, they scroll sideways together (header, rows and the row of totals
 * as one), stopping at each column's edge. Every row opens as a card; a tick can be pressed where it stands;
 * a column's header opens the sheet that changes it. Rows are as tall as the phone's text size makes them.
 */
export function Grid({ sheet, rows, flips, selected, onSelect, onOpenRow, onRowMenu, onTick, onColumn, onAddColumn, onAddRow }: Props) {
  const { colors } = useTheme();
  const { width, fontScale } = useWindowDimensions();
  const [scrolled, setScrolled] = useState(false);
  const scale = Math.min(Math.max(fontScale, 1), MAX_TEXT_SCALE);
  const rowHeight = Math.round(42 * scale);
  const headHeight = Math.round(34 * scale);

  const columns = sheet.tab.columns;
  const first = columns[0];
  const rest = columns.slice(1);
  const canEdit = sheet.canEdit;
  const restWidth = rest.reduce((sum, column) => sum + columnWidth(column), 0) + (canEdit ? ADD : 0);
  const available = width - NUMBER;
  const fits = restWidth + MIN_FIRST <= available;
  const firstWidth = !first ? 0 : fits ? available - restWidth : Math.min(PINNED_FIRST, Math.round(available * 0.45));
  // Where the sideways scroll comes to rest: at the left edge of each column.
  const stops = rest.reduce<number[]>((edges, column) => [...edges, (edges[edges.length - 1] ?? 0) + columnWidth(column)], [0]);
  const edge = scrolled ? colors.lineStrong : colors.line;
  const hasTotals = columns.some((column) => column.total);

  const pinned = (
    <View style={{ width: NUMBER + firstWidth }}>
      <View style={{ flexDirection: 'row' }}>
        <NumberCell height={headHeight} />
        {first ? (
          <Tap accessibilityRole="button" accessibilityLabel={(canEdit ? words.money.sheet.column : words.money.sheet.columnQuiet)(first.name, words.money.sheet.kinds[first.kind].name)} disabled={!canEdit} onPress={() => onColumn(first)} scaleTo={1}>
            <Cell width={firstWidth} height={headHeight} tone="head" edge={edge} tight>
              <Head column={first} currency={sheet.currency} />
            </Cell>
          </Tap>
        ) : null}
      </View>
      {rows.map((row) => {
        const text = first ? cellText(row.cells[first.id], sheet.currency) : '';
        return (
          <View key={row.id} style={{ flexDirection: 'row' }}>
            <Tap accessibilityRole="button" accessibilityLabel={words.money.sheet.rowNumber(row.number)} disabled={!canEdit} onPress={() => onRowMenu(row)} scaleTo={1}>
              <NumberCell height={rowHeight}>
                <Txt variant="tiny" color="muted" style={FIGURES}>
                  {row.number}
                </Txt>
              </NumberCell>
            </Tap>
            {first ? (
              <Tap accessibilityRole="button" accessibilityLabel={words.money.sheet.row(row.number, text)} onPress={() => onOpenRow(row)} scaleTo={1}>
                <Cell width={firstWidth} height={rowHeight} edge={edge} align={first.kind === 'tick' ? 'center' : isFigure(first) ? 'flex-end' : 'flex-start'}>
                  <CellValue cell={row.cells[first.id]} />
                </Cell>
              </Tap>
            ) : null}
          </View>
        );
      })}
      {canEdit ? (
        <Tap accessibilityRole="button" accessibilityLabel={words.money.sheet.addRow} onPress={onAddRow} scaleTo={1} style={{ flexDirection: 'row' }}>
          <NumberCell height={rowHeight}>
            <Plus size={14} color={colors.muted} />
          </NumberCell>
          {first ? (
            <Cell width={firstWidth} height={rowHeight} edge={edge}>
              <Txt variant="note" weight={600} color="muted" numberOfLines={1}>
                {words.money.sheet.addRow}
              </Txt>
            </Cell>
          ) : null}
        </Tap>
      ) : null}
      {hasTotals ? (
        <View style={{ flexDirection: 'row' }}>
          <NumberCell height={rowHeight}>
            <Sigma size={13} color={colors.muted} />
          </NumberCell>
          {first ? (
            <Cell width={firstWidth} height={rowHeight} tone="total" edge={edge}>
              {first.total ? <Total column={first} currency={sheet.currency} /> : <Txt variant="note" weight={800} numberOfLines={1}>{words.money.sheet.total}</Txt>}
            </Cell>
          ) : null}
        </View>
      ) : null}
    </View>
  );

  const others = (
    <View style={{ width: fits ? undefined : restWidth }}>
      <View style={{ flexDirection: 'row' }}>
        {rest.map((column) => (
          <Tap key={column.id} accessibilityRole="button" accessibilityLabel={(canEdit ? words.money.sheet.column : words.money.sheet.columnQuiet)(column.name, words.money.sheet.kinds[column.kind].name)} disabled={!canEdit} onPress={() => onColumn(column)} scaleTo={1}>
            <Cell width={columnWidth(column)} height={headHeight} tone="head" align={column.kind === 'tick' ? 'center' : isFigure(column) ? 'flex-end' : 'flex-start'} tight>
              <Head column={column} currency={sheet.currency} />
            </Cell>
          </Tap>
        ))}
        {canEdit ? (
          <Tap accessibilityRole="button" accessibilityLabel={words.money.sheet.addColumn} onPress={onAddColumn} scaleTo={1}>
            <Cell width={ADD} height={headHeight} tone="head" align="center" last>
              <Plus size={14} color={colors.muted} />
            </Cell>
          </Tap>
        ) : null}
      </View>
      {rows.map((row) => (
        // The whole row opens its card; a tick inside it is pressed on its own.
        <Pressable key={row.id} accessible={false} onPress={() => onOpenRow(row)} style={{ flexDirection: 'row' }}>
          {rest.map((column) => {
            const cell = row.cells[column.id];
            const align = column.kind === 'tick' ? 'center' : isFigure(column) ? 'flex-end' : 'flex-start';
            if (column.kind === 'tick' && canEdit) {
              const on = flips[flipKey(row.id, column.id)] ?? cell?.ticked === true;
              return (
                <Tap
                  key={column.id}
                  accessibilityRole="checkbox"
                  accessibilityLabel={words.money.sheet.tick(column.name, row.number)}
                  accessibilityState={{ checked: on }}
                  // Said this way, a browser hears whether it is ticked as well: the web takes no `accessibilityState`.
                  aria-checked={on}
                  onPress={() => onTick(row, column, !on)}
                  scaleTo={0.9}>
                  <Cell width={columnWidth(column)} height={rowHeight} align="center">
                    <TickBox on={on} />
                  </Cell>
                </Tap>
              );
            }
            return (
              <Cell key={column.id} width={columnWidth(column)} height={rowHeight} align={align}>
                <CellValue cell={cell} />
              </Cell>
            );
          })}
          {canEdit ? <Cell width={ADD} height={rowHeight} last /> : null}
        </Pressable>
      ))}
      {canEdit ? (
        <Pressable accessible={false} onPress={onAddRow} style={{ flexDirection: 'row' }}>
          {rest.map((column) => (
            <Cell key={column.id} width={columnWidth(column)} height={rowHeight} />
          ))}
          <Cell width={ADD} height={rowHeight} last />
        </Pressable>
      ) : null}
      {hasTotals ? (
        <View style={{ flexDirection: 'row' }}>
          {rest.map((column) => {
            const align = column.kind === 'tick' || (column.total?.of ?? null) !== null ? 'center' : isFigure(column) ? 'flex-end' : 'flex-start';
            if (!column.total) return <Cell key={column.id} width={columnWidth(column)} height={rowHeight} tone="total" />;
            return (
              <Tap key={column.id} accessibilityRole="button" accessibilityLabel={words.money.sheet.totalOf(column.name, totalText(column, sheet.currency))} accessibilityState={{ selected: selected === column.id }} aria-selected={selected === column.id} onPress={() => onSelect(column)} scaleTo={1}>
                <Cell width={columnWidth(column)} height={rowHeight} tone="total" align={align} chosen={selected === column.id} tight={align === 'center'}>
                  <Total column={column} currency={sheet.currency} />
                </Cell>
              </Tap>
            );
          })}
          {canEdit ? <Cell width={ADD} height={rowHeight} tone="total" last /> : null}
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={{ flexDirection: 'row', marginTop: 14, borderTopWidth: 1, borderTopColor: colors.line }}>
      {pinned}
      {fits ? (
        <View style={{ flex: 1 }}>{others}</View>
      ) : (
        <ScrollView
          horizontal
          accessibilityLabel={words.money.sheet.sideways}
          showsHorizontalScrollIndicator={false}
          bounces={false}
          decelerationRate="fast"
          snapToOffsets={stops}
          snapToEnd
          scrollEventThrottle={32}
          onScroll={(event) => setScrolled(event.nativeEvent.contentOffset.x > 1)}
          style={{ flex: 1 }}>
          {others}
        </ScrollView>
      )}
    </View>
  );
}

/** What a column's total says in its cell: "7,640.00", or "2 of 6" for a count of ticks. */
export function totalText(column: ColumnResponse, currency: string): string {
  const total = column.total;
  if (!total) return '';
  const value = total.cell.kind === 'money' && total.cell.cents !== null ? formatAmount(total.cell.cents) : cellText(total.cell, currency);
  return total.of === null ? value : words.money.sheet.of(value, total.of);
}

function Total({ column, currency }: { column: ColumnResponse; currency: string }) {
  return (
    <Txt variant="note" weight={800} numberOfLines={1} ellipsizeMode="clip" style={FIGURES}>
      {totalText(column, currency)}
    </Txt>
  );
}

/** A column's header: the small icon of what it holds, and its name. */
function Head({ column, currency }: { column: ColumnResponse; currency: string }) {
  const { colors } = useTheme();
  return (
    <>
      <KindIcon kind={column.kind} currency={currency} size={12} color={colors.muted} />
      {/* A name that is too long for its column is cut at the column's edge, not shortened with dots: "Who" keeps its last letter. */}
      <Txt variant="tiny" weight={800} color="muted" numberOfLines={1} ellipsizeMode="clip" style={{ flexShrink: 0 }}>
        {column.name}
      </Txt>
    </>
  );
}

type CellProps = {
  width: number;
  height: number;
  children?: ReactNode;
  /** "head" and "total" stand on grey. */
  tone?: 'head' | 'total';
  align?: 'flex-start' | 'center' | 'flex-end';
  /** The colour of the line at its right: stronger on the first column while the others are scrolled under it. */
  edge?: string;
  /** The last cell of a row has no line at its right. */
  last?: boolean;
  /** The chosen total: on the accent's soft ground, with a line around it. */
  chosen?: boolean;
  /** Less room at the sides, for a header or a count that would otherwise be cut short in a narrow column. */
  tight?: boolean;
};

function Cell({ width, height, children, tone, align = 'flex-start', edge, last, chosen, tight }: CellProps) {
  const { colors } = useTheme();
  const sides = !tight ? { paddingHorizontal: 9 } : align === 'center' ? { paddingHorizontal: 3 } : align === 'flex-end' ? { paddingLeft: 2, paddingRight: 9 } : { paddingLeft: 9, paddingRight: 2 };
  return (
    <View
      style={{
        width,
        height,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: align,
        gap: 4,
        ...sides,
        overflow: 'hidden',
        borderRightWidth: last ? 0 : 1,
        borderRightColor: edge ?? colors.line,
        borderBottomWidth: 1,
        borderBottomColor: colors.line,
        backgroundColor: chosen ? colors.accentSoft : tone ? colors.fill : undefined,
      }}>
      {children}
      {chosen ? <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderWidth: 2, borderColor: colors.accent }} /> : null}
    </View>
  );
}

function NumberCell({ height, children }: { height: number; children?: ReactNode }) {
  const { colors } = useTheme();
  return <View style={{ width: NUMBER, height, alignItems: 'center', justifyContent: 'center', borderRightWidth: 1, borderRightColor: colors.line, borderBottomWidth: 1, borderBottomColor: colors.line, backgroundColor: colors.fill }}>{children}</View>;
}

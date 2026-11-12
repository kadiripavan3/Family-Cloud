import { ScrollView, View } from 'react-native';

import type { SheetResponse, TileResponse } from '@/api/generated/homeport';
import { layout, radius, useTheme } from '@/theme';
import { Tap } from '@/ui/Motion';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

import { FIGURES } from '../parts';
import { cellHeadline, cellText } from './cells';

/**
 * The tiles on top of a tab: each a named total, worked out by the API. Up to three share the width; more
 * scroll sideways. The last one stands on the accent's soft ground: it is where the sums end up. Pressing one
 * opens its formula.
 */
export function Tiles({ sheet, onTile }: { sheet: SheetResponse; onTile?: (tile: TileResponse) => void }) {
  const tiles = sheet.tab.tiles;
  if (tiles.length === 0) return null;
  const list = tiles.map((tile, index) => <Tile key={tile.id} tile={tile} currency={sheet.currency} accent={tiles.length > 1 && index === tiles.length - 1} wide={tiles.length > 3} onPress={onTile ? () => onTile(tile) : undefined} />);
  if (tiles.length > 3) {
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginTop: 2 }} contentContainerStyle={{ gap: 10, paddingHorizontal: layout.barGutter }}>
        {list}
      </ScrollView>
    );
  }
  return <View style={{ flexDirection: 'row', gap: 10, marginTop: 2, paddingHorizontal: layout.barGutter }}>{list}</View>;
}

function Tile({ tile, currency, accent, wide, onPress }: { tile: TileResponse; currency: string; accent: boolean; wide: boolean; onPress?: () => void }) {
  const { colors } = useTheme();
  const value = tile.cell.kind === 'problem' ? words.money.sheet.cantWorkOut : cellText(tile.cell, currency);
  const shown = tile.cell.kind === 'problem' ? value : cellHeadline(tile.cell, currency);
  const frame = { flex: wide ? undefined : 1, minWidth: wide ? 112 : 0, paddingVertical: 12, paddingLeft: 14, paddingRight: 12, borderRadius: radius.photo, backgroundColor: accent ? colors.accentSoft : colors.fill } as const;
  const content = (
    <>
      <Txt variant="tiny" numberOfLines={1} style={{ color: accent ? colors.accentText : colors.muted }}>
        {tile.name}
      </Txt>
      <Txt variant={tile.cell.kind === 'problem' ? 'caption' : 'subheading'} numberOfLines={1} style={[FIGURES, { marginTop: 2 }]}>
        {shown}
      </Txt>
    </>
  );
  if (!onPress) {
    return (
      <View accessible accessibilityLabel={words.money.sheet.tileQuiet(tile.name, value)} style={frame}>
        {content}
      </View>
    );
  }
  return (
    <Tap accessibilityRole="button" accessibilityLabel={words.money.sheet.tile(tile.name, value)} onPress={onPress} style={frame}>
      {content}
    </Tap>
  );
}

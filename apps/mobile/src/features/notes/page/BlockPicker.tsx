import { RefreshCw } from 'lucide-react-native';
import { View } from 'react-native';

import { ThingKind } from '@/api/generated/homeport';
import { layout, radius, useTheme } from '@/theme';
import { Emoji } from '@/ui/Emoji';
import { Tap } from '@/ui/Motion';
import { NoteBox } from '@/ui/NoteBox';
import { Sheet } from '@/ui/Sheet';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

/**
 * The fifteen kinds of block of the "Add to this page" sheet, in the order of its grid. Five are the page's
 * own (words, a list, a photo, a file, a place). Five are live blocks: they show a thing from another place
 * (`live` is that thing's kind, as the API names it). The last five are still to come.
 */
export const BLOCK_TILES = [
  { id: 'text', emoji: '📝' },
  { id: 'checklist', emoji: '✅' },
  { id: 'photo', emoji: '📷' },
  { id: 'file', emoji: '📎' },
  { id: 'place', emoji: '📍' },
  { id: 'sheet', emoji: '📊', live: 'sheet' },
  { id: 'bill', emoji: '🧾', live: 'bill' },
  { id: 'event', emoji: '📅', live: 'event' },
  { id: 'password', emoji: '🔑', live: 'vault_item' },
  { id: 'goal', emoji: '🎯', live: 'goal' },
  { id: 'person', emoji: '👋', later: true },
  { id: 'countdown', emoji: '⏳', later: true },
  { id: 'recipe', emoji: '🍳', later: true },
  { id: 'poll', emoji: '💬', later: true },
  { id: 'sum', emoji: '🧮', later: true },
] as const;

export type BlockTile = (typeof BLOCK_TILES)[number];

/**
 * The kind of thing a live tile links to, when the API keeps that kind in this build. A place whose API
 * isn't there yet has no kind to ask for: its tile says so, and lights up by itself when the kind arrives.
 */
export function liveKind(tile: BlockTile): ThingKind | null {
  const kind = 'live' in tile ? tile.live : null;
  return kind && (Object.values(ThingKind) as string[]).includes(kind) ? (kind as ThingKind) : null;
}

type Props = { visible: boolean; onClose: () => void; onChoose: (tile: BlockTile) => void };

/** 5.4 Add to a page: the + in the page's bar. Fifteen kinds of block in a grid, and a line on which of them stay live. */
export function BlockPicker({ visible, onClose, onChoose }: Props) {
  const { colors } = useTheme();
  return (
    <Sheet visible={visible} onClose={onClose} title={words.notes.blocks.title}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 16, marginTop: 14, marginBottom: 6, marginHorizontal: 12 }}>
        {BLOCK_TILES.map((tile) => (
          <Tap key={tile.id} accessibilityRole="button" accessibilityLabel={words.notes.blocks.kinds[tile.id]} onPress={() => onChoose(tile)} scaleTo={0.94} style={{ width: '20%', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 56, height: 56, borderRadius: radius.photo, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.fill }}>
              <Emoji char={tile.emoji} size={30} />
            </View>
            <Txt variant="small" weight={700} numberOfLines={1} center>
              {words.notes.blocks.kinds[tile.id]}
            </Txt>
          </Tap>
        ))}
      </View>
      <NoteBox soft icon={(c) => <RefreshCw size={20} color={c} />} style={{ marginTop: 10, marginHorizontal: layout.barGutter }}>
        {words.notes.blocks.live}
      </NoteBox>
    </Sheet>
  );
}

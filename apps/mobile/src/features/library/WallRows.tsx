import { View } from 'react-native';

import { PhotoTile } from './PhotoTile';
import type { WallItem } from './types';
import { type PhotoRow, WALL_GAP } from './wallRows';

type Props = {
  row: PhotoRow;
  onOpen: (item: WallItem) => void;
  onHold?: (item: WallItem) => void;
  /** Show who added each photo. */
  who?: boolean;
};

/** One row of the wall: two or three photos, edge to edge, each as wide as the layout gave it. */
export function WallPhotos({ row, onOpen, onHold, who }: Props) {
  const all = row.cells.reduce((sum, cell) => sum + cell.flex, 0);
  return (
    <View style={{ flexDirection: 'row', gap: WALL_GAP, height: row.height, marginBottom: WALL_GAP }}>
      {row.cells.map((cell) => (
        <PhotoTile
          key={cell.item.id}
          item={cell.item}
          who={who}
          // Where each photo says who added it (a moment's own page), its corners are theirs: the heart stays on the wall.
          plain={who}
          // More than about half the row: the small picture would look soft.
          large={cell.flex / all > 0.45}
          onPress={() => onOpen(cell.item)}
          onLongPress={onHold ? () => onHold(cell.item) : undefined}
          style={{ flex: cell.flex, minWidth: 0 }}
        />
      ))}
    </View>
  );
}

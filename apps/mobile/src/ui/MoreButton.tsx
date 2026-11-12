import { View } from 'react-native';

import { Button } from '@/ui/Button';
import { words } from '@/words';

type Pages = { hasNextPage: boolean; isFetchingNextPage: boolean; fetchNextPage: () => unknown };

/** Under a short list that has more to show: one button that brings the next page. Nothing when the list is complete. */
export function MoreButton({ pages, label = words.common.showMore }: { pages: Pages; label?: string }) {
  if (!pages.hasNextPage) return null;
  return (
    <View style={{ alignItems: 'center', marginTop: 8, marginBottom: 12 }}>
      <Button label={label} variant="line" size="sm" inline loading={pages.isFetchingNextPage} onPress={() => void pages.fetchNextPage()} />
    </View>
  );
}

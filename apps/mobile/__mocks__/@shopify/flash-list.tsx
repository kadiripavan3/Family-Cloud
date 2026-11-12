import type { ReactElement, ReactNode } from 'react';
import { View } from 'react-native';

type Props<T> = {
  data: readonly T[];
  renderItem: (info: { item: T; index: number }) => ReactElement | null;
  keyExtractor?: (item: T, index: number) => string;
  ListHeaderComponent?: ReactNode;
  ListEmptyComponent?: ReactNode;
  ListFooterComponent?: ReactNode;
};

/**
 * The list library, for tests. Jest picks this file up by itself for every test (it sits beside
 * node_modules and is named like the package), so a screen that draws a `List` needs no mock of its own.
 * The real list draws only the rows a phone's screen has room for, and its package is one Jest can't load;
 * here every row is drawn, with what stands above, below and in place of them.
 */
export function FlashList<T>({ data, renderItem, keyExtractor, ListHeaderComponent, ListEmptyComponent, ListFooterComponent }: Props<T>) {
  return (
    <View>
      {ListHeaderComponent}
      {data.length === 0 ? ListEmptyComponent : data.map((item, index) => <View key={keyExtractor?.(item, index) ?? index}>{renderItem({ item, index })}</View>)}
      {ListFooterComponent}
    </View>
  );
}

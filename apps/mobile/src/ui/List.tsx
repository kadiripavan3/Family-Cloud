import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { type ReactElement, type Ref, useImperativeHandle, useRef } from 'react';
import { ActivityIndicator, RefreshControl, View } from 'react-native';

import { useTheme } from '@/theme';
import { words } from '@/words';

type Props<T> = {
  data: readonly T[];
  /** One row. Keep it cheap: rows are reused as the list scrolls. */
  row: (item: T, index: number) => ReactElement | null;
  keyOf: (item: T, index: number) => string;
  /** Rows of different shapes say which shape they are, so only like rows are reused for each other. */
  typeOf?: (item: T) => string;
  /**
   * Rows that stay at the top of the list while what belongs to them scrolls underneath, until the next such
   * row takes their place: a day's label over what happened that day. Give these rows a background, or the rows show through.
   */
  sticky?: (item: T) => boolean;
  header?: ReactElement | null;
  footer?: ReactElement | null;
  /** Shown in place of the rows when there are none. */
  empty?: ReactElement | null;
  /** The person is nearing the end of what is loaded: fetch the next page. */
  onEnd?: () => void;
  /** The person is nearing the start (for lists opened in the middle): fetch the page before. */
  onStart?: () => void;
  /** A next page is on its way; shows a small spinner under the rows. */
  loadingMore?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  columns?: number;
  /** Room under the last row, for the tab bar or a floating button. */
  bottom?: number;
  top?: number;
  /** Open the list at this row instead of at its top. Read once, when the list first appears. */
  startAt?: number;
  /**
   * Another row has become the first one on screen: for a label that follows the list as it scrolls, such
   * as the month a wall of photos is showing. It is told as the list scrolls, not when it first appears.
   */
  onTop?: (item: T) => void;
  listRef?: Ref<FlashListRef<T>>;
};

/**
 * Every list that can grow long is drawn with this: only the rows on screen exist, however many there are,
 * and the next page is fetched as the end comes near.
 */
export function List<T>({ data, row, keyOf, typeOf, sticky, header, footer, empty, onEnd, onStart, loadingMore, refreshing, onRefresh, columns, bottom = 40, top = 0, startAt, onTop, listRef }: Props<T>) {
  const { colors } = useTheme();
  const stuck = sticky ? data.flatMap((item, index) => (sticky(item) ? [index] : [])) : undefined;
  // For `onTop`: the list itself is asked which row is first on screen, each time it has scrolled a little.
  const list = useRef<FlashListRef<T> | null>(null);
  const lastTop = useRef(-1);
  const followTop = () => {
    const first = list.current?.getFirstVisibleIndex() ?? -1;
    const item = data[first];
    if (first === lastTop.current || item === undefined) return;
    lastTop.current = first;
    onTop?.(item);
  };
  // Whoever asked for the list by `listRef` gets the same one.
  useImperativeHandle(listRef, () => list.current as FlashListRef<T>, []);
  return (
    <FlashList
      ref={list}
      data={data}
      stickyHeaderIndices={stuck}
      renderItem={({ item, index }) => row(item, index)}
      keyExtractor={keyOf}
      getItemType={typeOf}
      numColumns={columns}
      initialScrollIndex={startAt}
      onScroll={onTop ? followTop : undefined}
      scrollEventThrottle={onTop ? 64 : undefined}
      ListHeaderComponent={header}
      ListEmptyComponent={empty}
      ListFooterComponent={
        <>
          {loadingMore ? (
            <View accessibilityLabel={words.states.loadingMore} style={{ paddingVertical: 18 }}>
              <ActivityIndicator color={colors.muted} />
            </View>
          ) : null}
          {footer}
        </>
      }
      onEndReached={onEnd}
      onEndReachedThreshold={0.6}
      onStartReached={onStart}
      onStartReachedThreshold={0.4}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingTop: top, paddingBottom: bottom }}
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.muted} /> : undefined}
    />
  );
}

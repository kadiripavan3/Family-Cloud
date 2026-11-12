import { View } from 'react-native';

import type { SplitBriefResponse } from '@/api/generated/homeport';
import { formatMoney } from '@/lib/money';
import { layout, useTheme } from '@/theme';
import { Tap } from '@/ui/Motion';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

import { Amount, EmojiTile } from '../parts';

/** A split as a row: what it is called, and whether the person is owed, owes or is even. */
export function SplitRow({ split, onPress }: { split: SplitBriefResponse; onPress: () => void }) {
  const { colors } = useTheme();
  const amount = formatMoney(Math.abs(split.myBalanceCents), split.currency);
  const line = split.myBalanceCents > 0 ? words.money.split.owed(amount) : split.myBalanceCents < 0 ? words.money.split.owe(amount) : words.money.split.even;
  return (
    <Tap accessibilityRole="button" accessibilityLabel={words.common.spoken([split.title, line])} onPress={onPress} scaleTo={0.99} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 58, paddingVertical: 7, paddingHorizontal: layout.rowGutter }}>
      <EmojiTile emoji="🤝" />
      <View style={{ flex: 1, gap: 3 }}>
        <Txt variant="item" numberOfLines={1}>
          {split.title}
        </Txt>
        <Txt variant="footnote" color="muted" numberOfLines={1}>
          {line}
        </Txt>
      </View>
      {split.myBalanceCents === 0 ? null : <Amount color={split.myBalanceCents < 0 ? colors.warn : undefined}>{amount}</Amount>}
    </Tap>
  );
}

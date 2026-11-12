import { View } from 'react-native';

import type { BillRowResponse } from '@/api/generated/homeport';
import { useOpenThing } from '@/features/things/open';
import { today } from '@/lib/dates';
import { formatMoneyExact } from '@/lib/money';
import { layout, useTheme } from '@/theme';
import { Tap } from '@/ui/Motion';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

import { billLine, subscriptionLine } from './lines';
import { Amount, EmojiTile } from './parts';

type Props = {
  bill: BillRowResponse;
  /** "grouped" is one of several on one card (Money's "Due soon"); "plain" stands alone in a long list. */
  look?: 'grouped' | 'plain';
  /** For "grouped": the first row has no line above it. */
  first?: boolean;
  /** In the list of subscriptions the line says what it comes to in a year instead of how it is paid. */
  asSubscription?: boolean;
};

/** A bill as a row: its emoji on a tile, its name, when it is due and one more thing about it, and the amount. Pressing opens the bill. */
export function BillRow({ bill, look = 'grouped', first, asSubscription }: Props) {
  const { colors } = useTheme();
  const open = useOpenThing();
  const day = today();
  const line = asSubscription ? { text: subscriptionLine(bill, day), soon: false } : billLine(bill, day);
  const amount = formatMoneyExact(bill.amountCents, bill.currency);
  const grouped = look === 'grouped';
  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel={words.common.spoken([bill.title, line.text, amount])}
      onPress={() => open({ kind: 'bill', id: bill.id })}
      scaleTo={0.99}
      style={[{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60 }, grouped ? { paddingVertical: 10, paddingHorizontal: 14, borderTopWidth: first ? 0 : 1, borderTopColor: colors.line } : { paddingVertical: 7, paddingHorizontal: layout.rowGutter }]}>
      <EmojiTile emoji={bill.emoji} size={grouped ? 40 : 44} />
      <View style={{ flex: 1, gap: 1 }}>
        <Txt variant="item" weight={grouped ? 600 : 700} numberOfLines={1}>
          {bill.title}
        </Txt>
        <Txt variant="footnote" weight={line.soon ? 700 : 500} numberOfLines={1} style={{ color: line.soon ? colors.warn : colors.muted }}>
          {line.text}
        </Txt>
      </View>
      <Amount color={bill.paid ? colors.muted : undefined}>{amount}</Amount>
    </Tap>
  );
}

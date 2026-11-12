import { Copy } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import type { VaultItemRowResponse } from '@/api/generated/homeport';
import { firstName } from '@/lib/names';
import { layout, useTheme } from '@/theme';
import { Tap } from '@/ui/Motion';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

import { ItemTile } from './ItemTile';

/** The line under an item's title in a list: whose it is and what this person may do with it, or its few words on what it is. */
export function itemLine(item: VaultItemRowResponse, everyone: string): string {
  const says = words.vault.home;
  if (item.mine) return item.glance;
  const owner = firstName(item.owner.name);
  // A sample item has no key for anyone: its line says what the real thing would.
  if (item.sample) return item.chip.audience === 'circle' ? everyone : says.from(owner, item.myAccess);
  if (item.myState === 'waiting') return says.state.waiting(owner);
  if (item.myState === 'used') return says.state.used(owner);
  if (item.myState === 'stopped') return says.state.stopped(owner);
  return item.chip.audience === 'circle' ? everyone : says.from(owner, item.myAccess);
}

type Props = {
  item: VaultItemRowResponse;
  /** What "everyone" is called in this circle: "Everyone in The Linds". */
  everyone: string;
  onOpen: () => void;
  /** Copies its main secret without opening its page, or says why it can't. */
  onCopy: () => void;
};

/** An item of the Vault as a row: its tile, its title, a line about it, and a way to copy it without showing it. */
export function ItemRow({ item, everyone, onOpen, onCopy }: Props) {
  const { colors } = useTheme();
  const line = itemLine(item, everyone);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={words.common.spoken([item.title, line])}
        onPress={onOpen}
        style={({ pressed }) => ({ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 58, paddingVertical: 7, paddingLeft: layout.rowGutter, backgroundColor: pressed ? colors.fill : 'transparent' })}>
        <ItemTile category={item.category} title={item.title} />
        <View style={{ flex: 1, gap: 3 }}>
          <Txt variant="item" numberOfLines={1}>
            {item.title}
          </Txt>
          <Txt variant="footnote" color="muted" numberOfLines={1}>
            {line}
          </Txt>
        </View>
      </Pressable>
      <Tap accessibilityRole="button" accessibilityLabel={words.vault.home.copy(item.title)} hitSlop={6} onPress={onCopy} scaleTo={0.9} style={{ width: 58, minHeight: 58, alignItems: 'center', justifyContent: 'center' }}>
        <Copy size={18} color={colors.muted} />
      </Tap>
    </View>
  );
}

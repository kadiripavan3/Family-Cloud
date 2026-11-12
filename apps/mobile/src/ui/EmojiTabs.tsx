import { View } from 'react-native';

import { radius, useTheme } from '@/theme';

import { Emoji } from './Emoji';
import { Tap } from './Motion';
import { Txt } from './Txt';

type Tab = { id: string; label: string; emoji: string };

/** Tabs with a big emoji over a word, as under Home's search pill: one is always chosen. */
export function EmojiTabs({ tabs, value, onChange }: { tabs: Tab[]; value: string; onChange: (id: string) => void }) {
  const { colors } = useTheme();
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', marginTop: 16, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: colors.line }}>
      {tabs.map((tab) => {
        const on = tab.id === value;
        return (
          <Tap
            key={tab.id}
            accessibilityRole="tab"
            accessibilityLabel={tab.label}
            accessibilityState={{ selected: on }}
            onPress={() => onChange(tab.id)}
            scaleTo={0.94}
            style={{ flex: 1, alignItems: 'center', gap: 3, paddingBottom: 11 }}>
            <Emoji char={tab.emoji} size={36} />
            <Txt variant="small" numberOfLines={1} weight={on ? 700 : 600} style={{ color: on ? colors.text : colors.muted }}>
              {tab.label}
            </Txt>
            {on ? <View style={{ position: 'absolute', left: '20%', right: '20%', bottom: -1, height: 2.5, borderRadius: radius.pill, backgroundColor: colors.text }} /> : null}
          </Tap>
        );
      })}
    </View>
  );
}

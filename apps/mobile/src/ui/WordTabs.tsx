import type { ReactNode } from 'react';
import { type StyleProp, View, type ViewStyle } from 'react-native';

import { layout, radius, useTheme } from '@/theme';
import { words } from '@/words';

import { Txt } from './Txt';
import { Tap } from './Motion';

export type WordTab<T extends string> = {
  id: T;
  label: string;
  /** Shown after the label in a lighter weight, such as how many there are. */
  count?: number | string;
  /** Shown before the label, such as a lock. Receives the colour the label uses. */
  icon?: (color: string) => ReactNode;
};

type Props<T extends string> = {
  tabs: readonly WordTab<T>[];
  value: T;
  onChange: (id: T) => void;
  style?: StyleProp<ViewStyle>;
};

/** A row of word tabs with a line under the chosen one, such as the kinds of thing in a list. */
export function WordTabs<T extends string>({ tabs, value, onChange, style }: Props<T>) {
  const { colors } = useTheme();
  return (
    <View accessibilityRole="tablist" style={[{ flexDirection: 'row', gap: 24, paddingHorizontal: layout.rowGutter, borderBottomWidth: 1, borderBottomColor: colors.line }, style]}>
      {tabs.map((tab) => {
        const on = tab.id === value;
        const color = on ? colors.text : colors.muted;
        return (
          <Tap
            key={tab.id}
            accessibilityRole="tab"
            accessibilityLabel={tab.count === undefined ? tab.label : words.common.withCount(tab.label, tab.count)}
            accessibilityState={{ selected: on }}
            onPress={() => onChange(tab.id)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 12 }}>
            {tab.icon?.(color)}
            <Txt variant="item" style={{ color }}>
              {tab.label}
            </Txt>
            {tab.count === undefined ? null : (
              <Txt variant="footnote" weight={600} style={{ color }}>
                {tab.count}
              </Txt>
            )}
            {on ? <View style={{ position: 'absolute', left: 0, right: 0, bottom: -1, height: 2.5, borderRadius: radius.pill, backgroundColor: colors.text }} /> : null}
          </Tap>
        );
      })}
    </View>
  );
}

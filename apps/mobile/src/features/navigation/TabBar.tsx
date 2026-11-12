import { BlurView } from 'expo-blur';
import type { BottomTabBarProps } from 'expo-router/tabs';
import { Bell, House, Plus, Users } from 'lucide-react-native';
import { type ReactNode, useState } from 'react';
import { Pressable, View } from 'react-native';

import { useGetMe } from '@/api/generated/homeport';
import { AppSwitchSheet } from '@/features/journeyLink/AppSwitchSheet';
import { PlusSheet } from '@/features/today/PlusSheet';
import { radius, useTheme } from '@/theme';
import { Avatar } from '@/ui/Avatar';
import { Tap } from '@/ui/Motion';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

const ICONS: Record<string, (color: string) => ReactNode> = {
  index: (c) => <House size={24} color={c} />,
  people: (c) => <Users size={24} color={c} />,
  activity: (c) => <Bell size={24} color={c} />,
};

/**
 * The floating glass tab bar: Home, People, the + button, Activity and You. Content scrolls underneath it.
 * It has the same shape as Journey's, so moving between the two apps feels like changing rooms.
 */
export function TabBar({ state, descriptors, navigateToTab, insets }: BottomTabBarProps) {
  const { colors, scheme, shadow } = useTheme();
  const profile = useGetMe().data?.profile;
  const [adding, setAdding] = useState(false);
  const [switching, setSwitching] = useState(false);

  const tab = (routeIndex: number) => {
    const route = state.routes[routeIndex];
    if (!route) return null;
    const focused = state.index === routeIndex;
    const label = descriptors[route.key]?.options.title ?? route.name;
    const color = focused ? colors.accentText : colors.muted;
    return (
      <Pressable
        key={route.key}
        accessibilityRole="tab"
        accessibilityState={{ selected: focused }}
        accessibilityLabel={label}
        onPress={() => {
          if (!focused) navigateToTab(route.key);
        }}
        // Holding the You tab offers the other app (10.1), as it does in Journey.
        onLongPress={route.name === 'you' ? () => setSwitching(true) : undefined}
        style={{ width: 62, height: 56, alignItems: 'center', justifyContent: 'center', gap: 3 }}>
        {route.name === 'you' ? (
          // The You tab is the person's own picture, with a ring round it while the tab is open.
          <View>
            <Avatar uri={profile?.avatarUrl} name={profile?.displayName ?? ''} size={26} />
            {focused ? <View style={{ position: 'absolute', top: -4, left: -4, right: -4, bottom: -4, borderRadius: radius.pill, borderWidth: 2, borderColor: colors.text }} /> : null}
          </View>
        ) : (
          ICONS[route.name]?.(color)
        )}
        <Txt variant="micro" weight={700} style={{ color }}>{label}</Txt>
      </Pressable>
    );
  };

  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 14, right: 14, bottom: Math.max(insets.bottom, 12) }}>
      <View
        style={{
          height: 70,
          borderRadius: radius.pill,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: colors.glassLine,
          boxShadow: shadow.md,
        }}>
        <BlurView intensity={40} tint={scheme} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingHorizontal: 6, backgroundColor: colors.glass }}>
          {tab(0)}
          {tab(1)}
          <Tap
            accessibilityRole="button"
            accessibilityLabel={words.common.add}
            onPress={() => setAdding(true)}
            scaleTo={0.9}
            style={{ width: 54, height: 54, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent }}>
            <Plus size={26} color={colors.onAccent} strokeWidth={2.4} />
          </Tap>
          {tab(2)}
          {tab(3)}
        </View>
      </View>
      {/* What the + button opens: a sheet over the tab it was pressed on. */}
      <PlusSheet visible={adding} onClose={() => setAdding(false)} />
      <AppSwitchSheet visible={switching} onClose={() => setSwitching(false)} />
    </View>
  );
}

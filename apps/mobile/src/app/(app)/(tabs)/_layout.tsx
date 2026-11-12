import { Tabs } from 'expo-router/tabs';

import { TabBar } from '@/features/navigation/TabBar';
import { words } from '@/words';

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <TabBar {...props} />}>
      <Tabs.Screen name="index" options={{ title: words.common.tabs.home }} />
      <Tabs.Screen name="people" options={{ title: words.common.tabs.people }} />
      <Tabs.Screen name="activity" options={{ title: words.common.tabs.activity }} />
      <Tabs.Screen name="you" options={{ title: words.common.tabs.you }} />
    </Tabs>
  );
}

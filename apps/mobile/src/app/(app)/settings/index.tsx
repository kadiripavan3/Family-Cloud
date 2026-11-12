import { useRouter } from 'expo-router';
import { Bell, Palette, Zap } from 'lucide-react-native';
import { ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppearance } from '@/theme/appearance';
import { useTheme } from '@/theme';
import { AppBar } from '@/ui/AppBar';
import { Row, RowGroup } from '@/ui/Rows';
import { words } from '@/words';

/** "Notifications and appearance", from You's gear and from its list: the way to each of the two, and to Jot's ways in. */
export default function Settings() {
  const { colors } = useTheme();
  const router = useRouter();
  const appearance = useAppearance();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar title={words.you.rows.notificationsAndAppearance} />
      <ScrollView contentContainerStyle={{ paddingTop: 8, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <RowGroup>
          <Row first icon={(c) => <Bell size={18} color={c} />} label={words.you.rows.notifications} onPress={() => router.push('/settings/notifications')} />
          <Row icon={(c) => <Palette size={18} color={c} />} label={words.you.rows.appearance} value={words.settings.appearancePage.choices[appearance].label} onPress={() => router.push('/settings/appearance')} />
          <Row icon={(c) => <Zap size={18} color={c} />} label={words.you.rows.jot} note={words.you.rows.jotNote} onPress={() => router.push('/jot/ways')} />
        </RowGroup>
      </ScrollView>
    </SafeAreaView>
  );
}

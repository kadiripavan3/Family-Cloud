import { useRouter } from 'expo-router';
import { Bell, CloudUpload, Download, LogOut, Palette, Shield, Trash2, Users } from 'lucide-react-native';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useGetMe } from '@/api/generated/homeport';
import { useSession } from '@/auth/session';
import { firstName } from '@/lib/names';
import { layout, radius, useTheme } from '@/theme';
import { useAppearance } from '@/theme/appearance';
import { Avatar } from '@/ui/Avatar';
import { Row, RowGroup } from '@/ui/Rows';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

/**
 * 12.1 You: the person's own card, and the list under it. Built so far: who you are, notifications,
 * appearance, logging out and deleting the account. The rows that say "Soon" wait for their screens (circles,
 * storage, privacy and security, export and leaving); the card's numbers and the line about Journey wait
 * for what they count. The design's one row "Notifications and appearance" is two rows until its page exists.
 */
export default function You() {
  const router = useRouter();
  const { colors, shadow } = useTheme();
  const session = useSession();
  const appearance = useAppearance();
  const profile = useGetMe().data?.profile;
  // The app only opens once the profile is known (the root layout sees to that).
  if (!profile) return null;

  const first = firstName(profile.displayName);
  const soon = words.common.soon;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ paddingTop: 12, paddingBottom: 130 }} showsVerticalScrollIndicator={false}>
        <View style={{ alignItems: 'center', marginHorizontal: layout.barGutter, paddingTop: 22, paddingBottom: 20, paddingHorizontal: 18, borderRadius: radius.panel, backgroundColor: colors.surface, boxShadow: shadow.md }}>
          <Avatar uri={profile.avatarUrl} name={profile.displayName} size={96} />
          <Txt variant="title" accessibilityRole="header" numberOfLines={2} center style={{ marginTop: 8 }}>
            {first}
          </Txt>
          {/* The whole name under the first one, when there is more of it. */}
          {profile.displayName.trim() === first ? null : (
            <Txt variant="caption" color="muted" numberOfLines={1}>
              {profile.displayName}
            </Txt>
          )}
        </View>

        <View style={{ marginTop: 14 }}>
          <RowGroup>
            <Row first icon={(c) => <Users size={18} color={c} />} label={words.you.rows.circles} value={soon} />
            <Row icon={(c) => <CloudUpload size={18} color={c} />} label={words.you.rows.storage} value={soon} />
            <Row icon={(c) => <Shield size={18} color={c} />} label={words.you.rows.privacy} value={soon} />
            <Row icon={(c) => <Bell size={18} color={c} />} label={words.you.rows.notifications} onPress={() => router.push('/settings/notifications')} />
            <Row
              icon={(c) => <Palette size={18} color={c} />}
              label={words.you.rows.appearance}
              value={words.settings.appearancePage.choices[appearance].label}
              onPress={() => router.push('/settings/appearance')}
            />
            <Row icon={(c) => <Download size={18} color={c} />} label={words.you.rows.leaving} value={soon} />
          </RowGroup>
        </View>

        <View style={{ marginTop: 14 }}>
          <RowGroup>
            {/* (An empty view at the right: logging out opens nothing, so the row has no arrow.) */}
            <Row first icon={(c) => <LogOut size={18} color={c} />} label={words.common.signOut} onPress={() => void session.signOut()} trailing={<View />} />
            <Row danger icon={(c) => <Trash2 size={18} color={c} />} label={words.you.rows.deleteAccount} onPress={() => router.push('/settings/delete-account')} />
          </RowGroup>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

import { useRouter } from 'expo-router';
import { LogOut, Trash2 } from 'lucide-react-native';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useSession } from '@/auth/session';
import { layout, useTheme } from '@/theme';
import { AppBar } from '@/ui/AppBar';
import { Row, RowGroup } from '@/ui/Rows';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

/**
 * 12.4 Export and leaving, as far as it is built. Exporting everything and leaving a circle arrive with
 * "what ties it together"; the page says so. Until then it holds the two things that end a sign-in:
 * logging out, and deleting the account (which asks on a page of its own).
 */
export default function Leaving() {
  const { colors } = useTheme();
  const router = useRouter();
  const session = useSession();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar title={words.you.leaving.title} />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <Txt variant="callout" color="muted" style={{ marginTop: 6, marginBottom: 16, marginHorizontal: layout.gutter }}>
          {words.you.leaving.later}
        </Txt>
        <RowGroup>
          {/* (An empty view at the right: logging out opens nothing, so the row has no arrow.) */}
          <Row first icon={(c) => <LogOut size={18} color={c} />} label={words.common.signOut} onPress={() => void session.signOut()} trailing={<View />} />
          <Row danger icon={(c) => <Trash2 size={18} color={c} />} label={words.you.rows.deleteAccount} note={words.you.rows.deleteAccountNote} onPress={() => router.push('/settings/delete-account')} />
        </RowGroup>
      </ScrollView>
    </SafeAreaView>
  );
}

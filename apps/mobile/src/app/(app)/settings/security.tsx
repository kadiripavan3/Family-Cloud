import { Check, Eye, Lock } from 'lucide-react-native';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useGetMe, useGetOverview } from '@/api/generated/homeport';
import { useSession } from '@/auth/session';
import { LOCK_AFTER_MINUTES, PHONE_SECURITY, type PhoneSecurity, phoneSecurityKey } from '@/features/settings/security';
import { useKept } from '@/lib/useKept';
import { layout, useTheme } from '@/theme';
import { AppBar } from '@/ui/AppBar';
import { GroupLabel } from '@/ui/Heading';
import { NoteBox } from '@/ui/NoteBox';
import { Row, RowGroup, ToggleRow } from '@/ui/Rows';
import { Sheet, SheetRow } from '@/ui/Sheet';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

/**
 * 12.3 Privacy and security: settings, and a straight answer to "what can you see?". The Vault: nothing.
 * Everything else is private to the people you chose, but the service can read it so that search,
 * reminders and scans work. The three choices under "This phone" are remembered on this phone; Face ID and
 * locking the Vault do their work in a build on a phone, once the Vault exists, and the page says so.
 */
export default function PrivacyAndSecurity() {
  const { colors } = useTheme();
  const session = useSession();
  const account = useGetMe().data?.id;
  const overview = useGetOverview().data;
  const [security, setSecurity] = useKept<PhoneSecurity>(phoneSecurityKey(account), PHONE_SECURITY);
  const [choosingLock, setChoosingLock] = useState(false);
  const says = words.you.security;
  const phones = overview?.phones ?? [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar title={says.title} />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <GroupLabel style={{ marginTop: 14, marginHorizontal: layout.gutter }}>{says.thisPhone}</GroupLabel>
        <RowGroup>
          <ToggleRow first label={says.faceId} value={security.faceId} onChange={(faceId) => setSecurity({ ...security, faceId })} />
          <Row label={says.lockAfter} value={says.minutes(security.lockAfterMinutes)} onPress={() => setChoosingLock(true)} />
          <ToggleRow label={says.hideDetails.label} note={says.hideDetails.note} value={security.hideDetails} onChange={(hideDetails) => setSecurity({ ...security, hideDetails })} />
        </RowGroup>
        <Txt variant="footnote" color="muted" style={{ marginTop: 8, marginHorizontal: layout.gutter }}>
          {says.phoneNote}
        </Txt>

        <GroupLabel style={{ marginHorizontal: layout.gutter }}>{says.account}</GroupLabel>
        <RowGroup>
          <Row first label={says.phones} value={phones.length ? phones.map(says.phone).join(', ') : says.phonesNone} />
          <Row label={says.signIn} note={says.signInNote} value={session.provider ? says.ways[session.provider] : undefined} />
        </RowGroup>

        <GroupLabel style={{ marginHorizontal: layout.gutter }}>{says.see}</GroupLabel>
        <View style={{ gap: 8, marginTop: 8, marginHorizontal: layout.barGutter }}>
          <NoteBox icon={(c) => <Lock size={20} color={c} />} title={says.vault.title}>
            {says.vault.body}
          </NoteBox>
          <NoteBox icon={(c) => <Eye size={20} color={c} />} title={says.rest.title}>
            {says.rest.body}
          </NoteBox>
        </View>
      </ScrollView>

      <Sheet visible={choosingLock} onClose={() => setChoosingLock(false)} title={says.lockTitle}>
        {LOCK_AFTER_MINUTES.map((minutes, index) => (
          <SheetRow
            key={minutes}
            first={index === 0}
            label={says.minutes(minutes)}
            trailing={security.lockAfterMinutes === minutes ? <Check size={20} color={colors.text} strokeWidth={2.6} /> : undefined}
            onPress={() => {
              setSecurity({ ...security, lockAfterMinutes: minutes });
              setChoosingLock(false);
            }}
          />
        ))}
      </Sheet>
    </SafeAreaView>
  );
}

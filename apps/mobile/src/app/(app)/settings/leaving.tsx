import { useRouter } from 'expo-router';
import { Check, ChevronRight, Copy, Download, KeyRound, type LucideIcon } from 'lucide-react-native';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useSession } from '@/auth/session';
import { useCircle } from '@/features/circles/current';
import { ExportSheet } from '@/features/leaving/ExportSheet';
import { LeaveSheet } from '@/features/leaving/LeaveSheet';
import { useGoHome } from '@/features/states/PageProblem';
import { layout, useTheme } from '@/theme';
import { AppBar } from '@/ui/AppBar';
import { Button } from '@/ui/Button';
import { GroupLabel, Heading } from '@/ui/Heading';
import { Row, RowGroup } from '@/ui/Rows';
import { Sheet } from '@/ui/Sheet';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

const says = words.you.leaving;

/**
 * 12.4 Export and leaving: the way out, as plain as the way in. Exporting the current circle as ordinary
 * files, what happens on leaving it (with the numbers, asked before it is done), and deleting the account,
 * which asks on a page of its own whether only this app goes or Journey too. Exporting the Vault is the
 * phone's own work, which isn't built: its row says so. Logging out is here as well; it is in no drawing.
 */
export default function Leaving() {
  const { colors } = useTheme();
  const router = useRouter();
  const session = useSession();
  const circle = useCircle();
  const home = useGoHome();
  const [exporting, setExporting] = useState(false);
  const [aboutVault, setAboutVault] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const arrow = <ChevronRight size={18} color={colors.muted} />;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar title={says.title} trailing={<View style={{ width: 40 }} />} />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <Heading style={{ marginTop: 6, marginBottom: 16, marginHorizontal: layout.rowGutter }}>{says.headline}</Heading>
        <RowGroup>
          <Row first icon={(c) => <Download size={18} color={c} />} label={says.exportAll.label} note={says.exportAll.note} onPress={() => setExporting(true)} />
          <Row icon={(c) => <KeyRound size={18} color={c} />} label={says.exportVault.label} note={says.exportVault.note} onPress={() => setAboutVault(true)} />
        </RowGroup>

        <GroupLabel style={{ marginHorizontal: layout.gutter }}>{says.ifYouLeave(circle.name)}</GroupLabel>
        <View style={{ gap: 12, marginTop: 10, marginBottom: 20, marginHorizontal: layout.rowGutter }}>
          <Line icon={Check} text={says.lines.private} />
          <Line icon={Copy} text={says.lines.shared} />
          <Line icon={KeyRound} text={says.lines.passwords} />
        </View>
        <RowGroup>
          <Row first danger label={says.leave(circle.name)} trailing={arrow} onPress={() => setLeaving(true)} />
          <Row danger label={words.you.rows.deleteAccount} note={words.you.rows.deleteAccountNote} trailing={arrow} onPress={() => router.push('/settings/delete-account')} />
        </RowGroup>

        <Button label={words.common.signOut} variant="quiet" inline onPress={() => void session.signOut()} style={{ marginTop: 18 }} />
      </ScrollView>

      <ExportSheet visible={exporting} onClose={() => setExporting(false)} circle={circle} />
      <Sheet visible={aboutVault} onClose={() => setAboutVault(false)} title={says.vault.title} subtitle={says.vault.body}>
        <View style={{ paddingTop: 6, paddingHorizontal: layout.rowGutter }}>
          <Button label={says.vault.ok} size="lg" block onPress={() => setAboutVault(false)} />
        </View>
      </Sheet>
      {/* After leaving, this page is about a circle the person is no longer in: Home, on another one (or setting one up). */}
      <LeaveSheet visible={leaving} onClose={() => setLeaving(false)} circle={circle} onLeft={home} />
    </SafeAreaView>
  );
}

/** One of the three things that happen on leaving: an icon and a sentence. */
function Line({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <Icon size={20} color={colors.muted} />
      <Txt variant="item" weight={600} style={{ flex: 1 }}>
        {text}
      </Txt>
    </View>
  );
}

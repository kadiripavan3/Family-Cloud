import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { messageFor } from '@/api/fetcher';
import { ThisPhone } from '@/features/notifications/ThisPhone';
import { useSettingsEditor } from '@/features/settings/useSettingsEditor';
import { PageProblem } from '@/features/states/PageProblem';
import { loadState } from '@/lib/loading';
import { layout, useTheme } from '@/theme';
import { AppBar } from '@/ui/AppBar';
import { GroupLabel } from '@/ui/Heading';
import { Loading } from '@/ui/Loading';
import { RowGroup, ToggleRow } from '@/ui/Rows';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

const page = words.settings.notificationsPage;

/**
 * Notification settings: what to be told about, and the Sunday summary. Few switches for now; each kind of
 * notification gets its own as it is built.
 */
export default function NotificationSettings() {
  const { colors } = useTheme();
  const { settings, save, change } = useSettingsEditor();
  const load = loadState(settings);
  const s = settings.data;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar title={page.title} trailing={<View style={{ width: 40 }} />} />
      {load.error ? (
        <PageProblem error={load.error} onRetry={load.retry} retrying={load.retrying} />
      ) : !s ? (
        <Loading offline={load.offline} />
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
          {save.isError ? (
            <Txt variant="caption" color="danger" center accessibilityLiveRegion="polite" style={{ marginTop: 8, marginHorizontal: 24 }}>
              {messageFor(save.error)}
            </Txt>
          ) : null}
          <GroupLabel style={{ marginHorizontal: layout.gutter }}>{page.tellMeAbout}</GroupLabel>
          <RowGroup>
            <ToggleRow first label={page.activity.label} note={page.activity.note} value={s.notifyActivity} onChange={(on) => change({ notifyActivity: on })} />
          </RowGroup>
          <GroupLabel style={{ marginHorizontal: layout.gutter }}>{page.onceAWeek}</GroupLabel>
          <RowGroup>
            <ToggleRow first label={page.summary.label} note={page.summary.note} value={s.weeklySummary} onChange={(on) => change({ weeklySummary: on })} />
            <ToggleRow label={page.summaryEmail} value={s.summaryEmail} onChange={(on) => change({ summaryEmail: on })} />
          </RowGroup>
          <ThisPhone />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

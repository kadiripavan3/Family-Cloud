import { View } from 'react-native';

import { messageFor } from '@/api/fetcher';
import { useSettingsEditor } from '@/features/settings/useSettingsEditor';
import { layout } from '@/theme';
import { Loading } from '@/ui/Loading';
import { RowGroup, ToggleRow } from '@/ui/Rows';
import { Sheet } from '@/ui/Sheet';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

const says = words.activity.digest.sheet;

/**
 * The sheet behind the summary's gear: whether it is sent to the phone on Sunday, and whether it comes by
 * email as well. The same two switches as on Notifications; each is saved as it is changed.
 */
export function SummarySheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { settings, save, change } = useSettingsEditor();
  const s = settings.data;
  return (
    <Sheet visible={visible} onClose={onClose} title={says.title} subtitle={says.lead}>
      {save.isError || (settings.isError && !s) ? (
        <Txt variant="caption" color="danger" accessibilityLiveRegion="polite" style={{ paddingHorizontal: layout.gutter, paddingBottom: 8 }}>
          {messageFor(save.isError ? save.error : settings.error)}
        </Txt>
      ) : null}
      {s ? (
        <RowGroup>
          <ToggleRow first label={says.push.label} note={says.push.note} value={s.weeklySummary} onChange={(on) => change({ weeklySummary: on })} />
          <ToggleRow label={says.email.label} note={says.email.note} value={s.summaryEmail} onChange={(on) => change({ summaryEmail: on })} />
        </RowGroup>
      ) : settings.isError ? null : (
        <View style={{ minHeight: 120 }}>
          <Loading offline={settings.isPaused} />
        </View>
      )}
    </Sheet>
  );
}

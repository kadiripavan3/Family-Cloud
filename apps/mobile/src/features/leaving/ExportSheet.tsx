import { useMutation } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { useCache } from '@/api/cache';
import { messageFor } from '@/api/fetcher';
import { askForExport, type CircleResponse, type ExportResponse, type ExportScope, removeExport, useGetExports } from '@/api/generated/homeport';
import { openFile } from '@/features/library/save';
import { formatBytes } from '@/features/library/sizes';
import { formatWeekday, timeAgo, toISODate } from '@/lib/dates';
import { newClientId } from '@/lib/ids';
import { layout, radius, useTheme } from '@/theme';
import { Button } from '@/ui/Button';
import { GroupLabel } from '@/ui/Heading';
import { Tap } from '@/ui/Motion';
import { Segmented } from '@/ui/Segmented';
import { Sheet } from '@/ui/Sheet';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

const says = words.you.leaving.export;
/** While an export is being made, the list is asked for again this often. */
const LOOK_AGAIN_MS = 3000;
const underWay = (one: ExportResponse) => one.state === 'waiting' || one.state === 'working';

/**
 * "Export everything": asks the API for one zip of ordinary files from the current circle (all the person
 * can see there, or only what they made), shows it being made, and fetches it when it is ready. The list is
 * the person's own exports of this circle, at most ten; each is kept for seven days and can be removed sooner.
 */
export function ExportSheet({ visible, onClose, circle }: { visible: boolean; onClose: () => void; circle: CircleResponse }) {
  const cache = useCache();
  const asked = useGetExports(circle.id, {
    query: { enabled: visible, refetchOnMount: 'always', refetchInterval: (query) => (query.state.data?.some(underWay) ? LOOK_AGAIN_MS : false) },
  });
  const exports = asked.data ?? [];
  const [scope, setScope] = useState<ExportScope>('everything');
  // One id for one export: a second tap doesn't make a second one.
  const clientId = useRef(newClientId());
  const make = useMutation({
    mutationFn: () => askForExport(circle.id, { clientId: clientId.current, scope }),
    onSuccess: (made) => {
      clientId.current = newClientId();
      return cache.exportAsked(made);
    },
  });
  const remove = useMutation({ mutationFn: (one: ExportResponse) => removeExport(one.id), onSuccess: (_gone, one) => cache.exportRemoved(one) });
  const problem = make.isError ? make.error : remove.isError ? remove.error : asked.isError && !asked.data ? asked.error : null;

  return (
    <Sheet visible={visible} onClose={onClose} title={words.you.leaving.exportAll.label} subtitle={says.lead(circle.name)}>
      <Segmented
        label={says.scope.label}
        value={scope}
        onChange={setScope}
        options={[
          { id: 'everything', label: says.scope.everything },
          { id: 'mine', label: says.scope.mine },
        ]}
      />
      <View style={{ paddingTop: 12, paddingHorizontal: layout.rowGutter }}>
        <Button label={says.make} size="lg" block loading={make.isPending} disabled={exports.some(underWay)} onPress={() => make.mutate()} />
      </View>
      {problem ? (
        <Txt variant="caption" color="danger" center accessibilityLiveRegion="polite" style={{ marginTop: 10, marginHorizontal: layout.gutter }}>
          {messageFor(problem)}
        </Txt>
      ) : null}
      {exports.length > 0 ? (
        <>
          <GroupLabel style={{ marginHorizontal: layout.gutter }}>{says.yours}</GroupLabel>
          <View style={{ gap: 8, marginHorizontal: layout.barGutter }}>
            {exports.map((one) => (
              <One key={one.id} one={one} removing={remove.isPending && remove.variables.id === one.id} onRemove={() => remove.mutate(one)} />
            ))}
          </View>
        </>
      ) : null}
    </Sheet>
  );
}

/** One export: where it stands, when it was asked for, what was left out, and the way to save or remove it. */
function One({ one, removing, onRemove }: { one: ExportResponse; removing: boolean; onRemove: () => void }) {
  const { colors } = useTheme();
  const what = one.state === 'ready' ? says.ready(one.files, one.bytes === null ? null : formatBytes(one.bytes)) : one.state === 'failed' ? says.failed : says.waiting;
  return (
    <View testID="export" style={{ gap: 4, paddingVertical: 12, paddingHorizontal: 14, borderRadius: radius.photo, backgroundColor: colors.fill }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        {underWay(one) ? <ActivityIndicator color={colors.muted} /> : null}
        <View style={{ flex: 1, gap: 1 }}>
          <Txt variant="item" weight={one.state === 'ready' ? 800 : 600} accessibilityLiveRegion="polite">
            {what}
          </Txt>
          <Txt variant="footnote" color="muted">
            {says.asked(one.scope, timeAgo(one.askedAt))}
          </Txt>
        </View>
        {one.state === 'ready' && one.url ? <Button label={says.save} spoken={says.saveSpoken(what)} size="sm" variant="ink" inline onPress={() => void openFile(one.url ?? '')} /> : null}
        {underWay(one) ? null : (
          <Tap accessibilityRole="button" accessibilityLabel={says.remove} hitSlop={12} disabled={removing} onPress={onRemove} style={{ opacity: removing ? 0.4 : 1 }}>
            <Trash2 size={18} color={colors.muted} />
          </Tap>
        )}
      </View>
      {one.state === 'ready' && one.expiresAt ? (
        <Txt variant="footnote" color="muted">
          {says.keptUntil(formatWeekday(toISODate(new Date(one.expiresAt))))}
        </Txt>
      ) : null}
      {/* What a bound kept out, in the API's own sentences. */}
      {one.leftOut.map((sentence) => (
        <Txt key={sentence} variant="footnote" color="muted">
          {sentence}
        </Txt>
      ))}
    </View>
  );
}

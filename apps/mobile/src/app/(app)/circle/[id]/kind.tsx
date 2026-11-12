import { useMutation } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { RefreshCw } from 'lucide-react-native';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useCache } from '@/api/cache';
import { messageFor } from '@/api/fetcher';
import { changeCircle, type CircleKind } from '@/api/generated/homeport';
import { useCircles } from '@/features/circles/current';
import { headcount } from '@/features/circles/members';
import { NotFound } from '@/features/states/NotFound';
import { layout, useTheme } from '@/theme';
import { AppBar } from '@/ui/AppBar';
import { GroupLabel } from '@/ui/Heading';
import { NoteBox } from '@/ui/NoteBox';
import { RowGroup } from '@/ui/Rows';
import { Segmented } from '@/ui/Segmented';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

/** The kinds a circle can be changed to, in the order of the control. */
const KINDS: readonly CircleKind[] = ['family', 'couple', 'flat', 'crew'];

/**
 * 2.6 What each kind gets: one setting on the circle. The words, who sees what to begin with, the spaces,
 * the templates and the keepsakes all follow it. The six places and the way sharing works stay the same
 * for everyone. The people who run the circle change the kind with the control at the top; changing it
 * deletes nothing.
 */
export default function KindOfCircle() {
  const { colors } = useTheme();
  const cache = useCache();
  const { id } = useLocalSearchParams<{ id: string }>();
  const circle = useCircles().find((one) => one.id === id);
  const change = useMutation({
    mutationFn: (kind: CircleKind) => changeCircle(id, { kind }),
    onSuccess: (saved) => cache.circleChanged(saved),
  });
  if (!circle) return <NotFound />;

  const says = words.circles.kinds;
  // While the change is on its way the screen already shows the kind that was pressed.
  const kind = change.isPending && change.variables ? change.variables : circle.kind;
  const rows = says.rows[kind];
  const lines: [label: string, value: string][] = [
    [says.labels.called, words.kinds[kind].calledFirst],
    [says.labels.begin, rows.begin(headcount(circle).people)],
    [says.labels.spaces, rows.spaces],
    [says.labels.templates, rows.templates],
    [says.labels.keepsakes, rows.keepsakes],
    [says.labels.fair, rows.fair],
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar title={says.title} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        <Segmented label={says.title} options={KINDS.map((one) => ({ id: one, label: words.kinds[one].short }))} value={kind} locked={!circle.iRunIt} onChange={(next) => (next === circle.kind ? undefined : change.mutate(next))} />
        <GroupLabel style={{ marginHorizontal: layout.gutter }}>{says.setUpFor(circle.name, says.forWhom[kind])}</GroupLabel>
        <RowGroup>
          {lines.map(([label, value], index) => (
            <View key={label} style={{ gap: 1, paddingVertical: 11, paddingHorizontal: 16, borderTopWidth: index === 0 ? 0 : 1, borderTopColor: colors.line }}>
              <Txt variant="small" color="muted">
                {label}
              </Txt>
              <Txt variant="item">{value}</Txt>
            </View>
          ))}
        </RowGroup>
        {change.isError ? (
          <Txt variant="caption" color="danger" accessibilityLiveRegion="polite" style={{ marginTop: 10, marginHorizontal: layout.gutter }}>
            {messageFor(change.error)}
          </Txt>
        ) : null}
        {circle.iRunIt ? null : (
          <Txt variant="footnote" color="muted" style={{ marginTop: 10, marginHorizontal: layout.gutter }}>
            {words.circles.settings.notYours}
          </Txt>
        )}
        <NoteBox icon={(c) => <RefreshCw size={20} color={c} />} title={says.note.title} style={{ marginTop: 16, marginHorizontal: layout.barGutter }}>
          {says.note.body}
        </NoteBox>
      </ScrollView>
    </SafeAreaView>
  );
}

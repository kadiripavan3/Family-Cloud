import { useLocalSearchParams } from 'expo-router';
import { Settings } from 'lucide-react-native';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useGetSummary } from '@/api/generated/homeport';
import { WeekHero, WeekRow, WeekStats } from '@/features/digest/parts';
import { SummarySheet } from '@/features/digest/SummarySheet';
import { PageProblem } from '@/features/states/PageProblem';
import { looksLikeId } from '@/features/things/open';
import { loadState } from '@/lib/loading';
import { layout, useTheme } from '@/theme';
import { AppBar } from '@/ui/AppBar';
import { EmptyState } from '@/ui/EmptyState';
import { GroupLabel } from '@/ui/Heading';
import { Loading } from '@/ui/Loading';
import { RoundButton } from '@/ui/RoundButton';
import { Sk } from '@/ui/Skeleton';
import { words } from '@/words';

const says = words.activity.digest;
/** A day as the API takes it. Anything else in the address means "this week". */
const isDay = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);

/**
 * 11.3 The Sunday summary: one circle's week on one page. Its best photo, the numbers across it, what next
 * week holds, and the sections other places add (Journey's news, once the two apps are linked). The Sunday
 * notification opens it at `/summary/<circle>?week=<a day of that week>`; the gear holds its two switches.
 * The API works out all of it, and only from what this person may see.
 */
export default function Summary() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { circleId, week } = useLocalSearchParams<{ circleId: string; week?: string }>();
  const [settings, setSettings] = useState(false);
  const asked = useGetSummary(circleId, isDay(week) ? { week } : undefined, { query: { enabled: looksLikeId(circleId) } });
  const load = loadState(asked);
  const data = asked.data;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar
        title={says.title}
        subtitle={data ? says.under(data.circleName, data.range) : undefined}
        trailing={<RoundButton label={says.settings} icon={(c) => <Settings size={20} color={c} />} onPress={() => setSettings(true)} />}
      />
      {load.error ? (
        <PageProblem error={load.error} onRetry={load.retry} retrying={load.retrying} />
      ) : !data ? (
        load.offline || !looksLikeId(circleId) ? (
          <Loading offline={load.offline} />
        ) : (
          <View accessibilityLabel={words.states.loading} style={{ gap: 14, marginTop: 4, marginHorizontal: layout.barGutter }}>
            <Sk height={186} radius="panel" />
            <Sk height={62} radius="tile" />
            <Sk width={120} height={12} radius="chip" style={{ marginTop: 12 }} />
            <Sk height={48} radius="thumb" />
            <Sk height={48} radius="thumb" />
          </View>
        )
      ) : !data.anything && data.nextWeek.length === 0 && data.sections.length === 0 ? (
        <View style={{ flex: 1, justifyContent: 'center', paddingBottom: 80 }}>
          <EmptyState emoji="🌙" title={says.quiet.title} body={says.quiet.body(data.circleName, data.range)} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 48 }} showsVerticalScrollIndicator={false}>
          {data.hero ? <WeekHero hero={data.hero} /> : null}
          <WeekStats stats={data.stats} />
          {data.nextWeek.length > 0 ? (
            <>
              <GroupLabel style={{ marginHorizontal: layout.gutter }}>{says.nextWeek}</GroupLabel>
              {data.nextWeek.map((row, index) => (
                <WeekRow key={`${row.thingId}-${index}`} row={row} />
              ))}
            </>
          ) : null}
          {data.sections.map((section, at) =>
            section.rows?.length ? (
              <View key={`${section.title}-${at}`}>
                <GroupLabel style={{ marginHorizontal: layout.gutter }}>{section.title}</GroupLabel>
                {section.rows.map((row, index) => (
                  <WeekRow key={`${row.thingId}-${index}`} row={row} />
                ))}
              </View>
            ) : null,
          )}
        </ScrollView>
      )}
      <SummarySheet visible={settings} onClose={() => setSettings(false)} />
    </SafeAreaView>
  );
}

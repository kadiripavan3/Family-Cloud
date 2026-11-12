import { useRouter } from 'expo-router';
import { ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { type GuestPassResponse, useGetGuestPasses } from '@/api/generated/homeport';
import { useCircle } from '@/features/circles/current';
import { PersonRow } from '@/features/people/PersonRow';
import { PageProblem } from '@/features/states/PageProblem';
import { formatSpan } from '@/lib/dates';
import { loadState } from '@/lib/loading';
import { layout, useTheme } from '@/theme';
import { AppBar } from '@/ui/AppBar';
import { ListSkeleton } from '@/ui/Skeleton';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

/** Whether a pass is running, over, or still to start. */
function statusOf(pass: GuestPassResponse): string {
  const says = words.people.pass.status;
  if (pass.running) return says.running;
  return new Date(pass.startsAt) > new Date() ? says.later : says.ended;
}

/** 4.5 The guest passes of the current circle, the latest first, and the way to a new one. */
export default function GuestPasses() {
  const { colors } = useTheme();
  const router = useRouter();
  const circle = useCircle();
  const asked = useGetGuestPasses(circle.id);
  const load = loadState(asked);
  const passes = asked.data;
  const says = words.people.pass;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar title={says.list} subtitle={circle.name} />
      {load.error ? (
        <PageProblem error={load.error} onRetry={load.retry} retrying={load.retrying} inset={false} />
      ) : !passes ? (
        <ListSkeleton count={3} />
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
          <Txt variant="callout" color="muted" style={{ marginTop: 4, marginBottom: 8, marginHorizontal: layout.gutter }}>
            {says.listLead}
          </Txt>
          {passes.map((pass) => {
            const when = formatSpan(pass.startsAt, pass.endsAt);
            const status = statusOf(pass);
            return (
              <PersonRow
                key={pass.id}
                name={pass.guestName}
                line={words.common.join([status, when])}
                spoken={says.row(pass.guestName, when, status)}
                onPress={() => router.push({ pathname: '/guest-pass/[id]', params: { id: pass.id } })}
              />
            );
          })}
          {passes.length === 0 ? (
            <Txt variant="callout" color="muted" style={{ marginVertical: 8, marginHorizontal: layout.gutter }}>
              {says.none}
            </Txt>
          ) : null}
          <PersonRow add name={says.new.label} line={says.new.note} onPress={() => router.push('/guest-pass/new')} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

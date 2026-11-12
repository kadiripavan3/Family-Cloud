import { useMutation } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { CalendarDays, Euro, File, Image as Picture, Lock } from 'lucide-react-native';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useCache } from '@/api/cache';
import { messageFor } from '@/api/fetcher';
import { changeMember, type MemberChangeRequest, type MemberResponse, type PersonPageResponse, useGetPerson } from '@/api/generated/homeport';
import { useCircles } from '@/features/circles/current';
import { membersOf } from '@/features/circles/members';
import { GIVEN_ROLES } from '@/features/people/RoleSheet';
import { PageProblem } from '@/features/states/PageProblem';
import { loadState } from '@/lib/loading';
import { firstName } from '@/lib/names';
import { layout, useTheme } from '@/theme';
import { AppBar } from '@/ui/AppBar';
import { GroupLabel } from '@/ui/Heading';
import { NoteBox } from '@/ui/NoteBox';
import { Row, RowGroup } from '@/ui/Rows';
import { Segmented } from '@/ui/Segmented';
import { ListSkeleton } from '@/ui/Skeleton';
import { Toggle } from '@/ui/Toggle';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

/**
 * 4.6 A child's view: what one child or teen of a family sees. Children get the fun parts and none of the
 * worry: photos, the calendar, their own lists. Money and the Vault stay shut for them (and are drawn that
 * way, not hidden). The role control changes Child, Teen and Adult; the three switches say what a child or
 * a teen may see. Only the adults who run the circle can change any of it.
 */
export default function PersonAccess() {
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const asked = useGetPerson(id);
  const load = loadState(asked);
  const data = asked.data;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar title={data ? firstName(data.member.name) : undefined} />
      {load.error ? <PageProblem error={load.error} onRetry={load.retry} retrying={load.retrying} inset={false} /> : !data ? <ListSkeleton count={5} /> : <Loaded data={data} />}
    </SafeAreaView>
  );
}

function Loaded({ data }: { data: PersonPageResponse }) {
  const cache = useCache();
  const { member, kept } = data;
  const circle = useCircles().find((one) => one.id === member.circleId);
  const says = words.people.access;
  const name = firstName(member.name);
  // Roles are a family's, and the owner's own is not one of the three.
  const canChange = !!circle?.iRunIt && !!circle.hasRoles && member.role !== 'owner';
  const young = member.role === 'child' || member.role === 'teen';
  const role = member.role === 'adult' || member.role === 'teen' || member.role === 'child' ? member.role : 'adult';

  const change = useMutation({
    mutationFn: (what: MemberChangeRequest) => changeMember(member.id, what),
    onSuccess: (saved: MemberResponse) => cache.memberSaved(saved),
  });
  const sees = (what: 'seesLibrary' | 'seesPlan' | 'seesPages', label: string) => (
    <View style={{ opacity: canChange ? 1 : 0.45 }} pointerEvents={canChange ? 'auto' : 'none'}>
      <Toggle label={label} value={member[what]} onChange={(on) => change.mutate({ [what]: on })} />
    </View>
  );
  const shut = (label: string) => (
    <View style={{ opacity: 0.45 }} pointerEvents="none">
      <Toggle label={label} value={false} onChange={() => undefined} />
    </View>
  );
  const pages = kept.filter((thing) => thing.kind === 'page').length;
  // The other adults of the family: they are asked too before something leaves the circle.
  const adults = circle ? membersOf(circle).filter((one) => !one.you && (one.role === 'owner' || one.role === 'adult') && one.kind === 'person').map((one) => firstName(one.name)) : [];
  const offFor = member.role === 'teen' ? says.offFor.teen : says.offFor.child;

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
      <Segmented label={says.role} options={GIVEN_ROLES.slice().reverse().map((one) => ({ id: one, label: words.people.roles[one] }))} value={role} locked={!canChange} onChange={(next) => change.mutate({ role: next })} />

      {young ? (
        <>
          <GroupLabel style={{ marginHorizontal: layout.gutter }}>{says.can(name)}</GroupLabel>
          <RowGroup>
            <Row first icon={(c) => <Picture size={18} color={c} />} label={says.library.label} note={says.library.note} trailing={sees('seesLibrary', says.library.label)} />
            <Row icon={(c) => <CalendarDays size={18} color={c} />} label={says.plan.label} note={says.plan.note} trailing={sees('seesPlan', says.plan.label)} />
            <Row icon={(c) => <File size={18} color={c} />} label={says.pages.label} note={says.pages.note(pages)} trailing={sees('seesPages', says.pages.label)} />
            <Row icon={(c) => <Euro size={18} color={c} />} label={says.money} note={offFor} trailing={shut(says.money)} />
            <Row icon={(c) => <Lock size={18} color={c} />} label={says.vault} note={offFor} trailing={shut(says.vault)} />
          </RowGroup>
          <GroupLabel style={{ marginHorizontal: layout.gutter }}>{says.leaving}</GroupLabel>
          <RowGroup>
            <Row first label={says.outside.label} note={says.outside.note(adults)} value={says.outside.value} />
            {member.role === 'child' ? <Row label={says.becomes.label} note={says.becomes.note} value={says.becomes.value} /> : <Row label={says.becomesAdult.label} note={says.becomesAdult.note} value={says.becomesAdult.value} />}
          </RowGroup>
        </>
      ) : (
        <NoteBox icon={(c) => <Lock size={20} color={c} />} style={{ marginTop: 16, marginHorizontal: layout.barGutter }}>
          {says.adult(circle?.name ?? '')}
        </NoteBox>
      )}
      {canChange ? null : (
        <Txt variant="footnote" color="muted" style={{ marginTop: 14, marginHorizontal: layout.gutter }}>
          {says.notYours}
        </Txt>
      )}
      {change.isError ? (
        <Txt variant="caption" color="danger" accessibilityLiveRegion="polite" style={{ marginTop: 10, marginHorizontal: layout.gutter }}>
          {messageFor(change.error)}
        </Txt>
      ) : null}
    </ScrollView>
  );
}

import { useMutation } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Cake, Camera, Ellipsis, Pencil, ShieldCheck, UserMinus } from 'lucide-react-native';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useCache } from '@/api/cache';
import { messageFor } from '@/api/fetcher';
import { changeMember, type CircleResponse, type MemberResponse, type PersonPageResponse, removeMember, useGetPerson } from '@/api/generated/homeport';
import { uploadPhoto } from '@/api/upload';
import { useCircles } from '@/features/circles/current';
import { pickSquarePhoto } from '@/features/media/pick';
import { placeHref } from '@/features/home/places';
import { useLeave } from '@/features/navigation/useLeave';
import { FactsSheet } from '@/features/people/FactsSheet';
import { ComingUp } from '@/features/plan/ComingUp';
import { PageProblem } from '@/features/states/PageProblem';
import { ThingRow } from '@/features/things/ThingRow';
import { ageOn, formatDayLong, formatWeekday, nextBirthday, today } from '@/lib/dates';
import { loadState } from '@/lib/loading';
import { firstName } from '@/lib/names';
import { layout, radius, useTheme } from '@/theme';
import { AppBar } from '@/ui/AppBar';
import { Avatar } from '@/ui/Avatar';
import { ConfirmSheet } from '@/ui/ConfirmSheet';
import { DayPicker } from '@/ui/DayPicker';
import { Emoji } from '@/ui/Emoji';
import { GroupLabel } from '@/ui/Heading';
import { Tap } from '@/ui/Motion';
import { NoteBox } from '@/ui/NoteBox';
import { RoundButton } from '@/ui/RoundButton';
import { RowGroup } from '@/ui/Rows';
import { Sheet, SheetRow } from '@/ui/Sheet';
import { Sk } from '@/ui/Skeleton';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

/** The picture on the note about a birthday. */
const CAKE = <Emoji char="🎂" size={26} />;

/** The line under the name: how old they are, and what they are to the circle. */
function about(member: MemberResponse, circle: CircleResponse | undefined): string {
  const says = words.people.person;
  const circleName = circle?.name ?? '';
  if (member.kind === 'pet') return says.petIn(member.about, circleName);
  const age = member.birthday ? says.years(ageOn(member.birthday)) : null;
  return words.common.join([age, circle?.hasRoles ? says.roleIn(words.people.roles[member.role], circleName) : says.in(circleName)]);
}

/**
 * 4.2 A person's page: everything about one person of the circle in one place. Who they are, their
 * birthday when it is known, the short facts the circle keeps about them, and what is kept for them that
 * the reader may see. It builds itself from what the circle already keeps. The people who run the circle
 * can change the picture, the birthday and the role, and take the person out of the circle.
 */
export default function Person() {
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const asked = useGetPerson(id);
  const load = loadState(asked);
  const data = asked.data;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      {load.error ? (
        <>
          <AppBar />
          <PageProblem error={load.error} onRetry={load.retry} retrying={load.retrying} inset={false} />
        </>
      ) : !data ? (
        <>
          <AppBar />
          {/* Grey shapes in the layout that is coming: the picture and the name, a note, a few rows. */}
          <View accessibilityLabel={words.states.loading} style={{ gap: 14, marginTop: 2, paddingHorizontal: layout.rowGutter }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
              <Sk width={84} height={84} radius="pill" />
              <View style={{ flex: 1, gap: 10 }}>
                <Sk width="55%" height={28} />
                <Sk width="75%" height={13} />
              </View>
            </View>
            <Sk height={62} radius="photo" />
            <Sk height={150} radius="card" style={{ marginTop: 12 }} />
          </View>
        </>
      ) : (
        <Loaded data={data} />
      )}
    </SafeAreaView>
  );
}

function Loaded({ data }: { data: PersonPageResponse }) {
  const { colors } = useTheme();
  const router = useRouter();
  const cache = useCache();
  const leave = useLeave();
  const { member, kept } = data;
  const circle = useCircles().find((one) => one.id === member.circleId);
  const [menu, setMenu] = useState(false);
  const [editingFacts, setEditingFacts] = useState(false);
  const [pickingDay, setPickingDay] = useState(false);
  const [removing, setRemoving] = useState(false);
  const says = words.people.person;
  const name = firstName(member.name);
  // The people who run the circle look after its people. Nobody changes the owner here, or removes themselves.
  const canChange = !!circle?.iRunIt;
  const canRemove = canChange && member.role !== 'owner' && !member.you;

  const change = useMutation({
    mutationFn: async (what: { birthday?: string; removeBirthday?: boolean; picture?: boolean }) => {
      if (!what.picture) return changeMember(member.id, what);
      const photo = await pickSquarePhoto();
      return photo ? changeMember(member.id, { avatarMediaId: await uploadPhoto(photo) }) : member;
    },
    onSuccess: (saved) => cache.memberSaved(saved),
  });
  const remove = useMutation({
    mutationFn: () => removeMember(member.id),
    onSuccess: () => {
      setRemoving(false);
      leave();
      void cache.memberRemoved(member);
    },
  });

  // What is coming up is Plan's own piece, from the calendar; their photos and videos are one row; the rest is kept for them.
  const photos = kept.filter((thing) => thing.kind === 'photo' || thing.kind === 'video');
  const rest = kept.filter((thing) => thing.kind !== 'photo' && thing.kind !== 'video' && thing.kind !== 'event' && thing.kind !== 'reminder');
  const birthday = member.birthday ? nextBirthday(member.birthday) : null;
  // A plan that is hidden from them today is theirs to be surprised by.
  const hiddenPlan = kept.some((thing) => thing.chip?.hiddenFrom?.includes(name));

  return (
    <>
      <AppBar trailing={canChange ? <RoundButton label={says.more} icon={(c) => <Ellipsis size={20} color={c} />} onPress={() => setMenu(true)} /> : undefined} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 2, marginBottom: 16, marginHorizontal: layout.rowGutter }}>
          <Avatar uri={member.avatarUrl} name={member.name} size={84} />
          <View style={{ flex: 1 }}>
            <Txt variant="heading" accessibilityRole="header" numberOfLines={2}>
              {name}
            </Txt>
            <Txt variant="note" weight={600} color="muted">
              {about(member, circle)}
            </Txt>
          </View>
        </View>

        {birthday && member.birthday ? (
          <NoteBox soft icon={() => CAKE} title={says.birthday.in(birthday.inDays)} style={{ marginHorizontal: layout.barGutter }}>
            {words.common.join([formatWeekday(birthday.day), says.birthday.turns(ageOn(member.birthday, birthday.day)), hiddenPlan ? says.birthday.hidden(name) : null])}
          </NoteBox>
        ) : null}

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12, marginHorizontal: layout.rowGutter }}>
          {member.facts.map((fact) => (
            <View key={fact} style={{ paddingVertical: 7, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: colors.fill }}>
              <Txt variant="caption" weight={700}>
                {fact}
              </Txt>
            </View>
          ))}
          {canChange ? (
            <Tap
              accessibilityRole="button"
              accessibilityLabel={member.facts.length ? says.facts.edit : says.facts.add}
              hitSlop={6}
              onPress={() => setEditingFacts(true)}
              scaleTo={0.94}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 11, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.line }}>
              <Pencil size={13} color={colors.muted} />
              <Txt variant="caption" weight={700} color="muted">
                {member.facts.length ? says.facts.edit : says.facts.add}
              </Txt>
            </Tap>
          ) : null}
        </View>

        <GroupLabel style={{ marginHorizontal: layout.gutter }}>{says.comingUp}</GroupLabel>
        <ComingUp member={member} />

        <GroupLabel style={{ marginHorizontal: layout.gutter }}>{member.you ? says.keptYou : says.kept(name)}</GroupLabel>
        {rest.length || photos.length ? (
          <RowGroup>
            {rest.map((thing, index) => (
              <ThingRow key={thing.id} look="grouped" first={index === 0} thing={thing} />
            ))}
            {/* Their photos and videos are one row, as in the drawing; the Library is where they are looked through. */}
            {photos.length ? (
              <ThingRow look="grouped" first={rest.length === 0} thing={{ kind: 'album', title: says.photos(photos.length, name), glance: says.photosNote }} onPress={() => router.navigate(placeHref('library'))} />
            ) : null}
          </RowGroup>
        ) : (
          <Txt variant="callout" color="muted" style={{ marginHorizontal: layout.gutter }}>
            {says.keptEmpty(name)}
          </Txt>
        )}
        {change.isError ? (
          <Txt variant="caption" color="danger" accessibilityLiveRegion="polite" style={{ marginTop: 14, marginHorizontal: layout.gutter }}>
            {messageFor(change.error)}
          </Txt>
        ) : null}
      </ScrollView>

      <Sheet visible={menu} onClose={() => setMenu(false)} title={says.menu.title(name)}>
        <SheetRow
          first
          icon={(c) => <Camera size={22} color={c} />}
          label={says.menu.picture}
          onPress={() => {
            setMenu(false);
            change.mutate({ picture: true });
          }}
        />
        {member.kind === 'pet' ? null : (
          <SheetRow
            icon={(c) => <Cake size={22} color={c} />}
            label={says.menu.birthday}
            note={member.birthday ? formatDayLong(member.birthday) : says.menu.birthdayNone}
            onPress={() => {
              setMenu(false);
              setPickingDay(true);
            }}
          />
        )}
        {member.birthday ? (
          <SheetRow
            label={says.menu.removeBirthday}
            onPress={() => {
              setMenu(false);
              change.mutate({ removeBirthday: true });
            }}
          />
        ) : null}
        {circle?.hasRoles && member.kind !== 'pet' && member.role !== 'owner' ? (
          <SheetRow
            icon={(c) => <ShieldCheck size={22} color={c} />}
            label={says.menu.role}
            note={words.people.roles[member.role]}
            onPress={() => {
              setMenu(false);
              router.push({ pathname: '/person/[id]/access', params: { id: member.id } });
            }}
          />
        ) : null}
        {canRemove ? (
          <SheetRow
            danger
            icon={(c) => <UserMinus size={22} color={c} />}
            label={says.menu.remove(circle?.name ?? '')}
            onPress={() => {
              setMenu(false);
              setRemoving(true);
            }}
          />
        ) : null}
      </Sheet>
      <FactsSheet member={member} visible={editingFacts} onClose={() => setEditingFacts(false)} />
      <DayPicker visible={pickingDay} onClose={() => setPickingDay(false)} title={says.menu.birthdayTitle(name)} value={member.birthday ?? today()} max={today()} byYear onChange={(day) => change.mutate({ birthday: day })} />
      <ConfirmSheet
        visible={removing}
        onClose={() => setRemoving(false)}
        title={says.removeAsk.title(name, circle?.name ?? '')}
        body={says.removeAsk.body(name)}
        confirm={says.removeAsk.confirm(name)}
        busy={remove.isPending}
        problem={remove.isError ? messageFor(remove.error) : null}
        onConfirm={() => remove.mutate()}
      />
    </>
  );
}

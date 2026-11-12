import { useMutation } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Link } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { useCache } from '@/api/cache';
import { ApiError, messageFor } from '@/api/fetcher';
import { changeCircle, type CircleResponse, type MemberResponse } from '@/api/generated/homeport';
import { useCircles } from '@/features/circles/current';
import { membersOf } from '@/features/circles/members';
import { SetupFrame } from '@/features/circles/SetupFrame';
import { AddSomeoneSheet } from '@/features/people/AddSomeoneSheet';
import { PersonRow } from '@/features/people/PersonRow';
import { RoleSheet } from '@/features/people/RoleSheet';
import { NotFound } from '@/features/states/NotFound';
import { firstName } from '@/lib/names';
import { layout } from '@/theme';
import { Button } from '@/ui/Button';
import { Field } from '@/ui/Field';
import { Heading } from '@/ui/Heading';
import { LinkBox } from '@/ui/LinkBox';
import { SelectPill } from '@/ui/SelectPill';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

/** The line under each person while the circle is being set up: who they are to it, and whether they need a phone. */
function line(member: MemberResponse, circle: CircleResponse): string {
  const says = words.setup.people;
  if (member.role === 'owner') return circle.hasRoles ? says.owner : says.started;
  if (member.status === 'invited') return says.invited;
  if (member.kind === 'pet') return member.about || says.noPhone;
  return member.kind === 'child' ? says.noPhoneChild : says.noPhone;
}

/**
 * 2.2 Name it and invite people. Step 2 of 3. An adult is invited by email; a child or a pet is added
 * without a phone, and a parent looks after their things. Roles (only in a family) decide what each person
 * sees by default. The link lets anyone who has it join.
 */
export default function CirclePeople() {
  const router = useRouter();
  const cache = useCache();
  const { circle: circleId } = useLocalSearchParams<{ circle: string }>();
  const circle = useCircles().find((one) => one.id === circleId);
  const [typed, setTyped] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [roleOf, setRoleOf] = useState<string | null>(null);

  const name = typed ?? circle?.name ?? '';
  const next = () => router.push({ pathname: '/setup/bring-in', params: { circle: circleId } });
  const save = useMutation({
    mutationFn: () => changeCircle(circleId, { name: name.trim() }),
    onSuccess: async (saved) => {
      await cache.circleChanged(saved);
      next();
    },
  });
  if (!circle) return <NotFound />;

  const failed = save.error instanceof ApiError ? save.error : null;
  const members = membersOf(circle);
  const choosing = members.find((member) => member.id === roleOf);

  return (
    <SetupFrame
      step={2}
      footer={
        <>
          {save.isError && !failed?.fields.name ? (
            <Txt variant="caption" color="danger" center accessibilityLiveRegion="polite">
              {messageFor(save.error)}
            </Txt>
          ) : null}
          <Button label={words.common.continue} size="lg" block disabled={name.trim().length === 0} loading={save.isPending} onPress={() => (name.trim() === circle.name ? next() : save.mutate())} />
        </>
      }>
      <View style={{ paddingHorizontal: layout.rowGutter }}>
        <Heading style={{ marginTop: 6, marginBottom: 16 }}>{words.setup.people.title}</Heading>
        <Field label={words.setup.people.name} value={name} onChangeText={setTyped} maxLength={40} autoCapitalize="words" error={failed?.fields.name} />
      </View>
      <View style={{ marginTop: 8 }}>
        {members.map((member) => (
          <PersonRow
            key={member.id}
            name={member.name}
            avatarUrl={member.avatarUrl}
            you={member.you}
            line={line(member, circle)}
            trailing={
              // Only a family has roles; the owner's is fixed, and a pet has none.
              circle.hasRoles && member.role !== 'owner' && member.kind !== 'pet' ? (
                <SelectPill label={words.people.roles[member.role]} spoken={words.setup.people.role(firstName(member.name), words.people.roles[member.role])} onPress={() => setRoleOf(member.id)} />
              ) : undefined
            }
          />
        ))}
        <PersonRow add name={words.setup.people.add.label} line={words.setup.people.add.note} onPress={() => setAdding(true)} />
      </View>
      {circle.joinUrl ? <LinkBox url={circle.joinUrl} copyLabel={words.setup.people.copyLink} icon={(c) => <Link size={18} color={c} />} style={{ marginTop: 14, marginHorizontal: layout.barGutter }} /> : null}
      <AddSomeoneSheet circle={circle} visible={adding} onClose={() => setAdding(false)} />
      {choosing ? <RoleSheet member={choosing} visible onClose={() => setRoleOf(null)} /> : null}
    </SetupFrame>
  );
}

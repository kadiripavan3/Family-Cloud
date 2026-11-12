import { useRouter } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useCircle, useCircles, useSwitchCircle } from '@/features/circles/current';
import { membersOf } from '@/features/circles/members';
import { TAB_BAR_ROOM } from '@/features/home/places';
import { AddSomeoneSheet } from '@/features/people/AddSomeoneSheet';
import { InviteSheet } from '@/features/people/InviteSheet';
import { memberLine } from '@/features/people/lines';
import { PersonRow } from '@/features/people/PersonRow';
import { layout, useTheme } from '@/theme';
import { Chip } from '@/ui/Chip';
import { GroupLabel } from '@/ui/Heading';
import { rich } from '@/ui/rich';
import { RoundButton } from '@/ui/RoundButton';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

/** "March 2024": the month a circle was started. */
function since(createdAt: string): string {
  const date = new Date(createdAt);
  return words.dates.month(date.getMonth(), date.getFullYear());
}

/**
 * 4.1 People: the second tab. A circle is a short list: who is in it, what role they have, and a way in for
 * someone new. The chips at the top change the circle, here and everywhere else. Each person opens their
 * own page; "Invite someone" adds someone, gives the link to join, or makes a guest pass.
 */
export default function People() {
  const { colors } = useTheme();
  const router = useRouter();
  const circles = useCircles();
  const circle = useCircle();
  const switchTo = useSwitchCircle();
  const [inviting, setInviting] = useState(false);
  const [adding, setAdding] = useState(false);
  const kind = words.kinds[circle.kind];
  // The people who run a circle add to it; everyone can see who is in it.
  const canInvite = circle.iRunIt;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: TAB_BAR_ROOM }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 6, paddingBottom: 12, paddingLeft: layout.rowGutter, paddingRight: layout.barGutter }}>
          <Txt variant="heading" accessibilityRole="header">
            {words.people.title}
          </Txt>
          {canInvite ? <RoundButton label={words.people.invite} icon={(c) => <Plus size={20} color={c} />} onPress={() => setInviting(true)} /> : null}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: layout.barGutter }}>
          {circles.map((one) => (
            <Chip key={one.id} tone="filter" emoji={words.kinds[one.kind].emoji} label={one.name} selected={one.id === circle.id} onPress={() => switchTo(one.id)} />
          ))}
        </ScrollView>

        <Txt variant="note" color="muted" style={{ marginTop: 14, marginBottom: 2, marginHorizontal: layout.rowGutter }}>
          {rich(words.people.summary(kind.name, since(circle.createdAt), circle.shared), {
            bold: (text) => (
              <Txt variant="note" weight={700}>
                {text}
              </Txt>
            ),
          })}
        </Txt>

        <GroupLabel style={{ marginHorizontal: layout.gutter }}>{words.people.inThisCircle}</GroupLabel>
        {membersOf(circle).map((member) => {
          const line = memberLine(member, circle);
          return (
            <PersonRow
              key={member.id}
              name={member.name}
              avatarUrl={member.avatarUrl}
              you={member.you}
              line={line}
              spoken={words.people.line.open(member.name, line)}
              // (A person's own row in the drawing has no arrow: their own page is the last tab.)
              onPress={member.you ? undefined : () => router.push({ pathname: '/person/[id]', params: { id: member.id } })}
            />
          );
        })}
        {canInvite ? <PersonRow add name={words.people.invite} line={words.people.inviteNote} onPress={() => setInviting(true)} /> : null}
      </ScrollView>

      <InviteSheet circle={circle} visible={inviting} onClose={() => setInviting(false)} onAdd={() => setAdding(true)} />
      <AddSomeoneSheet circle={circle} visible={adding} onClose={() => setAdding(false)} />
    </SafeAreaView>
  );
}

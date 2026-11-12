import { useLocalSearchParams, useRouter } from 'expo-router';
import { View } from 'react-native';

import { useGetMe } from '@/api/generated/homeport';
import { type BringIn, bringInKey, NOTHING_YET } from '@/features/circles/bringIn';
import { useCircles } from '@/features/circles/current';
import { membersOf } from '@/features/circles/members';
import { SetupFrame } from '@/features/circles/SetupFrame';
import { useFinishSetup } from '@/features/circles/useFinishSetup';
import { NotFound } from '@/features/states/NotFound';
import { firstName } from '@/lib/names';
import { useKept } from '@/lib/useKept';
import { layout } from '@/theme';
import { Blob } from '@/ui/Blob';
import { Button } from '@/ui/Button';
import { Heading, Lead } from '@/ui/Heading';
import { MoreRow } from '@/ui/MoreRow';
import { words } from '@/words';

/**
 * 2.4 All set. The circle exists. Three first things to do, each one tap, so Home is never a blank page:
 * something for the calendar, a template, a first password. Each opens on top of Home, so closing it lands
 * there too.
 */
export default function Ready() {
  const router = useRouter();
  const finish = useFinishSetup();
  const { circle: circleId } = useLocalSearchParams<{ circle: string }>();
  const circle = useCircles().find((one) => one.id === circleId);
  const account = useGetMe().data?.id;
  const [bringing] = useKept<BringIn>(bringInKey(account), NOTHING_YET);
  if (!circle) return <NotFound />;

  const says = words.setup.ready;
  const invited = membersOf(circle)
    .filter((member) => member.status === 'invited')
    .map((member) => firstName(member.name));
  /** Home first, then the shortcut on top of it. */
  const go = (then: Parameters<typeof router.push>[0]) => {
    finish();
    // (Home takes this screen's place a moment after sign-up ends: the shortcut opens once it is there.)
    setTimeout(() => router.push(then), 0);
  };

  return (
    <SetupFrame back={false} footer={<Button label={words.common.goHome} size="lg" block onPress={finish} />}>
      <View style={{ alignItems: 'center', marginTop: 40, marginBottom: 6 }}>
        <Blob emoji="🏡" size={140} />
      </View>
      <View style={{ paddingHorizontal: layout.rowGutter, marginBottom: 4 }}>
        <Heading center style={{ marginTop: 6 }}>
          {says.title(circle.name)}
        </Heading>
        <Lead center>{says.lead(invited, bringing.photos || bringing.journey || bringing.calendars)}</Lead>
      </View>
      <MoreRow emoji="📅" title={says.week[circle.kind].label} rest={says.week[circle.kind].rest} onPress={() => go('/new/event')} />
      <MoreRow emoji="📓" title={says.template.label} rest={says.template.rest[circle.kind]} onPress={() => go('/templates')} />
      <MoreRow emoji="🔑" title={says.password.label} rest={says.password.rest} onPress={() => go('/new/password')} />
    </SetupFrame>
  );
}

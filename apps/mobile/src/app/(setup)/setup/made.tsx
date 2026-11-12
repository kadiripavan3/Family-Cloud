import { useLocalSearchParams, useRouter } from 'expo-router';
import { File, Folder, Gift, type LucideIcon, Type, Users } from 'lucide-react-native';
import { View } from 'react-native';

import { useCircles } from '@/features/circles/current';
import { SetupFrame } from '@/features/circles/SetupFrame';
import { NotFound } from '@/features/states/NotFound';
import { Blob } from '@/ui/Blob';
import { Button } from '@/ui/Button';
import { Row, RowGroup } from '@/ui/Rows';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

const ICONS: Record<string, LucideIcon> = { type: Type, users: Users, folder: Folder, file: File, gift: Gift };

/**
 * 2.5 Made for your kind of circle. Choosing a kind does real work: a couple gets its own words, starter
 * spaces, templates and keepsakes; a flat or a group of friends gets different ones. Shown after choosing
 * Couple, Housemates or Friends, between the first step and the second.
 */
export default function CircleMade() {
  const router = useRouter();
  const { circle: circleId } = useLocalSearchParams<{ circle: string }>();
  const circle = useCircles().find((one) => one.id === circleId);
  const kind = circle?.kind;
  if (!circle || (kind !== 'couple' && kind !== 'flat' && kind !== 'crew')) return <NotFound />;
  const says = words.setup.made[kind];

  return (
    <SetupFrame
      step={1}
      footer={
        <>
          <Button label={words.common.continue} size="lg" block onPress={() => router.push({ pathname: '/setup/people', params: { circle: circle.id } })} />
          <Txt variant="small" weight={500} color="muted" center>
            {words.setup.made.fine}
          </Txt>
        </>
      }>
      <View style={{ alignItems: 'center', gap: 4, marginTop: 6, marginBottom: 18, marginHorizontal: 24 }}>
        <Blob emoji={words.kinds[kind].emoji} size={120} />
        <Txt variant="titleLarge" accessibilityRole="header" center style={{ marginTop: 12 }}>
          {says.title}
        </Txt>
        <Txt variant="note" weight={600} color="muted" center>
          {words.setup.made.because(words.kinds[kind].name)}
        </Txt>
      </View>
      <RowGroup>
        {says.rows.map((row, index) => {
          const Icon = ICONS[row.icon] ?? File;
          return <Row key={row.label} first={index === 0} icon={(c) => <Icon size={18} color={c} />} label={row.label} note={row.note} />;
        })}
      </RowGroup>
    </SetupFrame>
  );
}

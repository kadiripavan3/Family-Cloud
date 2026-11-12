import { useRouter } from 'expo-router';
import { ChevronRight, Plus } from 'lucide-react-native';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useCircle, useCircles } from '@/features/circles/current';
import { circleLine } from '@/features/circles/members';
import { layout, radius, useTheme } from '@/theme';
import { AppBar } from '@/ui/AppBar';
import { Emoji } from '@/ui/Emoji';
import { Tap } from '@/ui/Motion';
import { Photo } from '@/ui/Photo';
import { SheetRow } from '@/ui/Sheet';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

/**
 * "Your circles", from You: every circle the person is in, with its kind and its people. Each opens its own
 * settings (name, kind, people, guest passes, the link to join). The sheet behind Home's round button is
 * where the current circle is changed; this is where a circle itself is.
 */
export default function YourCircles() {
  const { colors } = useTheme();
  const router = useRouter();
  const circles = useCircles();
  const current = useCircle();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar title={words.circles.yours.title} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 4, paddingBottom: 40 }}>
        {circles.map((circle) => {
          const line = circleLine(circle);
          return (
            <Tap
              key={circle.id}
              accessibilityRole="button"
              accessibilityLabel={words.circles.yours.open(circle.name, line)}
              aria-current={circle.id === current.id}
              onPress={() => router.push({ pathname: '/circle/[id]', params: { id: circle.id } })}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4, marginBottom: 8, marginHorizontal: layout.barGutter, padding: 10, borderRadius: radius.card, backgroundColor: colors.fill }}>
              <Photo uri={circle.coverUrl} radius="thumb" style={{ width: 56, height: 56, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.fill2 }}>
                {circle.coverUrl ? null : <Emoji char={words.kinds[circle.kind].emoji} size={30} />}
              </Photo>
              <View style={{ flex: 1 }}>
                <Txt variant="item" weight={800} numberOfLines={1}>
                  {circle.name}
                </Txt>
                <Txt variant="footnote" color="muted" numberOfLines={1}>
                  {line}
                </Txt>
              </View>
              <ChevronRight size={18} color={colors.muted} />
            </Tap>
          );
        })}
        <SheetRow first icon={(c) => <Plus size={22} color={c} />} label={words.circles.yours.newCircle.label} note={words.circles.yours.newCircle.note} trailing={<ChevronRight size={18} color={colors.muted} />} onPress={() => router.push('/setup')} />
      </ScrollView>
    </SafeAreaView>
  );
}

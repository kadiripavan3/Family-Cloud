import { Check } from 'lucide-react-native';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { layout, useTheme } from '@/theme';
import { type Appearance, setAppearance, useAppearance } from '@/theme/appearance';
import { AppBar } from '@/ui/AppBar';
import { GroupLabel } from '@/ui/Heading';
import { Row, RowGroup } from '@/ui/Rows';
import { words } from '@/words';

const CHOICES: { id: Appearance; label: string; note: string }[] = [
  { id: 'system', ...words.settings.appearancePage.choices.system },
  { id: 'light', ...words.settings.appearancePage.choices.light },
  { id: 'dark', ...words.settings.appearancePage.choices.dark },
];

/** Appearance: light, dark, or whatever the phone is set to. */
export default function AppearanceSettings() {
  const { colors } = useTheme();
  const appearance = useAppearance();
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar title={words.settings.appearancePage.title} trailing={<View style={{ width: 40 }} />} />
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
        <GroupLabel style={{ marginHorizontal: layout.gutter }}>{words.settings.appearancePage.theme}</GroupLabel>
        <RowGroup>
          {CHOICES.map((choice, index) => (
            <Row
              key={choice.id}
              first={index === 0}
              label={choice.label}
              note={choice.note}
              onPress={() => setAppearance(choice.id)}
              trailing={choice.id === appearance ? <Check size={20} color={colors.text} strokeWidth={2.6} /> : <View />}
            />
          ))}
        </RowGroup>
      </ScrollView>
    </SafeAreaView>
  );
}

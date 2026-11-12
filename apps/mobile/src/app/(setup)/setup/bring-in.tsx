import { useLocalSearchParams, useRouter } from 'expo-router';
import { CalendarDays, ChevronRight, File, Image as Picture, KeyRound, Lock, Route } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { useGetMe } from '@/api/generated/homeport';
import { type BringIn, bringInKey, NOTHING_YET } from '@/features/circles/bringIn';
import { SetupFrame } from '@/features/circles/SetupFrame';
import { useKept } from '@/lib/useKept';
import { layout, useTheme } from '@/theme';
import { BarLink } from '@/ui/AppBar';
import { Button } from '@/ui/Button';
import { Heading, Lead } from '@/ui/Heading';
import { NoteBox } from '@/ui/NoteBox';
import { Row, RowGroup } from '@/ui/Rows';
import { Toggle } from '@/ui/Toggle';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

/**
 * 2.3 Bring your things in. Step 3 of 3. A new app with nothing in it gets deleted, so this asks what to
 * start with. The three switches are remembered on this phone; each import itself arrives with its place
 * (photos and calendars need a build on a phone as well), and each row says so. Everything brought in
 * starts as yours alone.
 */
export default function BringThingsIn() {
  const { colors } = useTheme();
  const router = useRouter();
  const { circle } = useLocalSearchParams<{ circle: string }>();
  const account = useGetMe().data?.id;
  const [choice, setChoice] = useKept<BringIn>(bringInKey(account), NOTHING_YET);
  /** The sentence about the row that was pressed last: what it will do once its place is built. */
  const [later, setLater] = useState<string | null>(null);
  const says = words.setup.bringIn;
  const next = () => router.push({ pathname: '/setup/ready', params: { circle } });
  const skip = () => {
    setChoice(NOTHING_YET);
    next();
  };
  const some = choice.photos || choice.journey || choice.calendars;

  const toggle = (what: keyof BringIn, label: string) => <Toggle label={label} value={choice[what]} onChange={(on) => setChoice({ ...choice, [what]: on })} />;
  const arrow = <ChevronRight size={18} color={colors.muted} />;

  return (
    <SetupFrame step={3} trailing={<BarLink label={words.common.notNow} quiet onPress={skip} />} footer={<Button label={some ? says.go : says.goNone} size="lg" block onPress={next} />}>
      <View style={{ paddingHorizontal: layout.rowGutter, marginBottom: 16 }}>
        <Heading style={{ marginTop: 6 }}>{says.title}</Heading>
        <Lead>{says.lead}</Lead>
      </View>
      <RowGroup>
        <Row first icon={(c) => <Picture size={18} color={c} />} label={says.photos.label} note={says.photos.note} trailing={toggle('photos', says.photos.label)} />
        <Row icon={(c) => <Route size={18} color={c} />} label={says.journey.label} note={says.journey.note} trailing={toggle('journey', says.journey.label)} />
        <Row icon={(c) => <CalendarDays size={18} color={c} />} label={says.calendars.label} note={says.calendars.note} trailing={toggle('calendars', says.calendars.label)} />
        <Row icon={(c) => <File size={18} color={c} />} label={says.notes.label} note={says.notes.note} trailing={arrow} onPress={() => setLater(says.notes.later)} />
        <Row icon={(c) => <KeyRound size={18} color={c} />} label={says.passwords.label} note={says.passwords.note} trailing={arrow} onPress={() => setLater(says.passwords.later)} />
      </RowGroup>
      {later ? (
        <Txt variant="caption" color="muted" accessibilityLiveRegion="polite" style={{ marginTop: 10, marginHorizontal: layout.gutter }}>
          {later}
        </Txt>
      ) : null}
      <NoteBox soft icon={(c) => <Lock size={20} color={c} />} title={says.startsAs.title} style={{ marginTop: 14, marginHorizontal: layout.barGutter }}>
        {says.startsAs.body}
      </NoteBox>
    </SetupFrame>
  );
}

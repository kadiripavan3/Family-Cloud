import { Check, ChevronRight, Image as ImageIcon, Mail, Users } from 'lucide-react-native';
import { type ReactNode, useState } from 'react';
import { View } from 'react-native';

import { useGetJourneySwitch, useGetMe } from '@/api/generated/homeport';
import { useCircleIfAny } from '@/features/circles/current';
import { membersOf } from '@/features/circles/members';
import { firstName } from '@/lib/names';
import { layout, radius, useTheme } from '@/theme';
import { BrandMark, JourneyMark } from '@/ui/Brand';
import { Tap } from '@/ui/Motion';
import { NoteBox } from '@/ui/NoteBox';
import { Row, RowGroup } from '@/ui/Rows';
import { Sheet } from '@/ui/Sheet';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

import { openInJourney } from './open';

/**
 * 10.1 One account, two apps: the sheet from holding the You tab, and from the row on You. This app, with
 * a tick because you are in it, and Journey, already signed in, one tap away. Under them the three things
 * the two share. Opening the other app needs both on one phone: where it can't be done, the sheet says why.
 */
export function AppSwitchSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { colors } = useTheme();
  const says = words.together.apps;
  const circle = useCircleIfAny();
  const me = useGetMe().data?.profile;
  const asked = useGetJourneySwitch({ query: { enabled: visible } });
  const data = asked.data;
  const [said, setSaid] = useState<string | null>(null);

  const journey = data?.journey;
  const off = data?.available === false;
  // Another adult of the circle, to name in "Invite Alex to a journey in one tap".
  const friend = circle ? membersOf(circle).find((member) => !member.you && member.kind === 'person' && member.status === 'joined') : undefined;
  const journeyLine = journey ? says.journey.line(journey.following ?? 0) : says.journey.noProfile;
  const hereLine = says.here.line(circle?.name ?? '');
  const open = () =>
    void openInJourney(journey?.openUrl).then((how) => {
      if (how !== 'opened') setSaid(how === 'browser' ? words.together.open.browser : words.together.open.missing);
    });
  const close = () => {
    setSaid(null);
    onClose();
  };

  return (
    <Sheet visible={visible} onClose={close} title={says.title} subtitle={says.signedIn(data?.signedInAs ?? me?.displayName ?? '')}>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 4, marginBottom: 14, marginHorizontal: layout.barGutter }}>
        <AppCard on mark={<BrandMark size={46} />} name={words.common.appName} line={hereLine} spoken={says.here.spoken(hereLine)} corner={<Tick />} />
        {off ? null : (
          <AppCard
            mark={<JourneyMark size={46} />}
            name={says.journey.name}
            line={journeyLine}
            spoken={says.journey.spoken(journeyLine)}
            onPress={open}
            corner={
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 26, paddingLeft: 9, paddingRight: 7, borderRadius: radius.pill, backgroundColor: colors.fill }}>
                <Txt variant="small" weight={700}>
                  {words.together.open.button}
                </Txt>
                <ChevronRight size={13} color={colors.text} />
              </View>
            }
          />
        )}
      </View>
      {said || data?.note || off ? (
        <Txt variant="caption" color="muted" accessibilityLiveRegion="polite" style={{ marginTop: -4, marginBottom: 12, marginHorizontal: layout.gutter }}>
          {said ?? data?.note ?? says.off}
        </Txt>
      ) : null}
      <RowGroup>
        <Row first icon={(c) => <ImageIcon size={18} color={c} />} label={says.facts.originals.title} note={says.facts.originals.note} />
        <Row icon={(c) => <Users size={18} color={c} />} label={says.facts.people.title} note={says.facts.people.note(friend ? firstName(friend.name) : null)} />
        <Row icon={(c) => <Mail size={18} color={c} />} label={says.facts.summary.title} note={says.facts.summary.note} />
      </RowGroup>
      {data?.notYet.length ? (
        <NoteBox icon={() => <JourneyMark size={22} />} title={says.notYet} style={{ marginTop: 12, marginHorizontal: layout.barGutter }}>
          {data.notYet.map((one) => one.says).join(' ')}
        </NoteBox>
      ) : null}
    </Sheet>
  );
}

/** One of the two apps: its mark, its name and a line, and what stands in its corner (a tick for the one you are in, "Open" for the other). */
function AppCard({ mark, name, line, spoken, on, corner, onPress }: { mark: ReactNode; name: string; line: string; spoken: string; on?: boolean; corner: ReactNode; onPress?: () => void }) {
  const { colors } = useTheme();
  const frame = { flex: 1, alignItems: 'flex-start', gap: 2, padding: 14, borderRadius: radius.cardLarge, backgroundColor: colors.bg, borderWidth: on ? 2 : 1.5, borderColor: on ? colors.text : colors.line } as const;
  const inside = (
    <>
      <View style={{ marginBottom: 8 }}>{mark}</View>
      <Txt variant="headline" weight={800} numberOfLines={1}>
        {name}
      </Txt>
      <Txt variant="footnote" color="muted">
        {line}
      </Txt>
      <View style={{ position: 'absolute', top: 12, right: 12 }}>{corner}</View>
    </>
  );
  if (!onPress) {
    return (
      <View accessible accessibilityLabel={spoken} style={frame}>
        {inside}
      </View>
    );
  }
  return (
    <Tap accessibilityRole="button" accessibilityLabel={spoken} onPress={onPress} scaleTo={0.98} style={frame}>
      {inside}
    </Tap>
  );
}

function Tick() {
  const { colors } = useTheme();
  return (
    <View style={{ width: 26, height: 26, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent }}>
      <Check size={14} color={colors.onAccent} strokeWidth={3} />
    </View>
  );
}

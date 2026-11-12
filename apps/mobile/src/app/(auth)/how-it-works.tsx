import { Image } from 'expo-image';
import { usePreventRemove, useRouter } from 'expo-router';
import { FileText, ImageIcon, KeyRound, Lock, Users } from 'lucide-react-native';
import { type ReactNode, useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { radius, useTheme } from '@/theme';
import { AppBar, BarLink } from '@/ui/AppBar';
import { Button } from '@/ui/Button';
import { Dots } from '@/ui/Dots';
import { Emoji } from '@/ui/Emoji';
import { Heading, Lead } from '@/ui/Heading';
import { Rise } from '@/ui/Motion';
import { Pill } from '@/ui/Pill';
import { Screen } from '@/ui/Screen';
import { Txt } from '@/ui/Txt';
import { rich } from '@/ui/rich';
import { words } from '@/words';

const { oneHome, youChoose, sixPlaces } = words.signIn.howItWorks;

type Photo = { photo: number; label: string; icon: (color: string) => ReactNode };

/** An album, a recipe and a door code, in one pile. The last one is drawn in front. */
const ONE_HOME: Photo[] = [
  { photo: require('@/assets/photos/red-door.jpg'), label: oneHome.cards.doorCode, icon: (c) => <KeyRound size={13} color={c} /> },
  { photo: require('@/assets/photos/cookies.jpg'), label: oneHome.cards.recipe, icon: (c) => <FileText size={13} color={c} /> },
  { photo: require('@/assets/photos/canoe.jpg'), label: oneHome.cards.album, icon: (c) => <ImageIcon size={13} color={c} /> },
];

/** The same pile, with the label that says who can see each thing. */
const YOU_CHOOSE: Photo[] = [
  { photo: require('@/assets/photos/cake.jpg'), label: youChoose.cards.onlyYou, icon: (c) => <Lock size={13} color={c} /> },
  { photo: require('@/assets/photos/coffee-receipt.jpg'), label: youChoose.cards.two, icon: (c) => <Users size={13} color={c} /> },
  { photo: require('@/assets/photos/picnic.jpg'), label: youChoose.cards.everyone, icon: () => <Emoji char="👪" size={13} /> },
];

/** The people of the made-up circle under the first pile. */
const FACES: number[] = [require('@/assets/photos/av-alex.jpg'), require('@/assets/photos/av-mia.jpg'), require('@/assets/photos/av-leo.jpg')];

/** The six places, in the order of Home's top row, each with its emoji. */
const PLACES = [
  { emoji: '🏡', label: words.common.places.today },
  { emoji: '📅', label: words.common.places.plan },
  { emoji: '📓', label: words.common.places.notes },
  { emoji: '📷', label: words.common.places.library },
  { emoji: '💰', label: words.common.places.money },
  { emoji: '🔐', label: words.common.places.vault },
];

const CARDS = [
  { id: 'one-home', ...oneHome, art: <Pile photos={ONE_HOME} under={<Circle />} /> },
  { id: 'you-choose', ...youChoose, art: <Pile photos={YOU_CHOOSE} /> },
  { id: 'six-places', ...sixPlaces, art: <SixPlaces /> },
];

/** 1.2 How it works: three cards, one picture each. Skip is always there, and nothing has to be typed. */
export default function HowItWorks() {
  const router = useRouter();
  const [at, setAt] = useState(0);
  const card = CARDS[at]!;
  const signIn = () => router.push('/sign-in');
  // Back goes to the card before, and leaves only from the first one.
  usePreventRemove(at > 0, () => setAt(at - 1));

  return (
    <Screen
      header={<AppBar leading="none" trailing={<BarLink label={words.common.skip} quiet onPress={signIn} />} />}
      footer={
        <>
          <View style={{ marginBottom: 6 }}>
            <Dots count={CARDS.length} at={at} />
          </View>
          <Button label={words.common.next} size="lg" block onPress={() => (at === CARDS.length - 1 ? signIn() : setAt(at + 1))} />
        </>
      }>
      {/* A new key for each card, so its picture arrives afresh. */}
      <View key={card.id} accessible accessibilityLabel={card.picture} style={{ height: 430, marginTop: 6, alignItems: 'center' }}>
        {card.art}
      </View>
      <Heading center>{card.title}</Heading>
      <Lead center>{card.body}</Lead>
    </Screen>
  );
}

/** Where each of the three photos sits: two leaning at the back, one nearly straight in front. */
const SPOTS = [
  { left: 96, top: 30, rotate: '10deg' },
  { left: -96, top: 30, rotate: '-11deg' },
  { left: 0, top: 58, rotate: '-2deg' },
] as const;

/** Three photos stacked like cards, each with its label, and an optional chip under them. */
function Pile({ photos, under }: { photos: Photo[]; under?: ReactNode }) {
  const { colors, shadow } = useTheme();
  return (
    <>
      {photos.map((card, index) => {
        const spot = SPOTS[index]!;
        return (
          <Animated.View
            key={card.label}
            entering={FadeInDown.duration(420).delay(120 + index * 140)}
            style={{
              position: 'absolute',
              top: spot.top,
              width: 226,
              height: 312,
              borderRadius: radius.stage,
              overflow: 'hidden',
              backgroundColor: colors.fill,
              boxShadow: shadow.stage,
              transform: [{ translateX: spot.left }, { rotate: spot.rotate }],
            }}>
            <Image source={card.photo} style={{ flex: 1 }} contentFit="cover" />
            <Pill label={card.label} icon={card.icon} style={{ position: 'absolute', left: 12, bottom: 12 }} />
          </Animated.View>
        );
      })}
      {under}
    </>
  );
}

/** The made-up circle the first pile belongs to: three faces, its name and how many are in it. */
function Circle() {
  const { colors, shadow } = useTheme();
  return (
    <View
      style={{
        position: 'absolute',
        bottom: 14,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 7,
        paddingLeft: 8,
        paddingRight: 14,
        borderRadius: radius.cardLarge,
        backgroundColor: colors.surface,
        boxShadow: shadow.md,
      }}>
      <View style={{ flexDirection: 'row' }}>
        {FACES.map((face, index) => (
          <Image key={face} source={face} style={{ width: 22, height: 22, marginLeft: index === 0 ? 0 : -8, borderRadius: radius.pill, borderWidth: 2, borderColor: colors.surface }} contentFit="cover" />
        ))}
      </View>
      <Txt variant="caption" weight={500} color="muted">
        {rich(oneHome.circle, {
          bold: (text) => (
            <Txt variant="caption" weight={800}>
              {text}
            </Txt>
          ),
        })}
      </Txt>
    </View>
  );
}

/** The six places as six tiles, two to a row. */
function SixPlaces() {
  const { colors } = useTheme();
  return (
    <View style={{ alignSelf: 'stretch', flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingTop: 24 }}>
      {PLACES.map((place, index) => (
        <Rise key={place.label} index={index} style={{ width: '48%', flexGrow: 1 }}>
          <View style={{ gap: 12, padding: 16, borderRadius: radius.cardLarge, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.bg }}>
            <Emoji char={place.emoji} size={40} />
            <Txt variant="headline" weight={800}>
              {place.label}
            </Txt>
          </View>
        </Rise>
      ))}
    </View>
  );
}

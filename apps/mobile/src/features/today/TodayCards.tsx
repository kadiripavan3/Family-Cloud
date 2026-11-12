import { ChevronRight } from 'lucide-react-native';
import { View } from 'react-native';

import type { TodayCard } from '@/api/generated/homeport';
import { kindOf } from '@/features/things/kinds';
import { useOpenThing } from '@/features/things/open';
import { layout, useTheme } from '@/theme';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Emoji } from '@/ui/Emoji';
import { Tap } from '@/ui/Motion';
import { Photo } from '@/ui/Photo';
import { Pill } from '@/ui/Pill';
import { Ring } from '@/ui/Ring';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

import { FrontWords, TodayLine } from './TodayLine';

/**
 * The cards of Today: what each kind of circle's own templates have to say today (a couple's mystery date,
 * a flat's kitty, how far a crew has walked). `partsOf` (about.ts) says where each one is drawn; these are
 * the three ways, the same whatever sent the card. Each opens its thing, by its kind.
 */

/** The card that is the day's headline: its title and its line, beside the ring with the circle's own emoji. */
export function HeadlineCard({ card, progress, emoji }: { card: TodayCard; progress: number; emoji: string }) {
  const open = useOpenThing();
  return (
    <Card style={{ marginTop: 18, marginHorizontal: layout.barGutter }}>
      <Tap
        accessibilityRole="button"
        accessibilityLabel={words.common.spoken([card.title, card.line])}
        scaleTo={0.99}
        onPress={() => open({ kind: card.kind, id: card.thingId })}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 16, paddingLeft: 18, paddingRight: 16 }}>
        <View style={{ flex: 1 }}>
          <Txt variant="headline" numberOfLines={2}>
            {card.title}
          </Txt>
          {card.line ? (
            <Txt variant="caption" weight={500} color="muted" numberOfLines={2} style={{ marginTop: 4 }}>
              {card.line}
            </Txt>
          ) : null}
        </View>
        <Ring progress={progress} emoji={emoji} />
      </Tap>
    </Card>
  );
}

/**
 * A card as a line of the day's list: its figure ("€61", "59%", "Sat") or its emoji in front, its title and
 * line, and at the end its button, in the API's own word ("Pay", "Answer"), or an arrow. The line and its
 * button both open the card's thing: what a button of a board does is done on the board.
 */
export function CardLine({ card, first }: { card: TodayCard; first: boolean }) {
  const { colors } = useTheme();
  const open = useOpenThing();
  const go = () => open({ kind: card.kind, id: card.thingId });
  const Icon = kindOf(card.kind).icon;
  return (
    <TodayLine
      first={first}
      wideFront
      // (A card says more than a day's own line, and its button takes room: its words may run to a third line.)
      lines={3}
      front={card.figure ? <FrontWords>{card.figure}</FrontWords> : card.emoji ? <Emoji char={card.emoji} size={26} /> : <Icon size={20} color={colors.text} />}
      title={card.title ?? ''}
      note={card.line}
      spoken={words.common.spoken([card.figure, card.title, card.line])}
      onPress={go}
      end={card.action ? undefined : <ChevronRight size={18} color={colors.muted} />}
      button={card.action ? <Button label={card.action} spoken={words.common.spoken([card.action, card.title])} size="sm" variant="soft" inline onPress={go} /> : undefined}
    />
  );
}

/**
 * A card in the rail: its picture with its figure as a label on it ("4,503 days", "A match"), then its
 * title, its line, and its button. One without a picture stands there with its emoji instead.
 */
export function PictureCard({ card }: { card: TodayCard }) {
  const open = useOpenThing();
  const go = () => open({ kind: card.kind, id: card.thingId });
  return (
    <View style={{ width: 158, gap: 8 }}>
      <Tap accessibilityRole="button" accessibilityLabel={words.common.spoken([card.title, card.figure, card.line])} onPress={go} style={{ gap: 2 }}>
        <Photo uri={card.imageUrl} radius="card" style={{ height: 158, marginBottom: 9, alignItems: 'center', justifyContent: 'center' }}>
          {card.imageUrl || !card.emoji ? null : <Emoji char={card.emoji} size={64} />}
          {card.figure ? <Pill label={card.figure} tone={card.imageUrl ? 'glass' : 'accent'} style={{ position: 'absolute', top: 12, left: 12 }} /> : null}
        </Photo>
        <Txt variant="item" numberOfLines={2}>
          {card.title}
        </Txt>
        {card.line ? (
          <Txt variant="caption" weight={500} color="muted" numberOfLines={2}>
            {card.line}
          </Txt>
        ) : null}
      </Tap>
      {card.action ? <Button label={card.action} spoken={words.common.spoken([card.action, card.title])} size="sm" variant="soft" onPress={go} /> : null}
    </View>
  );
}

import { ChevronRight } from 'lucide-react-native';
import { View } from 'react-native';

import type { TodayCard } from '@/api/generated/homeport';
import { kindOf } from '@/features/things/kinds';
import { useOpenThing } from '@/features/things/open';
import { layout, radius, useTheme } from '@/theme';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Emoji } from '@/ui/Emoji';
import { Tap } from '@/ui/Motion';
import { Photo } from '@/ui/Photo';
import { Pill } from '@/ui/Pill';
import { Rail } from '@/ui/Rail';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

/**
 * The cards in their own order (`order`, lower first), as runs of the two ways a card is drawn: those with a
 * picture stand side by side in a rail, those without are rows of one group.
 */
export function runsOf(cards: readonly TodayCard[]): { pictures: boolean; cards: TodayCard[] }[] {
  const runs: { pictures: boolean; cards: TodayCard[] }[] = [];
  for (const card of [...cards].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))) {
    const pictures = !!card.imageUrl;
    const last = runs[runs.length - 1];
    if (last && last.pictures === pictures) last.cards.push(card);
    else runs.push({ pictures, cards: [card] });
  }
  return runs;
}

/**
 * The cards at the top of Today, above the day's list: what each kind of circle's own templates have to say
 * today (a couple's mystery date, a flat's kitty, what a crew is owed). Every card is drawn the same way
 * whatever sent it: an emoji or a figure in front ("€64", "59%"), a title and a line, and its button when
 * it has one. A card with a picture is a small picture card instead. The card and its button both open its
 * thing, by its kind.
 */
export function TodayCards({ cards }: { cards: readonly TodayCard[] }) {
  if (cards.length === 0) return null;
  return (
    <>
      {runsOf(cards).map((run, index) =>
        run.pictures ? (
          <View key={index} style={{ marginTop: 14 }}>
            <Rail>
              {run.cards.map((card, at) => (
                <PictureCard key={`${card.thingId}-${at}`} card={card} />
              ))}
            </Rail>
          </View>
        ) : (
          <Card key={index} style={{ marginTop: 14, marginHorizontal: layout.barGutter, borderRadius: radius.card, overflow: 'hidden' }}>
            {run.cards.map((card, at) => (
              <CardRow key={`${card.thingId}-${at}`} card={card} first={at === 0} />
            ))}
          </Card>
        ),
      )}
    </>
  );
}

/** A card as a row: what stands in front, its title and line, and its button or an arrow. */
function CardRow({ card, first }: { card: TodayCard; first: boolean }) {
  const { colors } = useTheme();
  const open = useOpenThing();
  const go = () => open({ kind: card.kind, id: card.thingId });
  const Icon = kindOf(card.kind).icon;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingRight: 14, borderTopWidth: first ? 0 : 1, borderTopColor: colors.line }}>
      <Tap accessibilityRole="button" accessibilityLabel={words.common.spoken([card.figure, card.title, card.line])} onPress={go} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingVertical: 12, paddingLeft: 14 }}>
        <View style={{ minWidth: 44, maxWidth: 96, alignItems: 'flex-start' }}>
          {card.figure ? (
            <Txt variant="note" weight={800} numberOfLines={1}>
              {card.figure}
            </Txt>
          ) : card.emoji ? (
            <Emoji char={card.emoji} size={26} />
          ) : (
            <Icon size={20} color={colors.text} />
          )}
        </View>
        <View style={{ flex: 1, gap: 1 }}>
          <Txt variant="item" numberOfLines={2}>
            {card.title}
          </Txt>
          {card.line ? (
            <Txt variant="footnote" color="muted" numberOfLines={2}>
              {card.line}
            </Txt>
          ) : null}
        </View>
      </Tap>
      {card.action ? <Button label={card.action} spoken={words.common.spoken([card.action, card.title])} size="sm" variant="soft" inline onPress={go} /> : <ChevronRight size={18} color={colors.muted} />}
    </View>
  );
}

/** A card with a picture: the picture with its figure as a label on it, then its title, its line, and its button. */
function PictureCard({ card }: { card: TodayCard }) {
  const open = useOpenThing();
  const go = () => open({ kind: card.kind, id: card.thingId });
  return (
    <View style={{ width: 158, gap: 8 }}>
      <Tap accessibilityRole="button" accessibilityLabel={words.common.spoken([card.title, card.figure, card.line])} onPress={go} style={{ gap: 2 }}>
        <Photo uri={card.imageUrl} radius="card" style={{ height: 158, marginBottom: 9 }}>
          {card.figure ? <Pill label={card.figure} style={{ position: 'absolute', top: 12, left: 12 }} /> : null}
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

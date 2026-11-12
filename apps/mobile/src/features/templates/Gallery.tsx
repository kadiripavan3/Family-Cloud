import { Search, X } from 'lucide-react-native';
import { useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { type TemplateCard, useGetTemplates } from '@/api/generated/homeport';
import { useCircle } from '@/features/circles/current';
import { PageProblem } from '@/features/states/PageProblem';
import { loadState } from '@/lib/loading';
import { layout, radius, textStyle, useTheme } from '@/theme';
import { AppBar } from '@/ui/AppBar';
import { Chip } from '@/ui/Chip';
import { Emoji } from '@/ui/Emoji';
import { EmptyState } from '@/ui/EmptyState';
import { Loading } from '@/ui/Loading';
import { Tap } from '@/ui/Motion';
import { RoundButton } from '@/ui/RoundButton';
import { Sk } from '@/ui/Skeleton';
import { MAX_TEXT_SCALE, Txt } from '@/ui/Txt';
import { webNoOutline } from '@/ui/web';
import { words } from '@/words';

import { cardsOf, chipsOf, type Filter, firstFilter } from './gallery';
import { StartSheet } from './StartSheet';

/**
 * 5.6 Templates. The gallery for the current circle: every template the API serves, this kind of circle's
 * own first, behind the chips the kind gets ("All 53", "For two 16"), with LIVE on the ones that do work.
 * The magnifier searches the cards' names and lines. A card opens the sheet that starts it, and stays
 * marked afterwards; until one is pressed, the first card is the marked one.
 */
export function Gallery() {
  const { colors } = useTheme();
  const circle = useCircle();
  const asked = useGetTemplates(circle.id);
  const load = loadState(asked);
  const gallery = asked.data;
  const say = words.templates.gallery;

  const [filter, setFilter] = useState<Filter>(firstFilter(circle.kind));
  const [searching, setSearching] = useState(false);
  const [typed, setTyped] = useState('');
  const [chosen, setChosen] = useState<TemplateCard | null>(null);
  /** The card that was pressed last: it stays marked after its sheet has closed. */
  const [marked, setMarked] = useState<string | null>(null);

  const cards = gallery ? cardsOf(gallery, filter, searching ? typed : '') : [];
  // One card is always the marked one, as the drawings have it: the one pressed last, or the first of what is shown.
  const on = cards.some((card) => card.template === marked) ? marked : (cards[0]?.template ?? null);
  const rows: TemplateCard[][] = [];
  for (let index = 0; index < cards.length; index += 2) rows.push(cards.slice(index, index + 2));

  const stopSearching = () => {
    setSearching(false);
    setTyped('');
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar
        leading="close"
        title={say.title}
        trailing={
          searching ? (
            <RoundButton label={say.closeSearch} onPress={stopSearching} icon={(color) => <X size={20} color={color} />} />
          ) : (
            <RoundButton label={say.search} onPress={() => setSearching(true)} icon={(color) => <Search size={20} color={color} />} />
          )
        }
      />
      {load.error ? (
        <PageProblem error={load.error} onRetry={load.retry} retrying={load.retrying} />
      ) : !gallery ? (
        load.offline ? (
          <Loading offline />
        ) : (
          <GallerySkeleton />
        )
      ) : (
        <>
          {searching ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 46, marginHorizontal: layout.barGutter, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: colors.fill }}>
              <Search size={19} color={colors.muted} />
              <TextInput
                accessibilityLabel={say.search}
                placeholder={say.search}
                placeholderTextColor={colors.muted}
                selectionColor={colors.accent}
                maxFontSizeMultiplier={MAX_TEXT_SCALE}
                value={typed}
                onChangeText={setTyped}
                autoFocus
                autoCorrect={false}
                returnKeyType="search"
                style={[webNoOutline, textStyle('bodySmall', 500, { oneLine: true }), { flex: 1, minHeight: 46, padding: 0, color: colors.text }]}
              />
            </View>
          ) : (
            <View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: layout.barGutter }}>
                {chipsOf(gallery).map((chip) => (
                  <Chip key={chip.id} tone="filter" label={chip.label} emoji={chip.emoji} count={chip.count} selected={chip.id === filter} onPress={() => setFilter(chip.id)} />
                ))}
              </ScrollView>
            </View>
          )}
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 10, paddingTop: 16, paddingHorizontal: layout.barGutter, paddingBottom: 48 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {rows.length === 0 ? (
              <View style={{ paddingTop: 48 }}>
                {searching && typed.trim() ? <EmptyState emoji="🔍" title={say.noMatch.title} body={say.noMatch.body(typed.trim())} /> : <EmptyState emoji="📓" title={say.empty.title} body={say.empty.body} />}
              </View>
            ) : (
              rows.map((pair) => (
                // Two to a row, as tall as the taller of the two.
                <View key={pair[0]!.template} style={{ flexDirection: 'row', alignItems: 'stretch', gap: 10 }}>
                  {pair.map((card) => (
                    <Card
                      key={card.template}
                      card={card}
                      on={card.template === on}
                      onPress={() => {
                        setMarked(card.template ?? null);
                        setChosen(card);
                      }}
                    />
                  ))}
                  {pair.length === 1 ? <View style={{ flex: 1 }} /> : null}
                </View>
              ))
            )}
          </ScrollView>
        </>
      )}
      <StartSheet card={chosen} circle={circle} onClose={() => setChosen(null)} />
    </SafeAreaView>
  );
}

/** One template: its emoji, its name and its line, and LIVE in the corner when it does work. */
function Card({ card, on, onPress }: { card: TemplateCard; on: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  const say = words.templates.gallery;
  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel={say.card(card.name ?? '', card.line ?? '', !!card.live)}
      accessibilityState={{ selected: on }}
      // Said this way, a browser hears which card is the marked one as well: the web takes no `accessibilityState`.
      aria-selected={on}
      onPress={onPress}
      // The chosen card's line is half a point thicker: the padding gives that half point back, so nothing moves.
      style={{ flex: 1, gap: 4, padding: on ? 15.5 : 16, borderRadius: radius.cardLarge, backgroundColor: colors.bg, borderWidth: on ? 2 : 1.5, borderColor: on ? colors.text : colors.line }}>
      {card.live ? (
        <View style={{ position: 'absolute', top: 12, right: 12, paddingVertical: 4, paddingHorizontal: 8, borderRadius: radius.chip, backgroundColor: colors.text }}>
          <Txt variant="micro" style={{ color: colors.bg }}>
            {say.live}
          </Txt>
        </View>
      ) : null}
      <View style={{ height: 41, marginBottom: 8, alignItems: 'flex-start', justifyContent: 'center' }}>
        <Emoji char={card.emoji ?? '📓'} size={41} />
      </View>
      <Txt variant="headline" weight={800}>
        {card.name}
      </Txt>
      <Txt variant="footnote" color="muted">
        {card.line}
      </Txt>
    </Tap>
  );
}

/** The gallery while it loads: the row of chips and six cards, in grey. */
function GallerySkeleton() {
  return (
    <View accessibilityLabel={words.states.loading} style={{ paddingHorizontal: layout.barGutter }}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {[76, 118, 88, 80].map((width, index) => (
          <Sk key={index} width={width} height={38} radius="pill" />
        ))}
      </View>
      <View style={{ gap: 10, paddingTop: 16 }}>
        {[0, 1, 2].map((row) => (
          <View key={row} style={{ flexDirection: 'row', gap: 10 }}>
            <Sk height={138} radius="cardLarge" style={{ flex: 1 }} />
            <Sk height={138} radius="cardLarge" style={{ flex: 1 }} />
          </View>
        ))}
      </View>
    </View>
  );
}

import { useLocalSearchParams } from 'expo-router';
import { Search as SearchIcon, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { messageFor } from '@/api/fetcher';
import { type Place, type SearchHit, useSearchCircle } from '@/api/generated/homeport';
import { useCircle } from '@/features/circles/current';
import { useLeave } from '@/features/navigation/useLeave';
import { ThingRow } from '@/features/things/ThingRow';
import { loadState } from '@/lib/loading';
import { layout, radius, textStyle, useTheme } from '@/theme';
import { BarLink } from '@/ui/AppBar';
import { AvoidKeyboard } from '@/ui/AvoidKeyboard';
import { Chip } from '@/ui/Chip';
import { EmptyState } from '@/ui/EmptyState';
import { GroupLabel } from '@/ui/Heading';
import { Loading } from '@/ui/Loading';
import { Tap } from '@/ui/Motion';
import { Problem } from '@/ui/Problem';
import { ListSkeleton } from '@/ui/Skeleton';
import { MAX_TEXT_SCALE } from '@/ui/Txt';
import { webNoOutline } from '@/ui/web';
import { words } from '@/words';

/** The places a search can be narrowed to, in the order of the chips. */
const PLACES: readonly Place[] = ['notes', 'library', 'plan', 'money', 'vault'];
const isPlace = (value: unknown): value is Place => PLACES.includes(value as Place);

/** How long after the last key the search is sent. */
const AFTER_TYPING_MS = 250;

/** The hits, grouped by the place each thing lives in, in the order the places first come up. */
function byPlace(hits: readonly SearchHit[]): { place: Place; hits: SearchHit[] }[] {
  const groups: { place: Place; hits: SearchHit[] }[] = [];
  for (const hit of hits) {
    const place = hit.thing?.place ?? 'notes';
    const group = groups.find((one) => one.place === place);
    if (group) group.hits.push(hit);
    else groups.push({ place, hits: [hit] });
  }
  return groups;
}

/**
 * 3.3 Find anything. One search across the current circle and every place in it: titles, and words inside
 * pages and lists (and inside each place's own things, as they are built). Only what the person may see is
 * found. The chips narrow it to one place; Home's pill opens it already narrowed to the place that was
 * showing (`/search?place=notes`).
 */
export default function Search() {
  const { colors } = useTheme();
  const leave = useLeave();
  const circle = useCircle();
  const asked = useLocalSearchParams<{ place?: string }>().place;
  const [place, setPlace] = useState<Place | null>(isPlace(asked) ? asked : null);
  const [typed, setTyped] = useState('');
  const [sent, setSent] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setSent(typed.trim()), AFTER_TYPING_MS);
    return () => clearTimeout(timer);
  }, [typed]);

  const found = useSearchCircle(circle.id, { q: sent, ...(place ? { place } : {}) }, { query: { enabled: sent.length > 0, placeholderData: (last) => last } });
  const load = loadState(found);
  const hits = sent ? found.data?.hits : undefined;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <AvoidKeyboard style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: layout.barGutter }}>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 46, paddingLeft: 14, paddingRight: 12, borderRadius: radius.pill, borderWidth: 2, borderColor: colors.text, backgroundColor: colors.bg }}>
            <SearchIcon size={19} color={colors.muted} />
            <TextInput
              accessibilityLabel={words.search.field(circle.name)}
              placeholder={words.search.field(circle.name)}
              placeholderTextColor={colors.muted}
              selectionColor={colors.accent}
              maxFontSizeMultiplier={MAX_TEXT_SCALE}
              value={typed}
              onChangeText={setTyped}
              autoFocus
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              style={[webNoOutline, textStyle('headline', 600, { oneLine: true }), { flex: 1, minHeight: 24, padding: 0, color: colors.text }]}
            />
            {typed ? (
              <Tap accessibilityRole="button" accessibilityLabel={words.search.clear} hitSlop={11} onPress={() => setTyped('')} scaleTo={0.9} style={{ width: 22, height: 22, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.fill2 }}>
                <X size={13} color={colors.text} strokeWidth={2.6} />
              </Tap>
            ) : null}
          </View>
          <BarLink label={words.search.cancel} onPress={leave} />
        </View>

        <View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8, paddingVertical: 4, paddingHorizontal: layout.barGutter }}>
            <Chip tone="filter" label={words.search.everything} selected={place === null} onPress={() => setPlace(null)} />
            {PLACES.map((one) => (
              <Chip key={one} tone="filter" label={words.common.places[one]} selected={place === one} onPress={() => setPlace(one)} />
            ))}
          </ScrollView>
        </View>

        {!sent ? (
          <View style={{ flex: 1, justifyContent: 'center', paddingBottom: 80 }}>
            <EmptyState emoji="🔮" title={words.search.start.title} body={words.search.start.body} />
          </View>
        ) : load.error ? (
          <Problem message={messageFor(load.error)} onRetry={load.retry} retrying={load.retrying} />
        ) : !hits ? (
          load.offline ? (
            <Loading offline />
          ) : (
            <ListSkeleton count={4} />
          )
        ) : hits.length === 0 ? (
          <View style={{ flex: 1, justifyContent: 'center', paddingBottom: 80 }}>
            <EmptyState emoji="🔮" title={words.search.none.title(sent)} body={words.search.none.body} />
          </View>
        ) : (
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
            {byPlace(hits).map((group) => (
              <View key={group.place}>
                <GroupLabel style={{ marginHorizontal: layout.gutter }}>{words.common.places[group.place]}</GroupLabel>
                {group.hits.map((hit) => (hit.thing ? <ThingRow key={hit.thing.id} thing={hit.thing} line={hit.snippet ? words.search.found(hit.snippet) : undefined} /> : null))}
              </View>
            ))}
          </ScrollView>
        )}
      </AvoidKeyboard>
    </SafeAreaView>
  );
}

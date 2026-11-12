import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useGetThing } from '@/api/generated/homeport';
import { AudienceChip } from '@/features/sharing/AudienceChip';
import { NotFound } from '@/features/states/NotFound';
import { PageProblem } from '@/features/states/PageProblem';
import { kindOf } from '@/features/things/kinds';
import { looksLikeId } from '@/features/things/open';
import { loadState } from '@/lib/loading';
import { useTheme } from '@/theme';
import { AppBar } from '@/ui/AppBar';
import { EmptyState } from '@/ui/EmptyState';
import { Loading } from '@/ui/Loading';
import { words } from '@/words';

/**
 * A thing whose own screen isn't built yet. Every list of mixed things opens a thing at
 * `/<its kind>/<its id>` (`features/things/open`), and a place's own screen (`app/(app)/event/[id].tsx`)
 * takes that address over as soon as it exists. Until then the thing lands here: its title, what kind it
 * is and who sees it, and a plain sentence that it opens here once its place is built. Never the
 * "nothing at this address" page, as long as the thing is there.
 */
export default function ThingToCome() {
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ kind: string; id: string }>();
  const isThing = looksLikeId(id);
  const asked = useGetThing(id, { query: { enabled: isThing } });
  // An address of two parts that isn't a thing's ("/new/whatever") has no screen at all.
  if (!isThing) return <NotFound />;

  const load = loadState(asked);
  const thing = asked.data;
  const kind = kindOf(thing?.kind);
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar trailing={thing ? <AudienceChip thing={thing} /> : undefined} />
      {load.error ? (
        <PageProblem error={load.error} onRetry={load.retry} retrying={load.retrying} inset={false} />
      ) : !thing ? (
        <Loading offline={load.offline} />
      ) : (
        <View style={{ flex: 1, justifyContent: 'center', paddingBottom: 80 }}>
          <EmptyState emoji="🛠️" title={thing.title?.trim() || words.things.untitled} body={words.things.toCome.body(kind.a, thing.place ? words.common.places[thing.place] : null)} />
        </View>
      )}
    </SafeAreaView>
  );
}

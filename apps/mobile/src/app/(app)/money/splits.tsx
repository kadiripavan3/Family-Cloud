import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useCache } from '@/api/cache';
import { ApiError, messageFor } from '@/api/fetcher';
import { createSplit, type SplitBriefResponse, useGetSplitsInfinite } from '@/api/generated/homeport';
import { more, paged, rows } from '@/api/pages';
import { useCircle } from '@/features/circles/current';
import { SplitRow } from '@/features/money/split/SplitRow';
import { PageProblem } from '@/features/states/PageProblem';
import { thingHref, useOpenThing } from '@/features/things/open';
import { newClientId } from '@/lib/ids';
import { loadState } from '@/lib/loading';
import { layout, useTheme } from '@/theme';
import { AppBar } from '@/ui/AppBar';
import { Button } from '@/ui/Button';
import { EmptyState } from '@/ui/EmptyState';
import { Field } from '@/ui/Field';
import { List } from '@/ui/List';
import { Loading } from '@/ui/Loading';
import { RoundButton } from '@/ui/RoundButton';
import { Sheet } from '@/ui/Sheet';
import { ListSkeleton } from '@/ui/Skeleton';
import { words } from '@/words';

/**
 * The circle's shared costs: each split with where the person stands in it. The third number on Money's
 * card leads here. The + starts a new one by name; everyone in the circle who can share a cost is in it.
 */
export default function Splits() {
  const { colors } = useTheme();
  const router = useRouter();
  const cache = useCache();
  const circle = useCircle();
  const open = useOpenThing();
  const splits = useGetSplitsInfinite(circle.id, undefined, { query: paged });
  const load = loadState(splits);
  const list = rows(splits.data);
  const [starting, setStarting] = useState(false);
  const [title, setTitle] = useState('');
  const clientId = useRef(newClientId());
  const start = useMutation({
    mutationFn: () => createSplit({ clientId: clientId.current, circleId: circle.id, title: title.trim() }),
    onSuccess: (split) => {
      clientId.current = newClientId();
      setStarting(false);
      setTitle('');
      void cache.splitSaved(split);
      router.push(thingHref({ kind: 'split', id: split.id }));
    },
  });
  const failed = start.error instanceof ApiError ? start.error : null;
  const begin = () => {
    start.reset();
    setStarting(true);
  };

  const nothing = (
    <View style={{ paddingTop: 70 }}>
      <EmptyState emoji="🤝" title={words.money.splits.empty.title} body={words.money.splits.empty.body} action={<Button label={words.money.splits.new} onPress={begin} />} />
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar title={words.money.splits.title} trailing={<RoundButton label={words.money.splits.new} icon={(c) => <Plus size={20} color={c} />} onPress={begin} />} />
      {load.error ? (
        <PageProblem error={load.error} onRetry={load.retry} retrying={load.retrying} inset={false} />
      ) : !list ? (
        load.offline ? (
          <Loading offline />
        ) : (
          <ListSkeleton count={3} />
        )
      ) : (
        <List<SplitBriefResponse>
          data={list}
          keyOf={(split) => split.id}
          row={(split) => <SplitRow split={split} onPress={() => open({ kind: 'split', id: split.id })} />}
          empty={nothing}
          loadingMore={splits.isFetchingNextPage}
          refreshing={splits.isRefetching && !splits.isFetchingNextPage}
          onRefresh={() => void splits.refetch()}
          top={8}
          {...more(splits)}
        />
      )}
      <Sheet visible={starting} onClose={() => setStarting(false)} title={words.money.splits.new}>
        <View style={{ gap: 10, paddingTop: 6, paddingHorizontal: layout.rowGutter }}>
          <Field label={words.money.splits.name} placeholder={words.money.splits.namePlaceholder} value={title} onChangeText={setTitle} maxLength={120} autoFocus error={failed?.fields.title ?? (start.isError ? messageFor(start.error) : null)} />
          <Button label={words.money.splits.start} size="lg" block disabled={title.trim().length === 0} loading={start.isPending} onPress={() => start.mutate()} />
        </View>
      </Sheet>
    </SafeAreaView>
  );
}

import { useLocalSearchParams, useRouter } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { type GetVaultItemsParams, useGetVaultItemsInfinite, type VaultItemRowResponse } from '@/api/generated/homeport';
import { more, paged, rows } from '@/api/pages';
import { useCircle } from '@/features/circles/current';
import { NotFound } from '@/features/states/NotFound';
import { PageProblem } from '@/features/states/PageProblem';
import { thingHref } from '@/features/things/open';
import { openItem } from '@/features/vault/actions';
import { VaultScreen } from '@/features/vault/Gate';
import { mainSecret } from '@/features/vault/inside';
import { ItemRow } from '@/features/vault/ItemRow';
import { isDrawer } from '@/features/vault/look';
import { LockToast, Toast } from '@/features/vault/Toast';
import { useCopy } from '@/features/vault/useCopy';
import { useSecretAction } from '@/features/vault/useSecretAction';
import { loadState } from '@/lib/loading';
import { useTheme } from '@/theme';
import { AppBar } from '@/ui/AppBar';
import { EmptyState } from '@/ui/EmptyState';
import { List } from '@/ui/List';
import { RoundButton } from '@/ui/RoundButton';
import { ListSkeleton } from '@/ui/Skeleton';
import { words } from '@/words';

/** The two lists that cut across the drawers. */
const ACROSS: readonly string[] = ['look', 'shared'];

/**
 * One drawer of the Vault (Logins, Cards, …), or one of the two lists across all six: what needs a look, and
 * what other people shared. Every item as a row, with a way to copy it without opening it.
 */
export default function VaultDrawer() {
  const { category } = useLocalSearchParams<{ category: string }>();
  if (!isDrawer(category) && !ACROSS.includes(category)) return <NotFound />;
  return (
    <VaultScreen>
      <Drawer which={category} />
    </VaultScreen>
  );
}

function Drawer({ which }: { which: string }) {
  const { colors } = useTheme();
  const router = useRouter();
  const circle = useCircle();
  const drawer = isDrawer(which) ? which : null;
  const params: GetVaultItemsParams = drawer ? { category: drawer } : which === 'look' ? { look: true } : { mine: false };
  const asked = useGetVaultItemsInfinite(circle.id, params, { query: paged });
  const load = loadState(asked);
  const items = rows(asked.data);
  const { copy, said } = useCopy();
  const opening = useSecretAction();
  const says = words.vault.drawer;
  const title = drawer ? words.vault.drawers[drawer].name : which === 'look' ? says.look : says.shared;
  const everyone = words.kinds[circle.kind].everyone(circle.name);

  const copyFrom = (item: VaultItemRowResponse) =>
    void opening.run(async () => {
      const opened = await openItem(item);
      const secret = mainSecret(opened.inside);
      opened.itemKey.fill(0);
      await copy(secret);
    });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar
        title={title}
        trailing={which === 'shared' ? undefined : <RoundButton label={says.add} icon={(c) => <Plus size={20} color={c} />} onPress={() => router.push(drawer ? { pathname: '/new/password', params: { category: drawer } } : '/new/password')} />}
      />
      {load.error ? (
        <PageProblem error={load.error} onRetry={load.retry} retrying={load.retrying} inset={false} />
      ) : !items ? (
        <ListSkeleton count={5} />
      ) : (
        <List
          data={items}
          keyOf={(item) => item.id}
          row={(item) => (
            <ItemRow item={item} everyone={everyone} onOpen={() => router.push(thingHref({ kind: 'vault_item', id: item.id }))} onCopy={item.myState === 'ready' && !item.sample ? () => copyFrom(item) : undefined} />
          )}
          empty={
            <View style={{ paddingTop: 60 }}>
              <EmptyState emoji={drawer ? words.vault.drawers[drawer].emoji : words.vault.locked.emoji} title={says.empty.title} body={drawer ? says.empty.body : which === 'look' ? says.empty.lookBody : says.empty.sharedBody} />
            </View>
          }
          top={6}
          bottom={110}
          refreshing={asked.isRefetching && !asked.isFetchingNextPage}
          onRefresh={() => void asked.refetch()}
          loadingMore={asked.isFetchingNextPage}
          {...more(asked)}
        />
      )}
      {said ? <Toast text={said} bottom={34} /> : <LockToast bottom={34} />}
    </SafeAreaView>
  );
}

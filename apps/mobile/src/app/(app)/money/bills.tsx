import { useLocalSearchParams, useRouter } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { type BillRowResponse, type BillShow, useGetBillsInfinite, useGetMoney } from '@/api/generated/homeport';
import { more, paged } from '@/api/pages';
import { BillRow } from '@/features/money/BillRow';
import { FIGURES } from '@/features/money/parts';
import { useCircle } from '@/features/circles/current';
import { PageProblem } from '@/features/states/PageProblem';
import { newThingHref } from '@/features/today/newThings';
import { today } from '@/lib/dates';
import { loadState } from '@/lib/loading';
import { formatMoneyRound } from '@/lib/money';
import { layout, useTheme } from '@/theme';
import { AppBar } from '@/ui/AppBar';
import { EmptyState } from '@/ui/EmptyState';
import { List } from '@/ui/List';
import { Loading } from '@/ui/Loading';
import { RoundButton } from '@/ui/RoundButton';
import { Segmented } from '@/ui/Segmented';
import { ListSkeleton } from '@/ui/Skeleton';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

const SHOWS: readonly BillShow[] = ['due', 'paid', 'subscriptions'];
const isShow = (value: unknown): value is BillShow => SHOWS.includes(value as BillShow);

/**
 * The circle's bills, as three lists: what is still to pay (the soonest first), what was paid (the latest
 * first; a bill that comes round is there once for each time), and the subscriptions with what they come to
 * in a month and a year. `/money/bills?show=subscriptions` opens on the third. The + adds a bill.
 */
export default function Bills() {
  const { colors } = useTheme();
  const router = useRouter();
  const circle = useCircle();
  const asked = useLocalSearchParams<{ show?: string }>().show;
  const [show, setShow] = useState<BillShow>(isShow(asked) ? asked : 'due');
  const bills = useGetBillsInfinite(circle.id, { show }, { query: paged });
  const sums = useGetMoney(circle.id, { day: today() }, { query: { enabled: show === 'subscriptions' } });
  const load = loadState(bills);
  // The same bill is in the list of paid ones once for each time it was paid, so a row is known by its bill and its day.
  const rows = bills.data?.pages.flatMap((page) => page.items);
  const nothing = (
    <View style={{ paddingTop: 70 }}>
      <EmptyState emoji="🧾" title={words.money.bills.empty[show].title} body={words.money.bills.empty[show].body} />
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar title={words.money.bills.title} trailing={<RoundButton label={words.money.bills.add} icon={(c) => <Plus size={20} color={c} />} onPress={() => router.push(newThingHref('bill'))} />} />
      <Segmented label={words.money.bills.title} options={SHOWS.map((id) => ({ id, label: words.money.bills.tabs[id] }))} value={show} onChange={setShow} style={{ marginBottom: 6 }} />
      {load.error ? (
        <PageProblem error={load.error} onRetry={load.retry} retrying={load.retrying} inset={false} />
      ) : !rows ? (
        load.offline ? (
          <Loading offline />
        ) : (
          <ListSkeleton count={6} />
        )
      ) : (
        <List<BillRowResponse>
          key={show}
          data={rows}
          keyOf={(bill) => `${bill.id}-${bill.dueOn}`}
          row={(bill) => <BillRow bill={bill} look="plain" asSubscription={show === 'subscriptions'} />}
          header={
            show === 'subscriptions' && sums.data && rows.length ? (
              <Txt variant="callout" weight={700} style={[FIGURES, { marginTop: 8, marginBottom: 6, marginHorizontal: layout.gutter }]}>
                {words.money.bills.subscriptionsSum(formatMoneyRound(sums.data.subscriptionsMonthCents, sums.data.currency), formatMoneyRound(sums.data.subscriptionsYearCents, sums.data.currency))}
              </Txt>
            ) : null
          }
          empty={nothing}
          loadingMore={bills.isFetchingNextPage}
          refreshing={bills.isRefetching && !bills.isFetchingNextPage}
          onRefresh={() => void bills.refetch()}
          top={4}
          {...more(bills)}
        />
      )}
    </SafeAreaView>
  );
}

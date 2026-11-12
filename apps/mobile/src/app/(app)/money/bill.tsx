import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useGetBill } from '@/api/generated/homeport';
import { BillForm } from '@/features/money/BillForm';
import { PageProblem } from '@/features/states/PageProblem';
import { loadState } from '@/lib/loading';
import { useTheme } from '@/theme';
import { AppBar } from '@/ui/AppBar';
import { Loading } from '@/ui/Loading';

/** /money/bill?id=…: changing a bill. The same form that adds one, filled with what the bill holds now. */
export default function ChangeBill() {
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const asked = useGetBill(id);
  const load = loadState(asked);
  if (asked.data) return <BillForm key={asked.data.id} bill={asked.data} />;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar leading="close" />
      {load.error ? <PageProblem error={load.error} onRetry={load.retry} retrying={load.retrying} inset={false} /> : <Loading offline={load.offline} />}
    </SafeAreaView>
  );
}

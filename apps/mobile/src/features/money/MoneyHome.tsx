import { type Href, useRouter } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { RefreshControl, ScrollView, View } from 'react-native';

import { messageFor } from '@/api/fetcher';
import { type MoneyResponse, type SheetBriefResponse, type SplitBriefResponse, useGetMoney, useGetSplits } from '@/api/generated/homeport';
import { useCircle } from '@/features/circles/current';
import { TAB_BAR_ROOM } from '@/features/home/places';
import { useOpenThing } from '@/features/things/open';
import { formatMonthName, today } from '@/lib/dates';
import { loadState } from '@/lib/loading';
import { formatMoneyRound } from '@/lib/money';
import { firstName } from '@/lib/names';
import { layout, radius, useTheme } from '@/theme';
import { Card } from '@/ui/Card';
import { Eyebrow } from '@/ui/Eyebrow';
import { Loading } from '@/ui/Loading';
import { Tap } from '@/ui/Motion';
import { Problem } from '@/ui/Problem';
import { Rail } from '@/ui/Rail';
import { Sk } from '@/ui/Skeleton';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

import { BillRow } from './BillRow';
import { FIGURES, PaidBar, SectionTitle, SheetTile } from './parts';
import { SplitRow } from './split/SplitRow';

/** The lists Money leads to. */
export const BILLS: Href = '/money/bills';
export const SUBSCRIPTIONS: Href = { pathname: '/money/bills', params: { show: 'subscriptions' } };
export const SHEETS: Href = '/money/sheets';
export const SPLITS: Href = '/money/splits';

/** How many bills the card under "Due soon" holds; the arrow beside the title opens the rest. */
const SOON = 3;

/**
 * 8.1 Money, the place under Home's row of six: the month in one card (what is paid of what is due, what is
 * due this week, the subscriptions, who owes whom), the bills due soonest, and the sheets as a rail. All of
 * it comes from one answer of the API; nothing here connects to a bank. In a circle that splits costs, those
 * stand under the sheets.
 */
export function MoneyHome() {
  const { colors } = useTheme();
  const circle = useCircle();
  const asked = useGetMoney(circle.id, { day: today() });
  const splits = useGetSplits(circle.id, { limit: 3 });
  const load = loadState(asked);
  const data = asked.data;

  if (load.error) return <Problem message={messageFor(load.error)} onRetry={load.retry} retrying={load.retrying} />;
  if (!data) return load.offline ? <Loading offline /> : <MoneySkeleton />;

  return (
    <ScrollView
      contentContainerStyle={{ paddingBottom: TAB_BAR_ROOM }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={asked.isRefetching}
          onRefresh={() => {
            void asked.refetch();
            void splits.refetch();
          }}
          tintColor={colors.muted}
        />
      }>
      <Month data={data} />
      <DueSoon data={data} />
      <Sheets sheets={data.sheets} />
      <Shared splits={splits.data?.items ?? []} />
    </ScrollView>
  );
}

/** The month's card: what is paid of what is due, the bar, and three numbers that each open their list. */
function Month({ data }: { data: MoneyResponse }) {
  const router = useRouter();
  const month = formatMonthName(data.monthStart);
  const paid = formatMoneyRound(data.monthPaidCents, data.currency);
  const total = formatMoneyRound(data.monthTotalCents, data.currency);
  // The largest of what is owed between the person and the others, as the API ranks them. Nothing is added up here.
  const first = data.owing[0];
  const owing = !first ? words.money.home.nobodyOwes : first.cents >= 0 ? words.money.home.owesYou(firstName(first.person.name)) : words.money.home.youOwe(firstName(first.person.name));
  return (
    <Card style={{ marginTop: 16, marginHorizontal: layout.barGutter, paddingVertical: 16, paddingHorizontal: 18, borderRadius: radius.panel }}>
      <View accessible accessibilityLabel={words.money.home.monthSpoken(month, paid, total)}>
        <Eyebrow>{words.money.home.month(month)}</Eyebrow>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 4, marginBottom: 10 }}>
          <Txt variant="display" style={FIGURES}>
            {paid}
          </Txt>
          <Txt variant="caption" color="muted" numberOfLines={1} style={{ flexShrink: 1 }}>
            {words.money.home.paidOf(total)}
          </Txt>
        </View>
      </View>
      <PaidBar fraction={data.monthTotalCents > 0 ? data.monthPaidCents / data.monthTotalCents : 0} />
      <View style={{ flexDirection: 'row', marginTop: 12 }}>
        <Figure value={formatMoneyRound(data.dueThisWeekCents, data.currency)} label={words.money.home.dueThisWeek} onPress={() => router.push(BILLS)} />
        <Figure divider value={formatMoneyRound(data.subscriptionsMonthCents, data.currency)} label={words.money.home.subscriptions} onPress={() => router.push(SUBSCRIPTIONS)} />
        <Figure divider value={formatMoneyRound(Math.abs(first?.cents ?? 0), first?.currency ?? data.currency)} label={owing} onPress={() => router.push(SPLITS)} />
      </View>
      {data.otherCurrencies.length ? (
        <Txt variant="footnote" color="muted" style={{ marginTop: 10 }}>
          {words.money.home.otherCurrencies(data.otherCurrencies)}
        </Txt>
      ) : null}
    </Card>
  );
}

/** One of the three numbers on the month's card: bold over a few quiet words. */
function Figure({ value, label, divider, onPress }: { value: string; label: string; divider?: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Tap accessibilityRole="button" accessibilityLabel={words.common.stat(value, label)} onPress={onPress} style={{ flex: 1, paddingLeft: divider ? 12 : 0, borderLeftWidth: divider ? 1 : 0, borderLeftColor: colors.line }}>
      <Txt variant="item" weight={800} numberOfLines={1} style={FIGURES}>
        {value}
      </Txt>
      {/* Two lines for a long name: "Alexandra owes you" is worth more whole than cut short. */}
      <Txt variant="tiny" weight={600} color="muted" numberOfLines={2}>
        {label}
      </Txt>
    </Tap>
  );
}

function DueSoon({ data }: { data: MoneyResponse }) {
  const router = useRouter();
  const soon = data.dueSoon.slice(0, SOON);
  return (
    <>
      <SectionTitle title={words.money.home.dueSoon} onPress={() => router.push(BILLS)} />
      {soon.length ? (
        <Card style={{ marginHorizontal: layout.barGutter, borderRadius: radius.card, overflow: 'hidden' }}>
          {soon.map((bill, index) => (
            <BillRow key={bill.id} bill={bill} first={index === 0} />
          ))}
        </Card>
      ) : (
        <Txt variant="callout" color="muted" style={{ marginHorizontal: layout.rowGutter }}>
          {words.money.home.nothingDue}
        </Txt>
      )}
    </>
  );
}

function Sheets({ sheets }: { sheets: readonly SheetBriefResponse[] }) {
  const router = useRouter();
  const open = useOpenThing();
  return (
    <>
      <SectionTitle title={words.money.home.sheets} onPress={() => router.push(SHEETS)} />
      <Rail>
        {sheets.map((sheet) => (
          <MiniCard key={sheet.id} tag={sheet.tag || words.money.home.sheetTag} title={sheet.title || words.money.sheet.untitled} onPress={() => open({ kind: 'sheet', id: sheet.id })} />
        ))}
        {sheets.length === 0 ? <MiniCard tag={words.money.home.firstSheet.tag} title={words.money.home.firstSheet.title} fresh onPress={() => router.push(SHEETS)} /> : null}
      </Rail>
    </>
  );
}

/** A sheet as a small card in the rail: its tile, one word for the kind of sheet it is, and its name. */
function MiniCard({ tag, title, fresh, onPress }: { tag: string; title: string; fresh?: boolean; onPress: () => void }) {
  const { colors, shadow } = useTheme();
  return (
    <Tap accessibilityRole="button" accessibilityLabel={words.common.spoken([title, tag])} onPress={onPress} style={{ width: 176, flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 4, padding: 8, borderRadius: radius.photo, backgroundColor: colors.surface, boxShadow: shadow.sm }}>
      {fresh ? (
        <View style={{ width: 44, height: 44, borderRadius: radius.thumb, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentSoft }}>
          <Plus size={20} color={colors.accentText} />
        </View>
      ) : (
        <SheetTile />
      )}
      <View style={{ flex: 1 }}>
        <Txt variant="micro" color="accentText" numberOfLines={1} style={{ textTransform: 'uppercase' }}>
          {tag}
        </Txt>
        <Txt variant="caption" weight={700} numberOfLines={2}>
          {title}
        </Txt>
      </View>
    </Tap>
  );
}

/** The circle's splits, when it has any: each with where the person stands in it. */
function Shared({ splits }: { splits: readonly SplitBriefResponse[] }) {
  const router = useRouter();
  const open = useOpenThing();
  if (splits.length === 0) return null;
  return (
    <>
      <SectionTitle title={words.money.home.shared} onPress={() => router.push(SPLITS)} />
      {splits.map((split) => (
        <SplitRow key={split.id} split={split} onPress={() => open({ kind: 'split', id: split.id })} />
      ))}
    </>
  );
}

/** Loading: grey shapes where the month's card, the bills and the sheets will stand. */
function MoneySkeleton() {
  return (
    <View accessibilityLabel={words.states.loading}>
      <Sk height={146} radius="panel" style={{ marginTop: 16, marginHorizontal: layout.barGutter }} />
      <Sk width={120} height={20} radius="chip" style={{ marginTop: 22, marginBottom: 12, marginHorizontal: layout.barGutter }} />
      <Card style={{ marginHorizontal: layout.barGutter, borderRadius: radius.card }}>
        {[0, 1, 2].map((row) => (
          <View key={row} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 14 }}>
            <Sk width={40} height={40} radius="thumb" />
            <View style={{ flex: 1, gap: 7 }}>
              <Sk width="60%" height={14} radius="chip" />
              <Sk width="45%" height={12} radius="chip" />
            </View>
            <Sk width={56} height={14} radius="chip" />
          </View>
        ))}
      </Card>
      <Sk width={90} height={20} radius="chip" style={{ marginTop: 22, marginBottom: 12, marginHorizontal: layout.barGutter }} />
      <View style={{ flexDirection: 'row', gap: 14, paddingHorizontal: layout.barGutter, overflow: 'hidden' }}>
        <Sk width={176} height={60} radius="photo" />
        <Sk width={176} height={60} radius="photo" />
      </View>
    </View>
  );
}

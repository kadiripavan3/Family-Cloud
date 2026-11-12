import { keepPreviousData, useMutation } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Ellipsis, RotateCcw, Sparkles } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useCache } from '@/api/cache';
import { messageFor } from '@/api/fetcher';
import { createSheet, useGetLoanPlan } from '@/api/generated/homeport';
import { useCircle } from '@/features/circles/current';
import { LoanChart } from '@/features/money/loan/Chart';
import { Slider } from '@/features/money/loan/Slider';
import { FIGURES, Trouble } from '@/features/money/parts';
import { thingHref } from '@/features/things/open';
import { today } from '@/lib/dates';
import { newClientId } from '@/lib/ids';
import { loadState } from '@/lib/loading';
import { formatMoney, formatMoneyAbout, formatMoneyRound } from '@/lib/money';
import { layout, useTheme } from '@/theme';
import { AppBar } from '@/ui/AppBar';
import { Button } from '@/ui/Button';
import { Loading } from '@/ui/Loading';
import { NoteBox } from '@/ui/NoteBox';
import { Problem } from '@/ui/Problem';
import { RoundButton } from '@/ui/RoundButton';
import { Sheet, SheetRow } from '@/ui/Sheet';
import { Sk } from '@/ui/Skeleton';
import { Toggle } from '@/ui/Toggle';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

/** What the sliders open on, and how far each goes. Money is in whole euros here and sent as cents; the rate is in tenths of a percent. */
const START = { borrowed: 240_000, rate: 34, years: 25 };
const BORROWED = { min: 10_000, max: 560_000, step: 5_000 };
const RATE = { min: 0, max: 80, step: 1 };
const YEARS = { min: 5, max: 35, step: 1 };
/** "What if we paid a bit more?": this much more each month, in cents. */
const EXTRA_CENTS = 100_00;
/** How long a slider rests before the API is asked: often enough to follow the finger, not for every pixel. */
const REST_MS = 90;
const CURRENCY = 'EUR';

/** The value once it has stopped changing for a moment. */
function useRested<T>(value: T, ms: number): T {
  const [rested, setRested] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setRested(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return rested;
}

/**
 * 8.8 The loan planner: a template with the maths already inside. Three sliders (what is borrowed, the
 * interest a year, over how many years) and three answers that move with them: what is paid each month,
 * what the interest comes to, and what paying a bit more each month would change. Every figure and every
 * point of the chart comes from the API as the sliders move; nothing is saved until "Keep as a sheet", which
 * makes a sheet of the plan, a row for each year.
 */
export default function LoanPlanner() {
  const { colors } = useTheme();
  const router = useRouter();
  const cache = useCache();
  const circle = useCircle();
  const [set, setSet] = useState(START);
  const [extra, setExtra] = useState(true);
  const [menu, setMenu] = useState(false);
  const clientId = useRef(newClientId());
  const asked = useRested(set, REST_MS);
  const loan = { principalCents: asked.borrowed * 100, ratePercent: asked.rate / 10, years: asked.years };
  const plan = useGetLoanPlan({ ...loan, extraCents: EXTRA_CENTS }, { query: { placeholderData: keepPreviousData } });
  const load = loadState(plan);
  const data = plan.data;

  const keep = useMutation({
    mutationFn: () => createSheet({ clientId: clientId.current, circleId: circle.id, loan: { principalCents: set.borrowed * 100, ratePercent: set.rate / 10, years: set.years, extraCents: extra ? EXTRA_CENTS : undefined }, day: today() }),
    onSuccess: (sheet) => {
      void cache.sheetMade(sheet);
      router.replace(thingHref({ kind: 'sheet', id: sheet.id }));
    },
  });
  const change = (part: Partial<typeof START>) => {
    // Another plan is another sheet: a second "Keep" after moving a slider must not find the first one.
    clientId.current = newClientId();
    setSet((old) => ({ ...old, ...part }));
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar title={words.money.loan.title} trailing={<RoundButton label={words.things.more} icon={(c) => <Ellipsis size={20} color={c} />} onPress={() => setMenu(true)} />} />
      {load.error ? (
        <Problem message={messageFor(load.error)} onRetry={load.retry} retrying={load.retrying} />
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 16 }}>
          <View style={{ alignItems: 'center', gap: 2, marginBottom: 8, marginHorizontal: layout.rowGutter }}>
            <Txt variant="caption" color="muted">
              {words.money.loan.each}
            </Txt>
            {data ? (
              <Txt variant="hero" accessibilityLiveRegion="polite" style={FIGURES}>
                {formatMoneyRound(data.plan.paymentCents, CURRENCY)}
              </Txt>
            ) : load.offline ? (
              <Loading offline />
            ) : (
              <Sk width={170} height={42} radius="tile" />
            )}
            <Txt variant="caption" color="muted" center>
              {data ? words.money.loan.interest(formatMoneyRound(data.plan.interestCents, CURRENCY), data.years) : ' '}
            </Txt>
          </View>

          <View style={{ gap: 4, marginTop: 6, marginHorizontal: layout.rowGutter }}>
            <Slider label={words.money.loan.borrowed} shown={formatMoney(set.borrowed * 100, CURRENCY)} value={set.borrowed} {...BORROWED} onChange={(borrowed) => change({ borrowed })} />
            <Slider label={words.money.loan.rate} shown={words.money.loan.percent((set.rate / 10).toFixed(1))} value={set.rate} {...RATE} onChange={(rate) => change({ rate })} />
            <Slider label={words.money.loan.over} shown={words.money.loan.years(set.years)} value={set.years} {...YEARS} onChange={(years) => change({ years })} />
          </View>

          <View style={{ marginTop: 14, marginHorizontal: layout.rowGutter }}>{data ? <LoanChart plan={data} withExtra={extra} /> : <Sk height={132} radius="field" />}</View>

          {data ? (
            <NoteBox
              soft
              icon={(c) => <Sparkles size={20} color={c} />}
              title={words.money.loan.extra.title(formatMoney(EXTRA_CENTS, CURRENCY))}
              trailing={<Toggle label={words.money.loan.extra.toggle} value={extra} onChange={setExtra} />}
              style={{ alignItems: 'center', marginTop: 12, marginHorizontal: layout.barGutter }}>
              {words.money.loan.extra.body(data.monthsSooner, formatMoneyAbout(data.interestSavedCents, CURRENCY))}
            </NoteBox>
          ) : null}
          <Trouble message={keep.isError ? messageFor(keep.error) : null} />
        </ScrollView>
      )}
      <View style={{ paddingTop: 12, paddingBottom: 12, paddingHorizontal: layout.rowGutter }}>
        <Button label={words.money.loan.keep} size="lg" block disabled={!data} loading={keep.isPending} onPress={() => keep.mutate()} />
      </View>

      <Sheet visible={menu} onClose={() => setMenu(false)}>
        <SheetRow
          first
          icon={(c) => <RotateCcw size={22} color={c} />}
          label={words.money.loan.menu.reset}
          onPress={() => {
            setMenu(false);
            change(START);
            setExtra(true);
          }}
        />
      </Sheet>
    </SafeAreaView>
  );
}

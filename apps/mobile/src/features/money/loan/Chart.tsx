import { useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import type { LoanPlanResponse } from '@/api/generated/homeport';
import { useTheme } from '@/theme';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

/** The chart's own measures, as drawn: the line starts 10 in from each side and 10 down, and the ground line is at 110. */
const PAD = 10;
const TOP = 10;
const GROUND = 110;
const HEIGHT = 132;

/**
 * What is still owed, year by year, as a line falling to the ground: the plan in the accent over its soft
 * area, and (when the extra is counted in) a dotted line that reaches the ground sooner, with a dot where it
 * does. The points are the API's; the chart only places them.
 */
export function LoanChart({ plan, withExtra }: { plan: LoanPlanResponse; withExtra: boolean }) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const years = Math.max(plan.years, 1);
  const most = Math.max(plan.principalCents, 1);
  const x = (year: number) => PAD + ((width - 2 * PAD) * year) / years;
  const y = (owed: number) => TOP + (GROUND - TOP) * (1 - owed / most);
  const line = plan.chart.map((point, index) => `${index === 0 ? 'M' : 'L'}${x(point.year).toFixed(1)} ${y(point.owedCents).toFixed(1)}`).join('');
  // With the extra, the last payment falls between two year marks: the line goes down to the ground there.
  const paidOffAfter = plan.withExtra ? plan.withExtra.payments / 12 : null;
  const sooner = withExtra && paidOffAfter !== null && paidOffAfter < years ? paidOffAfter : null;
  const dotted =
    sooner === null
      ? null
      : [...plan.chart.filter((point) => point.year < sooner && point.owedWithExtraCents !== null).map((point) => ({ at: point.year, owed: point.owedWithExtraCents ?? 0 })), { at: sooner, owed: 0 }]
          .map((point, index) => `${index === 0 ? 'M' : 'L'}${x(point.at).toFixed(1)} ${y(point.owed).toFixed(1)}`)
          .join('');
  const half = years >= 15 ? 10 : Math.round(years / 2);
  const soonerYear = sooner === null ? null : Math.round(sooner);
  const showHalf = half > 0 && half < years && (sooner === null || Math.abs(x(half) - x(sooner)) > 56);
  const showEnd = sooner === null || x(years) - x(sooner) > 26;

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={words.money.loan.chart.spoken(plan.years, soonerYear)} onLayout={(event) => setWidth(event.nativeEvent.layout.width)} style={{ height: HEIGHT }}>
      {width > 0 ? (
        <>
          <Svg width={width} height={HEIGHT}>
            <Path d={`${line}L${x(years).toFixed(1)} ${GROUND}H${PAD}Z`} fill={colors.accentSoft} />
            <Path d={`M${PAD} ${GROUND}H${width - PAD}`} stroke={colors.line} strokeWidth={1} />
            <Path d={line} fill="none" stroke={colors.accent} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
            {dotted && sooner !== null ? (
              <>
                <Path d={dotted} fill="none" stroke={colors.text} strokeWidth={2.5} strokeLinecap="round" strokeDasharray="2 7" />
                <Circle cx={x(sooner)} cy={GROUND} r={4.5} fill={colors.text} />
              </>
            ) : null}
          </Svg>
          <Mark left={PAD + 8} top={GROUND - 20}>
            {words.money.loan.chart.owe}
          </Mark>
          <Mark left={PAD}>{words.money.loan.chart.now}</Mark>
          {showHalf ? <Mark center={x(half)}>{words.money.loan.chart.years(half)}</Mark> : null}
          {sooner !== null ? <Mark center={x(sooner)}>{String(soonerYear)}</Mark> : null}
          {showEnd ? <Mark right={PAD}>{String(plan.years)}</Mark> : null}
        </>
      ) : null}
    </View>
  );
}

/** A few small words on the chart: under the ground line unless `top` says otherwise. */
function Mark({ children, left, right, center, top = GROUND + 6 }: { children: string; left?: number; right?: number; center?: number; top?: number }) {
  const WIDE = 80;
  return (
    <Txt variant="micro" weight={600} color="muted" numberOfLines={1} accessible={false} style={[{ position: 'absolute', top }, center === undefined ? { left, right } : { left: center - WIDE / 2, width: WIDE, textAlign: 'center' }]}>
      {children}
    </Txt>
  );
}

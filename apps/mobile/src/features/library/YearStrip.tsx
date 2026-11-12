import { ChevronRight } from 'lucide-react-native';
import { type ComponentRef, useRef, useState } from 'react';
import { View } from 'react-native';

import { messageFor } from '@/api/fetcher';
import { useGetTimeline } from '@/api/generated/homeport';
import { TAB_BAR_ROOM } from '@/features/home/places';
import { formatMonth, formatMonthName } from '@/lib/dates';
import { loadState } from '@/lib/loading';
import { radius, useTheme } from '@/theme';
import { Loading } from '@/ui/Loading';
import { Tap } from '@/ui/Motion';
import { Problem } from '@/ui/Problem';
import { Sheet, SheetRow } from '@/ui/Sheet';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

import type { Narrow } from './narrow';
import { lastDayOf } from './wallRows';

type StripProps = {
  /** Every year with something in it, the newest first. */
  years: number[];
  /** The year the wall is showing. */
  year: number;
  /** The month the wall is showing, as "2026-11". */
  month: string;
  onYear: (year: number) => void;
  /** The bubble with the month was pressed: it opens the months of that year. */
  onMonth: () => void;
};

/** Room inside the strip above its first year and under its last. */
const PAD = 10;

/**
 * The strip of years down the right edge of the wall, with the month the wall is showing in a bubble beside
 * it. Pressing a year jumps there; so does dragging along the strip and letting go. The bubble opens the
 * months of the year.
 */
export function YearStrip({ years, year, month, onYear, onMonth }: StripProps) {
  const { colors, shadow } = useTheme();
  const [height, setHeight] = useState(0);
  // The year under the finger while it drags along the strip.
  const [dragged, setDragged] = useState<number | null>(null);
  const hovered = useRef<number | null>(null);
  const strip = useRef<ComponentRef<typeof View>>(null);
  // Where the strip's top is on the screen, read when a drag starts.
  const top = useRef(0);

  // Where the finger went down, to tell a press on a year from a drag along the strip.
  const startY = useRef(0);
  const yearAt = (y: number) => {
    if (years.length < 2 || height <= 2 * PAD) return years[0] ?? null;
    const step = (height - 2 * PAD) / (years.length - 1);
    return years[Math.min(years.length - 1, Math.max(0, Math.round((y - PAD) / step)))] ?? null;
  };
  const follow = (y: number) => {
    hovered.current = yearAt(y);
    setDragged(hovered.current);
  };
  const letGo = () => {
    hovered.current = null;
    setDragged(null);
  };

  const lit = dragged ?? year;
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', right: 6, top: 112, bottom: TAB_BAR_ROOM - 14, width: 30 }}>
      <View
        ref={strip}
        // A press is the year's own; only a finger that moves along the strip is a drag.
        onStartShouldSetResponderCapture={(event) => {
          startY.current = event.nativeEvent.pageY;
          return false;
        }}
        onMoveShouldSetResponder={(event) => Math.abs(event.nativeEvent.pageY - startY.current) > 6}
        onResponderGrant={(event) => {
          const { pageY } = event.nativeEvent;
          strip.current?.measureInWindow((_x: number, y: number) => {
            top.current = y;
            follow(pageY - y);
          });
        }}
        onResponderMove={(event) => follow(event.nativeEvent.pageY - top.current)}
        onResponderRelease={() => {
          if (hovered.current !== null) onYear(hovered.current);
          letGo();
        }}
        onResponderTerminate={letGo}
        accessibilityLabel={words.library.wall.strip}
        onLayout={(event) => setHeight(event.nativeEvent.layout.height)}
        style={{ flex: 1, maxHeight: 400, paddingVertical: PAD, alignItems: 'center', justifyContent: 'space-between', borderRadius: radius.field, borderWidth: 1, borderColor: colors.glassLine, backgroundColor: colors.glassStrong, boxShadow: shadow.md }}>
        {years.map((one) => (
          <View key={one} style={{ alignItems: 'center' }}>
            <Tap accessibilityRole="button" accessibilityLabel={words.library.wall.jumpTo(one)} hitSlop={{ top: 8, bottom: 8, left: 10, right: 6 }} onPress={() => onYear(one)} scaleTo={0.9}>
              <Txt variant="micro" allowFontScaling={false} style={{ color: one === lit ? colors.text : colors.muted }}>
                {one}
              </Txt>
            </Tap>
            {one === lit ? (
              <View style={{ position: 'absolute', right: 30, top: -12, width: 200, alignItems: 'flex-end' }}>
                <Tap
                  accessibilityRole="button"
                  accessibilityLabel={words.library.wall.monthSpoken(formatMonth(month))}
                  disabled={dragged !== null}
                  onPress={onMonth}
                  scaleTo={0.95}
                  style={{ paddingVertical: 8, paddingHorizontal: 14, borderRadius: radius.photo, backgroundColor: colors.text, boxShadow: shadow.md }}>
                  <Txt variant="caption" weight={800} numberOfLines={1} style={{ color: colors.bg }}>
                    {dragged === null ? formatMonth(month) : dragged}
                  </Txt>
                </Tap>
              </View>
            ) : null}
          </View>
        ))}
      </View>
    </View>
  );
}

type MonthsProps = {
  circleId: string;
  narrow: Narrow;
  year: number;
  visible: boolean;
  onClose: () => void;
  /** Jump to this day and go back from there. */
  onJump: (day: string) => void;
  /** Open the whole year, month by month. */
  onSeeYear: () => void;
};

/** The months of one year with what each holds: pressing one makes the wall start there. The last row opens the whole year. */
export function MonthsSheet({ circleId, narrow, year, visible, onClose, onJump, onSeeYear }: MonthsProps) {
  const { colors } = useTheme();
  const timeline = useGetTimeline(circleId, { ...narrow, year, tiles: 0 }, { query: { enabled: visible } });
  const load = loadState(timeline);
  const months = timeline.data?.year === year ? timeline.data.months : undefined;
  return (
    <Sheet visible={visible} onClose={onClose} title={words.library.wall.months.title(year)}>
      {load.error ? (
        <View style={{ minHeight: 200 }}>
          <Problem message={messageFor(load.error)} onRetry={load.retry} retrying={load.retrying} />
        </View>
      ) : !months ? (
        <View style={{ minHeight: 200 }}>
          <Loading offline={load.offline} />
        </View>
      ) : (
        <>
          {months.map((one, index) => (
            <SheetRow key={one.month ?? index} first={index === 0} label={formatMonthName(one.month ?? '')} note={words.library.counts(one.photos ?? 0, one.videos ?? 0)} onPress={() => onJump(lastDayOf(one.month ?? ''))} />
          ))}
          <SheetRow label={words.library.wall.months.seeYear(year)} onPress={onSeeYear} trailing={<ChevronRight size={18} color={colors.muted} />} />
        </>
      )}
    </Sheet>
  );
}

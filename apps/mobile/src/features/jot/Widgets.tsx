import { Check, Mic, Plus } from 'lucide-react-native';
import { type ReactNode, useState } from 'react';
import { type StyleProp, View, type ViewStyle } from 'react-native';

import type { CircleResponse, NextLineResponse, WidgetLineResponse, WidgetListResponse } from '@/api/generated/homeport';
import { AudienceChip } from '@/features/sharing/AudienceChip';
import { fromISODate } from '@/lib/dates';
import { radius, useTheme } from '@/theme';
import { BrandMark } from '@/ui/Brand';
import { Tap } from '@/ui/Motion';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

import { sameLines, widgetLines } from './widgetLines';

/**
 * The three widgets of the Home Screen, drawn inside the app from the same answer the real ones get
 * (`getWidgets`). The real ones are native code (native/jot); these are what they will look like, and they
 * work: a chip adds, a circle ticks.
 */

/** A widget's own card. */
function Widget({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { colors, shadow } = useTheme();
  return <View style={[{ gap: 9, minHeight: 164, padding: 14, borderRadius: radius.stage, backgroundColor: colors.surface, boxShadow: shadow.md }, style]}>{children}</View>;
}

function WidgetHead({ title, small, leading, trailing }: { title: string; small?: string; leading?: ReactNode; trailing?: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 24 }}>
      {leading}
      <Txt variant="item" weight={800} numberOfLines={1} accessibilityRole="header" style={{ flex: 1 }}>
        {title}
      </Txt>
      {small ? (
        <Txt variant="small" weight={700} color="muted">
          {small}
        </Txt>
      ) : null}
      {trailing}
    </View>
  );
}

type JotProps = {
  circle: CircleResponse;
  /** What this circle adds most: one tap each. */
  chips: readonly string[];
  /** The chip that was just added, shown with a tick for a moment. */
  justAdded?: string | null;
  /** The chip whose add is on its way. */
  adding?: string | null;
  onChip: (chip: string) => void;
  /** Neither phone lets you type inside a widget: the line opens the jot bar. */
  onLine: () => void;
  onMic: () => void;
};

/** The wide one: a line that opens the jot bar, a mic, and the chips. */
export function JotWidget({ circle, chips, justAdded, adding, onChip, onLine, onMic }: JotProps) {
  const { colors } = useTheme();
  return (
    <Widget style={{ minHeight: 0, gap: 11 }}>
      <WidgetHead
        title={words.jot.widgets.title}
        leading={<BrandMark size={24} />}
        // What a chip adds goes on the circle's shopping list, which everyone sees.
        trailing={<AudienceChip quiet thing={{ circleId: circle.id, chip: { audience: 'circle' } }} />}
      />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 46, paddingLeft: 14, paddingRight: 5, borderRadius: radius.pill, backgroundColor: colors.fill }}>
        <Tap accessibilityRole="button" accessibilityLabel={words.jot.widgets.fieldLabel} onPress={onLine} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 46 }}>
          <Plus size={18} color={colors.muted} />
          <Txt variant="control" weight={500} color="muted" numberOfLines={1} style={{ flex: 1 }}>
            {words.jot.widgets.field}
          </Txt>
        </Tap>
        <Tap accessibilityRole="button" accessibilityLabel={words.jot.widgets.mic} hitSlop={4} onPress={onMic} scaleTo={0.9} style={{ width: 36, height: 36, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent }}>
          <Mic size={17} color={colors.onAccent} />
        </Tap>
      </View>
      {chips.length ? (
        <View style={{ flexDirection: 'row', gap: 6, overflow: 'hidden' }}>
          {chips.slice(0, 4).map((chip) => (
            <Tap
              key={chip}
              accessibilityRole="button"
              accessibilityLabel={words.jot.widgets.addChip(chip)}
              accessibilityState={{ busy: adding === chip }}
              disabled={!!adding}
              hitSlop={{ top: 7, bottom: 7 }}
              onPress={() => onChip(chip)}
              scaleTo={0.94}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 7, paddingLeft: 8, paddingRight: 11, borderRadius: radius.field, backgroundColor: colors.accentSoft, opacity: adding && adding !== chip ? 0.6 : 1 }}>
              {justAdded === chip ? <Check size={13} color={colors.accentText} strokeWidth={2.8} /> : <Plus size={13} color={colors.accentText} strokeWidth={2.8} />}
              <Txt variant="caption" weight={700} color="accentText">
                {chip}
              </Txt>
            </Tap>
          ))}
        </View>
      ) : null}
    </Widget>
  );
}

/**
 * The lines a widget shows of a list, and how one is ticked here: `const [lines, tick] = useWidgetLines(…)`.
 * What is ticked here stays where it is until the screen is left (`widgetLines`), also when the API's next
 * answer has moved it down among the ticked.
 */
export function useWidgetLines(lines: readonly WidgetLineResponse[], room: number): [shown: WidgetLineResponse[], tick: (line: WidgetLineResponse) => WidgetLineResponse[]] {
  const [shown, setShown] = useState<WidgetLineResponse[]>(() => widgetLines(lines, [], room));
  const [seen, setSeen] = useState(lines);
  // A fresh answer from the API: the rows follow it, keeping what was ticked here in its place.
  if (seen !== lines) {
    setSeen(lines);
    const next = widgetLines(lines, shown, room);
    if (!sameLines(next, shown)) setShown(next);
  }
  const tick = (line: WidgetLineResponse) => {
    const next = shown.map((one) => (one.id === line.id ? { ...one, done: !one.done } : one));
    setShown(next);
    return next;
  };
  return [shown, tick];
}

/** One line with its circle to tick. `tone` is "glass" on the Lock Screen, where the circles are light rings on the photo. */
export function TickLine({ line, onTick, tone = 'card', compact }: { line: WidgetLineResponse; onTick: () => void; tone?: 'card' | 'glass'; compact?: boolean }) {
  const { colors } = useTheme();
  const glass = tone === 'glass';
  return (
    <Tap
      accessibilityRole="checkbox"
      accessibilityLabel={line.text}
      accessibilityState={{ checked: line.done }}
      // Said this way, a browser hears whether it is ticked as well: the web takes no `accessibilityState`.
      aria-checked={line.done}
      hitSlop={{ top: 6, bottom: 6 }}
      onPress={onTick}
      scaleTo={0.96}
      style={{ flexDirection: 'row', alignItems: 'center', gap: glass ? 6 : 9, minHeight: 22, opacity: glass && line.done ? 0.6 : 1, flexShrink: 1 }}>
      <View
        style={{
          width: glass ? 22 : 21,
          height: glass ? 22 : 21,
          borderRadius: radius.pill,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: line.done ? 0 : 2,
          borderColor: glass ? colors.photoGlassLine : colors.lineStrong,
          backgroundColor: line.done ? colors.accent : 'transparent',
        }}>
        {line.done ? <Check size={12} color={colors.onAccent} strokeWidth={3} /> : null}
      </View>
      <Txt variant={glass ? 'note' : 'callout'} weight={600} numberOfLines={1} style={{ flexShrink: compact ? 1 : undefined, flex: compact ? undefined : 1, color: glass ? colors.onPhoto : line.done ? colors.muted : colors.text, textDecorationLine: line.done ? 'line-through' : 'none' }}>
        {line.text}
      </Txt>
    </Tap>
  );
}

type ListProps = {
  /** The shopping list, or null while the circle has none. */
  list: WidgetListResponse | null;
  onTick: (line: WidgetLineResponse) => void;
  /** Its name opens the list itself. */
  onOpen: () => void;
};

/** The small one with a list you tick. */
export function ListWidget({ list, onTick, onOpen }: ListProps) {
  const [lines, tick] = useWidgetLines(list?.lines ?? NO_LINES, 3);
  if (!list) {
    return (
      <Widget style={{ flex: 1 }}>
        <WidgetHead title={words.jot.widgets.shopping} />
        <Txt variant="footnote" color="muted">
          {words.jot.widgets.noList}
        </Txt>
      </Widget>
    );
  }
  return (
    <Widget style={{ flex: 1 }}>
      <Tap accessibilityRole="button" accessibilityLabel={words.common.spoken([list.title, words.jot.widgets.left(list.left)])} hitSlop={6} onPress={onOpen}>
        <WidgetHead title={list.title} small={words.jot.widgets.left(list.left)} />
      </Tap>
      {lines.map((line) => (
        <TickLine
          key={line.id}
          line={line}
          onTick={() => {
            tick(line);
            onTick(line);
          }}
        />
      ))}
    </Widget>
  );
}
const NO_LINES: WidgetLineResponse[] = [];

/** The small one with what is next today: three lines at most. */
export function TodayWidget({ day, next, onOpen }: { day: string; next: readonly NextLineResponse[]; onOpen: (line: NextLineResponse) => void }) {
  const date = fromISODate(day);
  return (
    <Widget style={{ flex: 1 }}>
      <WidgetHead title={words.jot.widgets.today} small={words.jot.widgets.day(date.getDay(), date.getDate(), date.getMonth())} />
      {next.length === 0 ? (
        <Txt variant="footnote" color="muted">
          {words.jot.widgets.nothingNext}
        </Txt>
      ) : null}
      {next.slice(0, 3).map((line, index) => (
        <Tap key={line.thingId ?? index} accessibilityRole="button" accessibilityLabel={words.common.spoken([line.lead, line.title])} disabled={!line.thingId} hitSlop={{ top: 4, bottom: 4 }} onPress={() => onOpen(line)} style={{ flexDirection: 'row', gap: 8 }}>
          {line.lead ? (
            <Txt variant="note" weight={800} style={{ width: 40 }}>
              {line.lead}
            </Txt>
          ) : null}
          <Txt variant="note" weight={600} numberOfLines={1} style={{ flex: 1 }}>
            {line.title}
          </Txt>
        </Tap>
      ))}
    </Widget>
  );
}

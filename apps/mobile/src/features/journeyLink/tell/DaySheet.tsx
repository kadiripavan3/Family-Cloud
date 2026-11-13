import { EyeOff, Play } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import type { JourneyDraftChangeRequest, JourneyDraftDay, JourneyDraftItem } from '@/api/generated/homeport';
import { formatWeekdayPast } from '@/lib/dates';
import { layout, radius, useTheme, withAlpha } from '@/theme';
import { Button } from '@/ui/Button';
import { Field } from '@/ui/Field';
import { Tap } from '@/ui/Motion';
import { Photo } from '@/ui/Photo';
import { Sheet } from '@/ui/Sheet';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

type Props = {
  /** The day that is being changed. Null while the sheet is shut. */
  day: JourneyDraftDay | null;
  /** Every day of the draft, to move a photo to. */
  days: readonly JourneyDraftDay[];
  onClose: () => void;
  /** Sends one change of the draft. */
  onChange: (change: JourneyDraftChangeRequest) => void;
  busy?: boolean;
  problem?: string | null;
};

/**
 * One day of a draft, to change: its first line, and every photo and clip in it. A photo that is tapped
 * can go to another day of the draft, be left out, or be put back.
 */
export function DaySheet({ day, days, onClose, onChange, busy, problem }: Props) {
  const says = words.together.tell;
  // The photo that was tapped: what can be done with it stands under the photos, wherever the sheet is scrolled to.
  const [held, setHeld] = useState<string | null>(null);
  const date = day?.day ?? '';
  const picked = (day?.items ?? []).find((item) => item.itemId === held);
  const others = days.filter((other) => other.day && other.day !== date);
  const close = () => {
    setHeld(null);
    onClose();
  };
  const act = (change: JourneyDraftChangeRequest) => {
    setHeld(null);
    onChange(change);
  };
  return (
    <Sheet
      visible={!!date}
      onClose={close}
      title={says.day(day?.number ?? 1)}
      subtitle={date ? formatWeekdayPast(date) : undefined}
      tall
      footer={
        picked ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, paddingTop: 12, paddingHorizontal: layout.barGutter }}>
            {picked.dropped ? (
              <Button label={says.sheet.restore} size="sm" inline disabled={busy} onPress={() => act({ restore: [picked.itemId ?? ''] })} />
            ) : (
              <>
                {others.map((other) => (
                  <Button key={other.day} label={says.sheet.moveTo(says.day(other.number ?? 1))} size="sm" variant="soft" inline disabled={busy} onPress={() => act({ move: [{ itemId: picked.itemId ?? '', day: other.day ?? '' }] })} />
                ))}
                <Button label={says.sheet.drop} size="sm" variant="soft" inline disabled={busy} icon={(c) => <EyeOff size={15} color={c} />} onPress={() => act({ drop: [picked.itemId ?? ''] })} />
              </>
            )}
          </View>
        ) : undefined
      }>
      {/* Each day opens with its own line. */}
      {day && date ? <Inside key={date} day={day} date={date} held={held} onHold={setHeld} onChange={onChange} problem={problem} /> : null}
    </Sheet>
  );
}

function Inside({ day, date, held, onHold, onChange, problem }: { day: JourneyDraftDay; date: string; held: string | null; onHold: (itemId: string | null) => void; onChange: (change: JourneyDraftChangeRequest) => void; problem?: string | null }) {
  const says = words.together.tell;
  const [line, setLine] = useState(day.line ?? '');
  const items = day.items ?? [];
  const saveLine = () => {
    if (line.trim() !== (day.line ?? '').trim()) onChange({ days: [{ day: date, line: line.trim() }] });
  };

  return (
    <>
      <View style={{ paddingHorizontal: layout.rowGutter }}>
        <Field label={says.sheet.line} placeholder={says.sheet.linePlaceholder} value={line} onChangeText={setLine} onBlur={saveLine} onSubmitEditing={saveLine} maxLength={120} returnKeyType="done" />
      </View>
      {problem ? (
        <Txt variant="caption" color="danger" accessibilityLiveRegion="polite" style={{ marginTop: 8, marginHorizontal: layout.gutter }}>
          {problem}
        </Txt>
      ) : null}
      <Txt variant="footnote" color="muted" style={{ marginTop: 12, marginBottom: 8, marginHorizontal: layout.gutter }}>
        {says.sheet.hint}
      </Txt>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: layout.barGutter - 2, paddingBottom: 16 }}>
        {items.map((item, index) => (
          <DraftTile key={item.itemId ?? index} item={item} held={item.itemId === held} onPress={() => onHold(item.itemId === held ? null : (item.itemId ?? null))} />
        ))}
      </View>
    </>
  );
}

/** One photo or clip of a day, a quarter of the sheet wide. One that was left out is dimmed; the picked one has a ring. */
function DraftTile({ item, held, onPress }: { item: JourneyDraftItem; held: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  const clip = item.kind === 'video';
  return (
    <View style={{ width: '25%', padding: 2 }}>
      <Tap accessibilityRole="button" accessibilityLabel={words.together.tell.sheet.photo(!!item.dropped, clip)} aria-selected={held} onPress={onPress} scaleTo={0.95}>
        <Photo uri={item.thumbUrl} radius="tile" style={{ aspectRatio: 1, borderWidth: held ? 3 : 0, borderColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
          {clip ? <Play size={18} color={colors.onPhoto} fill={colors.onPhoto} /> : null}
          {item.dropped ? <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: withAlpha(colors.bg, 0.72), borderRadius: radius.tile }} /> : null}
        </Photo>
      </Tap>
    </View>
  );
}

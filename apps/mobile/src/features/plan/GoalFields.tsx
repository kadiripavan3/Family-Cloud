import { CalendarCheck } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { formatDayLong, today } from '@/lib/dates';
import { layout, radius, useTheme } from '@/theme';
import { Button } from '@/ui/Button';
import { DayPicker } from '@/ui/DayPicker';
import { Emoji } from '@/ui/Emoji';
import { Field, FieldButton } from '@/ui/Field';
import { Tap } from '@/ui/Motion';
import { Segmented } from '@/ui/Segmented';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

import type { GoalDraft, GoalKind } from './goalDraft';

/** The pictures a goal can carry in its ring: each has its own 3D icon. */
const EMOJI = ['🎯', '💰', '✈️', '🏠', '🚗', '📚', '🏃', '⭐', '🎁', '🏆'];
const KINDS: readonly GoalKind[] = ['money', 'count', 'steps'];

type Props = {
  draft: GoalDraft;
  onChange: (change: (old: GoalDraft) => GoalDraft) => void;
  /** What a goal counts is chosen when it starts and stays: the form for changing one leaves the choice out. */
  fixedKind?: boolean;
  /** What is wrong with a box, by its name: the app's own checks and what the API said. */
  problems?: Record<string, string | undefined>;
  autoFocus?: boolean;
};

/**
 * What a goal is made of: its name and a few words, the picture in its ring, what it counts (money, a
 * number of something, or the ticked steps of a list), how much or how many, what there is already, and
 * the day to be done by. The same for a new goal and for changing one.
 */
export function GoalFields({ draft, onChange, fixedKind, problems = {}, autoFocus }: Props) {
  const { colors } = useTheme();
  const says = words.plan.goalForm;
  const [pickingDay, setPickingDay] = useState(false);
  const counted = draft.kind === 'steps' ? null : draft.kind;

  return (
    <View style={{ gap: 12, paddingHorizontal: layout.rowGutter }}>
      <Field label={says.title} value={draft.title} onChangeText={(title) => onChange((old) => ({ ...old, title }))} maxLength={200} autoFocus={autoFocus} placeholder={says.titlePlaceholder} error={problems.title} />
      <Field label={says.blurb} value={draft.blurb} onChangeText={(blurb) => onChange((old) => ({ ...old, blurb }))} maxLength={300} placeholder={says.blurbPlaceholder} error={problems.blurb} />

      <View accessibilityRole="radiogroup" accessibilityLabel={says.emoji} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {EMOJI.map((emoji) => {
          const on = draft.emoji === emoji;
          return (
            <Tap
              key={emoji}
              accessibilityRole="radio"
              accessibilityLabel={emoji}
              accessibilityState={{ checked: on }}
              // Said this way, a browser hears which one is chosen as well: the web takes no `accessibilityState`.
              aria-checked={on}
              onPress={() => onChange((old) => ({ ...old, emoji }))}
              scaleTo={0.9}
              style={{ width: 46, height: 46, borderRadius: radius.thumb, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.fill, borderWidth: on ? 2 : 0, borderColor: colors.text }}>
              <Emoji char={emoji} size={26} />
            </Tap>
          );
        })}
      </View>

      {fixedKind ? null : (
        <View style={{ gap: 6 }}>
          <Segmented label={says.kind} style={{ marginHorizontal: 0 }} options={KINDS.map((id) => ({ id, label: says.kinds[id] }))} value={draft.kind} onChange={(kind) => onChange((old) => ({ ...old, kind }))} />
          <Txt variant="caption" weight={500} color="muted" style={{ marginHorizontal: 4 }}>
            {says.kindNotes[draft.kind]}
          </Txt>
        </View>
      )}

      {counted ? (
        <>
          <Field label={says.target[counted]} value={draft.target} onChangeText={(target) => onChange((old) => ({ ...old, target }))} keyboardType={counted === 'money' ? 'decimal-pad' : 'number-pad'} placeholder={counted === 'money' ? '8000' : '20'} error={problems.target} />
          {counted === 'count' ? <Field label={says.unitWords} value={draft.unitWords} onChangeText={(unitWords) => onChange((old) => ({ ...old, unitWords }))} maxLength={40} autoCapitalize="none" placeholder={says.unitWordsPlaceholder} error={problems.unitWords} /> : null}
          {fixedKind ? null : <Field label={says.current[counted]} value={draft.current} onChangeText={(current) => onChange((old) => ({ ...old, current }))} keyboardType={counted === 'money' ? 'decimal-pad' : 'number-pad'} placeholder="0" error={problems.current} />}
        </>
      ) : fixedKind ? null : (
        <Field label={says.steps} value={draft.steps} onChangeText={(steps) => onChange((old) => ({ ...old, steps }))} multiline placeholder={says.stepsPlaceholder} error={problems.steps} />
      )}

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <FieldButton label={says.by} value={draft.by ? formatDayLong(draft.by) : says.noDay} icon={<CalendarCheck size={18} color={colors.text} />} onPress={() => setPickingDay(true)} />
        {draft.by ? <Button label={says.removeDay} variant="soft" size="sm" inline onPress={() => onChange((old) => ({ ...old, by: null }))} /> : null}
      </View>
      <DayPicker visible={pickingDay} onClose={() => setPickingDay(false)} title={says.by} value={draft.by ?? today()} min={today()} onChange={(by) => onChange((old) => ({ ...old, by }))} />
    </View>
  );
}

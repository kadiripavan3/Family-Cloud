import { useMutation } from '@tanstack/react-query';
import { Sigma, Trash2 } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { View } from 'react-native';

import { useCache } from '@/api/cache';
import { ApiError, messageFor } from '@/api/fetcher';
import { addSheetColumn, changeSheetColumn, type ColumnKind, type ColumnResponse, removeSheetColumn, type SheetResponse, type Summary } from '@/api/generated/homeport';
import { today } from '@/lib/dates';
import { newClientId } from '@/lib/ids';
import { layout, radius, useTheme } from '@/theme';
import { Button } from '@/ui/Button';
import { ConfirmSheet } from '@/ui/ConfirmSheet';
import { Field } from '@/ui/Field';
import { Tap } from '@/ui/Motion';
import { Sheet, SheetRow } from '@/ui/Sheet';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

import { ChoiceChips, FormLabel, Trouble } from '../parts';
import { KindIcon } from './cells';

const KINDS: readonly ColumnKind[] = ['text', 'number', 'money', 'date', 'tick', 'choice', 'person', 'formula'];

/** What can stand under a column in the row of totals, by what the column holds. The API holds to the same. */
export function summariesFor(kind: ColumnKind): Summary[] {
  const figures = kind === 'number' || kind === 'money' || kind === 'formula';
  return ['none', ...(figures ? (['sum', 'avg'] as const) : []), 'count', ...(figures || kind === 'date' ? (['min', 'max'] as const) : []), ...(kind === 'tick' || kind === 'formula' ? (['ticked'] as const) : [])];
}

type Props = {
  sheet: SheetResponse;
  visible: boolean;
  onClose: () => void;
  /** The column to change. Left out: a new one is added to the end of the tab. */
  column?: ColumnResponse;
  /** A formula column is built from chips: the sheet hands over to the builder, with the name typed here for a new one. */
  onFormula: (column: ColumnResponse | null, name: string) => void;
};

/**
 * The sheet for one column: its name, what it holds (its kind, with the choices for a choice), and what
 * stands under it in the row of totals. A column that holds values keeps its kind, except between text and
 * a choice; a formula column's formula is changed in the builder. Removing it removes what it held.
 */
export function ColumnSheet(props: Props) {
  // Each time it opens it starts from the column as it is now.
  return props.visible ? <Open key={props.column?.id ?? 'new'} {...props} /> : null;
}

function Open({ sheet, onClose, column, onFormula }: Props) {
  const cache = useCache();
  const [name, setName] = useState(column?.name ?? '');
  const [kind, setKind] = useState<ColumnKind>(column?.kind ?? 'text');
  const [options, setOptions] = useState((column?.options ?? []).join('\n'));
  const [summary, setSummary] = useState<Summary>(column?.summary ?? 'none');
  const [removing, setRemoving] = useState(false);
  const clientId = useRef(newClientId());
  const summaries = summariesFor(kind);
  const shownSummary = summaries.includes(summary) ? summary : 'none';
  /** A column that holds values keeps its kind, except between text and a choice. */
  const kinds = !column ? KINDS : column.kind === 'text' || column.kind === 'choice' ? (['text', 'choice'] as const) : [column.kind];
  const choices = options.split('\n').map((line) => line.trim()).filter(Boolean);

  const save = useMutation({
    mutationFn: () => {
      const day = { day: today() };
      if (column) return changeSheetColumn(column.id, { name: name.trim(), kind: kind === column.kind ? undefined : kind, options: kind === 'choice' ? choices : undefined, summary: shownSummary }, day);
      return addSheetColumn(sheet.tab.id, { clientId: clientId.current, name: name.trim(), kind, options: kind === 'choice' ? choices : undefined, summary: shownSummary }, day);
    },
    onSuccess: () => {
      void cache.sheetChanged(sheet);
      onClose();
    },
  });
  const remove = useMutation({
    mutationFn: () => removeSheetColumn(column!.id),
    onSuccess: () => {
      void cache.sheetChanged(sheet);
      setRemoving(false);
      onClose();
    },
  });
  const failed = save.error instanceof ApiError ? save.error : null;
  const named = name.trim().length > 0;
  // A new formula column gets its formula first: the builder adds the column.
  const toBuilder = !column && kind === 'formula';

  return (
    <>
      <Sheet visible onClose={onClose} title={column ? column.name : words.money.sheet.columnSheet.new}>
        <View style={{ gap: 10, paddingTop: 6, paddingHorizontal: layout.rowGutter }}>
          <Field label={words.money.sheet.columnSheet.name} value={name} onChangeText={setName} maxLength={60} placeholder={words.money.sheet.columnSheet.namePlaceholder} autoFocus={!column} error={failed?.fields.name} />
          <FormLabel>{words.money.sheet.columnSheet.kind}</FormLabel>
          <View accessibilityRole="radiogroup" accessibilityLabel={words.money.sheet.columnSheet.kind} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {kinds.map((one) => (
              <KindChip key={one} kind={one} currency={sheet.currency} on={one === kind} onPress={() => setKind(one)} />
            ))}
          </View>
          {kind === 'choice' ? <Field label={words.money.sheet.columnSheet.options} note={words.money.sheet.columnSheet.optionsNote} value={options} onChangeText={setOptions} multiline maxLength={1000} placeholder={words.money.sheet.columnSheet.optionsPlaceholder} error={failed?.fields.options} /> : null}
          {toBuilder ? null : (
            <>
              <FormLabel>{words.money.sheet.columnSheet.total}</FormLabel>
              <ChoiceChips label={words.money.sheet.columnSheet.total} options={summaries.map((id) => ({ id, label: words.money.sheet.columnSheet.totals[id] }))} value={shownSummary} onChange={setSummary} />
            </>
          )}
          <Trouble message={save.isError && !(failed?.fields.name || failed?.fields.options) ? messageFor(save.error) : null} style={{ marginTop: 0, marginHorizontal: 4 }} />
          {toBuilder ? (
            <Button label={words.money.sheet.columnSheet.formulaNext} size="lg" block disabled={!named} icon={(c) => <Sigma size={18} color={c} />} onPress={() => onFormula(null, name.trim())} style={{ marginTop: 6 }} />
          ) : (
            <Button label={column ? words.money.sheet.save : words.money.sheet.add} size="lg" block disabled={!named || (kind === 'choice' && choices.length === 0)} loading={save.isPending} onPress={() => save.mutate()} style={{ marginTop: 6 }} />
          )}
        </View>
        {column ? (
          <View style={{ marginTop: 10 }}>
            {column.kind === 'formula' ? <SheetRow first icon={(c) => <Sigma size={22} color={c} />} label={words.money.sheet.columnSheet.formula} note={column.problem ?? column.says ?? undefined} onPress={() => onFormula(column, column.name)} /> : null}
            <SheetRow first={column.kind !== 'formula'} danger icon={(c) => <Trash2 size={22} color={c} />} label={words.money.sheet.columnSheet.remove} onPress={() => setRemoving(true)} />
          </View>
        ) : null}
      </Sheet>
      <ConfirmSheet
        visible={removing}
        onClose={() => setRemoving(false)}
        title={words.money.sheet.columnSheet.removeAsk.title}
        body={words.money.sheet.columnSheet.removeAsk.body}
        confirm={words.money.sheet.columnSheet.removeAsk.confirm}
        busy={remove.isPending}
        problem={remove.isError ? messageFor(remove.error) : null}
        onConfirm={() => remove.mutate()}
      />
    </>
  );
}

/** One kind a column can hold, as a chip: its icon and its name. */
function KindChip({ kind, currency, on, onPress }: { kind: ColumnKind; currency: string; on: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  const color = on ? colors.bg : colors.text;
  return (
    <Tap
      accessibilityRole="radio"
      accessibilityLabel={words.common.spoken([words.money.sheet.kinds[kind].name, words.money.sheet.kinds[kind].note])}
      accessibilityState={{ checked: on }}
      // Said this way, a browser hears which one is chosen as well: the web takes no `accessibilityState`.
      aria-checked={on}
      hitSlop={{ top: 4, bottom: 4 }}
      onPress={onPress}
      scaleTo={0.94}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 9, paddingHorizontal: 13, borderRadius: radius.pill, borderWidth: 1.5, borderColor: on ? colors.text : colors.line, backgroundColor: on ? colors.text : colors.bg }}>
      <KindIcon kind={kind} currency={currency} size={14} color={color} />
      <Txt variant="note" weight={700} style={{ color }}>
        {words.money.sheet.kinds[kind].name}
      </Txt>
    </Tap>
  );
}

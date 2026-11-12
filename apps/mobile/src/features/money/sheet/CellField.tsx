import { Calendar, Check, TriangleAlert } from 'lucide-react-native';
import { type ReactNode, useState } from 'react';
import { View } from 'react-native';

import type { CellResponse, ColumnResponse, MemberResponse } from '@/api/generated/homeport';
import { formatDay, today } from '@/lib/dates';
import { formatMoneyExact, moneyToType, parseMoney } from '@/lib/money';
import { firstName } from '@/lib/names';
import { layout, radius, useTheme } from '@/theme';
import { Avatar } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { DayPicker } from '@/ui/DayPicker';
import { Field, FieldButton } from '@/ui/Field';
import { Tap } from '@/ui/Motion';
import { Sheet, SheetRow } from '@/ui/Sheet';
import { Toggle } from '@/ui/Toggle';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

import { cellText, formatNumber, peopleOf } from './cells';

/** What a cell is sent as: words, a number as text, whole cents, a day, a tick, member ids; null empties it. */
export type CellValue = string | number | boolean | string[] | null;

type Props = {
  column: ColumnResponse;
  cell: CellResponse | undefined;
  currency: string;
  /** The people of the sheet's circle, for a column of people. */
  members: readonly MemberResponse[];
  canEdit: boolean;
  onSave: (value: CellValue) => void;
};

/** True for a column whose box takes the whole width of the card; the others stand two to a line. */
export function isWide(column: ColumnResponse): boolean {
  return column.kind === 'text';
}

/**
 * One cell of a row, as a box on the row's card, changed in the way its column's kind asks for: words and
 * figures are typed (and saved when the box is left), a day is picked from the calendar, a tick is a
 * switch, a choice and a person are picked from a sheet. A formula's cell is read only, and when it can't
 * be worked out it says why.
 */
export function CellField({ column, cell, currency, members, canEdit, onSave }: Props) {
  if (column.kind === 'formula' || !canEdit) return <ReadOnly column={column} cell={cell} currency={currency} />;
  switch (column.kind) {
    case 'text':
      return <Typed column={column} start={cell?.text ?? ''} read={(text) => ({ value: text.trim() || null })} onSave={onSave} />;
    case 'number':
      return (
        <Typed
          column={column}
          start={cell?.number === null || cell?.number === undefined ? '' : String(cell.number)}
          shown={cell?.number === null || cell?.number === undefined ? undefined : formatNumber(cell.number)}
          keyboardType="decimal-pad"
          read={(text) => (text.trim() === '' ? { value: null } : /^-?\d+([.,]\d+)?$/.test(text.trim()) ? { value: text.trim().replace(',', '.') } : { problem: words.money.rowCard.numberWrong })}
          onSave={onSave}
        />
      );
    case 'money':
      return (
        <Typed
          column={column}
          start={moneyToType(cell?.cents)}
          shown={cell?.cents === null || cell?.cents === undefined ? undefined : formatMoneyExact(cell.cents, currency)}
          keyboardType="decimal-pad"
          read={(text) => {
            if (text.trim() === '') return { value: null };
            const cents = parseMoney(text);
            return cents === null ? { problem: words.money.rowCard.amountWrong } : { value: cents };
          }}
          onSave={onSave}
        />
      );
    case 'date':
      return <Day column={column} cell={cell} onSave={onSave} />;
    case 'tick':
      return <Tick column={column} on={cell?.ticked === true} onSave={onSave} />;
    case 'choice':
      return <Choice column={column} chosen={cell?.text ?? null} onSave={onSave} />;
    default:
      return <People column={column} cell={cell} members={members} onSave={onSave} />;
  }
}

type TypedProps = {
  column: ColumnResponse;
  start: string;
  /** What stands in the box while nobody is typing in it: an amount written as money. */
  shown?: string;
  keyboardType?: 'decimal-pad';
  /** What was typed, as the cell is sent; or why it can't be. */
  read: (text: string) => { value: CellValue } | { problem: string };
  onSave: (value: CellValue) => void;
};

/** A box that is typed in. It is saved when it is left, if what stands in it changed and can be read. */
function Typed({ column, start, shown, keyboardType, read, onSave }: TypedProps) {
  const [text, setText] = useState(start);
  const [focused, setFocused] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <Field
      label={column.name}
      value={focused || shown === undefined || text !== start ? text : shown}
      onChangeText={(next) => {
        setText(next);
        setProblem(null);
      }}
      keyboardType={keyboardType}
      maxLength={column.kind === 'text' ? 2000 : 24}
      error={problem}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        if (text === start) return;
        const result = read(text);
        if ('problem' in result) setProblem(result.problem);
        else onSave(result.value);
      }}
    />
  );
}

function Day({ column, cell, onSave }: { column: ColumnResponse; cell: CellResponse | undefined; onSave: (value: CellValue) => void }) {
  const { colors } = useTheme();
  const [picking, setPicking] = useState(false);
  return (
    <>
      <FieldButton label={column.name} value={cell?.date ? formatDay(cell.date) : words.money.rowCard.notADay} icon={<Calendar size={18} color={colors.text} />} onPress={() => setPicking(true)} />
      <DayPicker visible={picking} onClose={() => setPicking(false)} title={column.name} value={cell?.date ?? today()} onChange={onSave} />
    </>
  );
}

/** A tick as a switch in a box: "Not yet" until it is on. */
function Tick({ column, on, onSave }: { column: ColumnResponse; on: boolean; onSave: (value: CellValue) => void }) {
  return (
    <Framed label={column.name}>
      <Txt variant="headline" weight={600} numberOfLines={1} style={{ flex: 1 }}>
        {on ? words.money.rowCard.ticked : words.money.rowCard.notTicked}
      </Txt>
      <View style={{ transform: [{ scale: 0.86 }], marginRight: -3 }}>
        <Toggle label={column.name} value={on} onChange={onSave} />
      </View>
    </Framed>
  );
}

function Choice({ column, chosen, onSave }: { column: ColumnResponse; chosen: string | null; onSave: (value: CellValue) => void }) {
  const { colors } = useTheme();
  const [picking, setPicking] = useState(false);
  const pick = (value: string | null) => {
    setPicking(false);
    onSave(value);
  };
  return (
    <>
      <FieldButton label={column.name} value={chosen ?? words.money.rowCard.empty} onPress={() => setPicking(true)} />
      <Sheet visible={picking} onClose={() => setPicking(false)} title={words.money.rowCard.choose(column.name)}>
        {column.options.map((option, index) => (
          <SheetRow key={option} first={index === 0} label={option} trailing={option === chosen ? <Check size={20} color={colors.text} /> : undefined} onPress={() => pick(option)} />
        ))}
        {chosen ? <SheetRow label={words.money.rowCard.clear} onPress={() => pick(null)} /> : null}
      </Sheet>
    </>
  );
}

/** Who a cell is about: picked from the people of the circle, any number of them. */
function People({ column, cell, members, onSave }: { column: ColumnResponse; cell: CellResponse | undefined; members: readonly MemberResponse[]; onSave: (value: CellValue) => void }) {
  const { colors } = useTheme();
  const people = peopleOf(cell);
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<readonly string[]>([]);
  const names = people.map((person) => firstName(person.name));
  return (
    <>
      <FieldButton
        label={column.name}
        value={people.length ? words.money.sheet.names(names) : words.money.rowCard.nobody}
        icon={people[0] ? <Avatar uri={people[0].avatarUrl} name={people[0].name ?? ''} size={24} /> : undefined}
        onPress={() => {
          setPicked(people.flatMap((person) => (person.memberId ? [person.memberId] : [])));
          setPicking(true);
        }}
      />
      <Sheet visible={picking} onClose={() => setPicking(false)} title={words.money.rowCard.people(column.name)}>
        {members.map((member) => {
          const on = picked.includes(member.id);
          return (
            <Tap
              key={member.id}
              accessibilityRole="checkbox"
              accessibilityLabel={firstName(member.name)}
              accessibilityState={{ checked: on }}
              // Said this way, a browser hears whether it is ticked as well: the web takes no `accessibilityState`.
              aria-checked={on}
              onPress={() => setPicked(on ? picked.filter((id) => id !== member.id) : [...picked, member.id])}
              scaleTo={0.99}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingVertical: 8, paddingHorizontal: layout.gutter }}>
              <Avatar uri={member.avatarUrl} name={member.name} size={36} />
              <Txt variant="item" style={{ flex: 1 }}>
                {firstName(member.name)}
              </Txt>
              <View style={{ width: 24, height: 24, borderRadius: radius.chip, alignItems: 'center', justifyContent: 'center', borderWidth: on ? 0 : 2, borderColor: colors.lineStrong, backgroundColor: on ? colors.accent : 'transparent' }}>
                {on ? <Check size={16} color={colors.onAccent} strokeWidth={3} /> : null}
              </View>
            </Tap>
          );
        })}
        <View style={{ paddingTop: 10, paddingHorizontal: layout.rowGutter }}>
          <Button
            label={words.common.done}
            size="lg"
            block
            onPress={() => {
              setPicking(false);
              onSave(picked.length ? [...picked] : null);
            }}
          />
        </View>
      </Sheet>
    </>
  );
}

/** A cell that can't be changed here: a formula's answer (or why there is none), or any cell for someone who may only read. */
function ReadOnly({ column, cell, currency }: { column: ColumnResponse; cell: CellResponse | undefined; currency: string }) {
  const { colors } = useTheme();
  const problem = cell?.kind === 'problem' ? (cell.problem ?? words.money.sheet.cantWorkOut) : column.problem;
  const text = cellText(cell, currency, true);
  return (
    <View style={{ flex: 1, gap: 6 }}>
      <Framed label={column.name} quiet>
        {problem ? <TriangleAlert size={18} color={colors.warn} style={{ marginTop: 2 }} /> : null}
        <Txt variant={problem ? 'callout' : 'headline'} weight={600} style={{ flex: 1, color: problem ? colors.warn : text ? colors.text : colors.muted }}>
          {problem ?? (text || words.money.rowCard.empty)}
        </Txt>
      </Framed>
      {column.kind === 'formula' ? (
        <Txt variant="caption" color="muted" style={{ marginHorizontal: 4 }}>
          {column.says ?? words.money.rowCard.workedOut}
        </Txt>
      ) : null}
    </View>
  );
}

/** The frame of a box that isn't typed in, looking like the ones that are: the small label over what it holds. */
function Framed({ label, quiet, children }: { label: string; quiet?: boolean; children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, borderRadius: radius.field, borderWidth: 1.5, borderColor: colors.lineStrong, backgroundColor: quiet ? colors.fill : colors.bg, paddingHorizontal: 16, paddingTop: 9, paddingBottom: 10 }}>
      <Txt variant="small" color="muted">
        {label}
      </Txt>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, minHeight: 24 }}>{children}</View>
    </View>
  );
}

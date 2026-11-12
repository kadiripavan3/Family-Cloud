import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import type { ChecklistResponse, CircleResponse, ItemChangeRequest, ItemResponse, Repeats } from '@/api/generated/homeport';
import { membersOf } from '@/features/circles/members';
import { firstName } from '@/lib/names';
import { layout } from '@/theme';
import { Button } from '@/ui/Button';
import { Chip } from '@/ui/Chip';
import { Field } from '@/ui/Field';
import { GroupLabel } from '@/ui/Heading';
import { Segmented } from '@/ui/Segmented';
import { Sheet, SheetRow } from '@/ui/Sheet';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

import { centsFrom, typedFrom } from './amounts';

type Props = {
  /** The line whose sheet is open. Null while it is shut. */
  item: ItemResponse | null;
  list: ChecklistResponse;
  /** The circle the list is in: who a line can be given to, and kept from. */
  circle: CircleResponse | undefined;
  onClose: () => void;
  /** What was changed, as the API takes it: only the parts that differ. */
  onChange: (item: ItemResponse, change: ItemChangeRequest) => void;
  onRemove: (item: ItemResponse) => void;
};

/**
 * One line of a list, opened: its words, the small print under them, an amount, the heading it stands
 * under, whether it comes back after it was ticked (milk, every week), whose job it is, who it is kept from,
 * and its place in the list. Saving sends only what changed.
 */
export function LineSheet({ item, ...rest }: Props) {
  return (
    <Sheet visible={!!item} onClose={rest.onClose} title={item?.text}>
      {item ? <Form key={item.id} item={item} {...rest} /> : null}
    </Sheet>
  );
}

type Comes = Repeats | 'never';

function Form({ item, list, circle, onClose, onChange, onRemove }: Omit<Props, 'item'> & { item: ItemResponse }) {
  const people = (circle ? membersOf(circle) : []).filter((member) => member.kind !== 'pet');
  const others = people.filter((member) => member.id !== circle?.myMemberId);
  const [text, setText] = useState(item.text);
  const [note, setNote] = useState(item.note);
  const [amount, setAmount] = useState(typedFrom(item.amountCents));
  const [heading, setHeading] = useState(item.section);
  const [comes, setComes] = useState<Comes>(item.repeats ?? 'never');
  const [whose, setWhose] = useState<string | null>(item.assignedTo?.memberId ?? null);
  // The API names who a line is kept from by their first name; the circle knows which member that is.
  const [keptFrom, setKeptFrom] = useState<string[]>(() => others.filter((member) => item.hiddenFrom.includes(firstName(member.name))).map((member) => member.id));
  const cents = centsFrom(amount);
  // Up and down are among the lines under the same heading: that is the order the person sees.
  const same = list.items.filter((one) => one.section === item.section);
  const at = same.findIndex((one) => one.id === item.id);
  const next = same[at + 2];

  const save = () => {
    const change: ItemChangeRequest = {};
    if (text.trim() && text.trim() !== item.text) change.text = text.trim();
    if (note.trim() !== item.note) change.note = note.trim();
    if (heading.trim() !== item.section) change.section = heading.trim();
    if (cents === null && item.amountCents !== null) change.removeAmount = true;
    else if (typeof cents === 'number' && cents !== item.amountCents) change.amountCents = cents;
    if (comes === 'never' && item.repeats) change.stopRepeating = true;
    else if (comes !== 'never' && comes !== item.repeats) change.repeats = comes;
    if (whose === null && item.assignedTo) change.unassign = true;
    else if (whose && whose !== item.assignedTo?.memberId) change.assignedTo = whose;
    const before = others.filter((member) => item.hiddenFrom.includes(firstName(member.name))).map((member) => member.id);
    if (before.length !== keptFrom.length || before.some((id) => !keptFrom.includes(id))) change.hideFrom = keptFrom;
    if (Object.keys(change).length > 0) onChange(item, change);
    onClose();
  };
  const move = (change: ItemChangeRequest) => {
    onChange(item, change);
    onClose();
  };

  return (
    <View style={{ paddingBottom: 4 }}>
      <View style={{ gap: 10, paddingTop: 6, paddingHorizontal: layout.rowGutter }}>
        <Field label={words.notes.list.line.text} value={text} onChangeText={setText} maxLength={300} />
        <Field label={words.notes.list.line.note} value={note} onChangeText={setNote} maxLength={300} placeholder={words.notes.list.line.notePlaceholder} />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Field label={words.notes.list.line.amount} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder={words.notes.list.line.amountPlaceholder} prefix={list.currency === 'EUR' ? '€' : undefined} error={cents === undefined ? words.notes.list.line.amountWrong : null} />
          </View>
          <View style={{ flex: 1.4 }}>
            <Field label={words.notes.list.line.heading} value={heading} onChangeText={setHeading} maxLength={60} placeholder={words.notes.list.line.headingPlaceholder} />
          </View>
        </View>
      </View>

      <GroupLabel style={{ marginHorizontal: layout.gutter }}>{words.notes.list.line.comesBack}</GroupLabel>
      <Segmented
        label={words.notes.list.line.comesBack}
        value={comes}
        onChange={setComes}
        options={[
          { id: 'never', label: words.notes.list.line.never },
          { id: 'weekly', label: words.notes.list.repeats.weekly },
          { id: 'monthly', label: words.notes.list.repeats.monthly },
        ]}
      />

      {people.length > 1 ? (
        <>
          <GroupLabel style={{ marginHorizontal: layout.gutter }}>{words.notes.list.line.whose}</GroupLabel>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: layout.barGutter }}>
            {people.map((member) => (
              <Chip key={member.id} label={firstName(member.name)} selected={whose === member.id} onPress={() => setWhose(whose === member.id ? null : member.id)} />
            ))}
          </View>
          <GroupLabel style={{ marginHorizontal: layout.gutter }}>{words.notes.list.line.keepFrom}</GroupLabel>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: layout.barGutter }}>
            {others.map((member) => (
              <Chip key={member.id} label={firstName(member.name)} selected={keptFrom.includes(member.id)} onPress={() => setKeptFrom(keptFrom.includes(member.id) ? keptFrom.filter((id) => id !== member.id) : [...keptFrom, member.id])} />
            ))}
          </View>
          <Txt variant="footnote" color="muted" style={{ marginTop: 8, marginHorizontal: layout.gutter }}>
            {words.notes.list.line.keepFromNote}
          </Txt>
        </>
      ) : null}

      <View style={{ paddingTop: 16, paddingHorizontal: layout.rowGutter }}>
        <Button label={words.notes.list.line.save} size="lg" block disabled={cents === undefined || !text.trim()} onPress={save} />
      </View>
      <View style={{ marginTop: 12 }}>
        {at > 0 ? <SheetRow icon={(c) => <ArrowUp size={22} color={c} />} label={words.notes.list.line.up} onPress={() => move({ before: same[at - 1]!.id })} /> : null}
        {at >= 0 && at < same.length - 1 ? <SheetRow icon={(c) => <ArrowDown size={22} color={c} />} label={words.notes.list.line.down} onPress={() => move(next ? { before: next.id } : { toEnd: true })} /> : null}
        <SheetRow
          danger
          icon={(c) => <Trash2 size={22} color={c} />}
          label={words.things.list.remove}
          onPress={() => {
            onRemove(item);
            onClose();
          }}
        />
      </View>
    </View>
  );
}

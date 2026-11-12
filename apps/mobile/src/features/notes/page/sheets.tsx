import { ArrowDown, ArrowUp, FolderOpen, Heading, List, type LucideIcon, MapPin, Pilcrow, TextCursorInput, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import type { BlockResponse, CircleResponse } from '@/api/generated/homeport';
import { membersOf } from '@/features/circles/members';
import { linesOf } from '@/features/things/lines';
import { firstName } from '@/lib/names';
import { layout, useTheme } from '@/theme';
import { Avatar } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { Field } from '@/ui/Field';
import { Tap } from '@/ui/Motion';
import { Sheet, SheetRow } from '@/ui/Sheet';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

import { isText, type TextKind } from './blocks';
import type { Named } from './marks';

/** The people of a circle a text can name: everyone but its pets. */
export function namedIn(circle: CircleResponse | undefined): Named[] {
  return (circle ? membersOf(circle) : []).filter((member) => member.kind !== 'pet').map((member) => ({ memberId: member.id, name: member.name, first: firstName(member.name) }));
}

type ListProps = { visible: boolean; onClose: () => void; pageTitle: string; onAdd: (title: string, items: string[]) => void; onExisting: () => void };

/** A list to draw in the page: a new one with its first lines, or one that exists already. */
export function ListSheet({ visible, ...rest }: ListProps) {
  return (
    <Sheet visible={visible} onClose={rest.onClose} title={words.notes.page.listSheet.title}>
      {visible ? <ListForm {...rest} /> : null}
    </Sheet>
  );
}

function ListForm({ onClose, pageTitle, onAdd, onExisting }: Omit<ListProps, 'visible'>) {
  const [title, setTitle] = useState('');
  const [lines, setLines] = useState('');
  return (
    <View style={{ paddingTop: 6 }}>
      <View style={{ gap: 10, paddingHorizontal: layout.rowGutter }}>
        <Field label={words.notes.page.listSheet.name} value={title} onChangeText={setTitle} maxLength={200} placeholder={pageTitle || words.things.list.titlePlaceholder} />
        <Field label={words.notes.page.listSheet.lines} value={lines} onChangeText={setLines} multiline placeholder={words.things.list.linesPlaceholder} note={words.notes.page.listSheet.linesNote} />
        <Button
          label={words.notes.page.listSheet.add}
          size="lg"
          block
          onPress={() => {
            onAdd(title, linesOf(lines));
            onClose();
          }}
        />
      </View>
      <View style={{ marginTop: 14 }}>
        <SheetRow icon={(c) => <FolderOpen size={22} color={c} />} label={words.notes.page.listSheet.existing} onPress={onExisting} />
      </View>
    </View>
  );
}

type WordsProps = { visible: boolean; onClose: () => void; title: string; label: string; placeholder?: string; value?: string; confirm: string; needed?: boolean; onSave: (text: string) => void };

/** One line of words to type in a sheet: where a place is, the words under a photo. */
export function WordsSheet({ visible, ...rest }: WordsProps) {
  return (
    <Sheet visible={visible} onClose={rest.onClose} title={rest.title}>
      {visible ? <WordsForm {...rest} /> : null}
    </Sheet>
  );
}

function WordsForm({ onClose, label, placeholder, value = '', confirm, needed, onSave }: Omit<WordsProps, 'visible' | 'title'>) {
  const [typed, setTyped] = useState(value);
  const ready = !needed || typed.trim().length > 0;
  const save = () => {
    if (!ready) return;
    onSave(typed);
    onClose();
  };
  return (
    <View style={{ gap: 12, paddingTop: 6, paddingHorizontal: layout.rowGutter }}>
      <Field label={label} value={typed} onChangeText={setTyped} maxLength={300} autoFocus placeholder={placeholder} returnKeyType="done" onSubmitEditing={save} />
      <Button label={confirm} size="lg" block disabled={!ready} onPress={save} />
    </View>
  );
}

/** Chooses someone of the circle to name in the text. */
export function MentionSheet({ visible, onClose, people, onChoose }: { visible: boolean; onClose: () => void; people: readonly (Named & { avatarUrl?: string | null })[]; onChoose: (person: Named) => void }) {
  const { colors } = useTheme();
  return (
    <Sheet visible={visible} onClose={onClose} title={words.notes.page.mention.title} subtitle={words.notes.page.mention.note}>
      {people.map((person, index) => (
        <Tap
          key={person.memberId}
          accessibilityRole="button"
          accessibilityLabel={person.name}
          onPress={() => {
            onChoose(person);
            onClose();
          }}
          scaleTo={0.99}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 54, paddingVertical: 10, paddingHorizontal: layout.gutter, borderTopWidth: index === 0 ? 0 : 1, borderTopColor: colors.line }}>
          <Avatar uri={person.avatarUrl} name={person.name} size={34} />
          <Txt variant="headline" weight={600}>
            {person.name}
          </Txt>
        </Tap>
      ))}
    </Sheet>
  );
}

type MenuProps = {
  /** The block whose menu is open. Null while it is shut. */
  block: BlockResponse | null;
  /** Where it stands among the page's blocks, and how many there are. */
  at: number;
  count: number;
  onClose: () => void;
  onTurn: (kind: TextKind) => void;
  onUp: () => void;
  onDown: () => void;
  onRemove: () => void;
  /** Change the words under a photo or a file, or where a place is. */
  onReword: () => void;
  /** Open the list a list block draws, on its own screen. */
  onOpenList: () => void;
};

/** What can be done with one block of a page (hold it): make text another kind of text, change its words, move it up or down, remove it. */
export function BlockMenu({ block, at, count, onClose, onTurn, onUp, onDown, onRemove, onReword, onOpenList }: MenuProps) {
  const then = (act: () => void) => () => {
    onClose();
    act();
  };
  const kind = block?.kind;
  const title = !block ? undefined : isText(kind) ? words.notes.page.text[kind] : kind === 'photo' ? words.notes.page.photo : kind === 'file' ? words.notes.page.file : kind === 'place' ? words.notes.page.place.label : (block.thing?.title ?? words.things.kind(kind === 'checklist' ? 'checklist' : block.thing?.kind).name);
  const icons = { paragraph: Pilcrow, heading: Heading, bullet: List } as const;
  const rows: { key: string; icon: LucideIcon; label: string; onPress: () => void; danger?: boolean }[] = [];
  if (block) {
    if (isText(kind)) for (const one of ['paragraph', 'heading', 'bullet'] as const) if (one !== kind) rows.push({ key: one, icon: icons[one], label: words.notes.page.becomes[one], onPress: () => onTurn(one) });
    if (kind === 'photo' || kind === 'file') rows.push({ key: 'caption', icon: TextCursorInput, label: words.notes.page.block.caption, onPress: onReword });
    if (kind === 'place') rows.push({ key: 'where', icon: MapPin, label: words.notes.page.block.where, onPress: onReword });
    if (kind === 'checklist' && block.checklist) rows.push({ key: 'list', icon: FolderOpen, label: words.notes.page.block.openList, onPress: onOpenList });
    if (at > 0) rows.push({ key: 'up', icon: ArrowUp, label: words.notes.page.block.up, onPress: onUp });
    if (at >= 0 && at < count - 1) rows.push({ key: 'down', icon: ArrowDown, label: words.notes.page.block.down, onPress: onDown });
    rows.push({ key: 'remove', icon: Trash2, label: words.notes.page.block.remove, onPress: onRemove, danger: true });
  }
  return (
    <Sheet visible={!!block} onClose={onClose} title={title}>
      {rows.map(({ key, icon: Icon, label, onPress, danger }, index) => (
        <SheetRow key={key} first={index === 0} danger={danger} icon={(c) => <Icon size={22} color={c} />} label={label} onPress={then(onPress)} />
      ))}
    </Sheet>
  );
}

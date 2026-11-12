import { Bell, Calendar, ChevronRight, FileText, KeyRound, ListChecks, type LucideIcon, MapPin, Repeat } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import type { CircleResponse, ReadAs, ReadItemResponse } from '@/api/generated/homeport';
import { membersOf } from '@/features/circles/members';
import { layout, radius, useTheme } from '@/theme';
import { Avatar } from '@/ui/Avatar';
import { Card } from '@/ui/Card';
import { Emoji } from '@/ui/Emoji';
import { Tap } from '@/ui/Motion';
import { NoteBox } from '@/ui/NoteBox';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

import { type Piece, type Read, whenLabel, whoLabel } from './reading';

/** The icon of what a line was read as. */
const KIND: Record<ReadAs, LucideIcon> = { event: Calendar, reminder: Bell, list_item: ListChecks, note: FileText, code: KeyRound };

type Props = {
  circle: CircleResponse;
  /** One part of the line, as the API read it. */
  item: ReadItemResponse;
  /** The same with the person's corrections on top. */
  read: Read;
  /** Opens the correction of one piece. */
  onFix: (piece: Piece) => void;
};

/**
 * How one part of a typed line was read, piece by piece: "Read as an event in The Linds", and under it a
 * row for the day and time, for who it is for, for the reminder, for how often it comes round and for the
 * place the last one like it was at. Pressing a row corrects that piece.
 */
export function ReadingCard({ circle, item, read, onFix }: Props) {
  const { colors } = useTheme();
  const says = words.plan.quick;
  const Kind = KIND[read.as];
  const kind = words.kinds[circle.kind];
  const dated = read.as === 'event' || read.as === 'reminder';
  const touched = (piece: Piece) => read.fixed.includes(piece);
  const person = membersOf(circle).find((one) => one.id === read.personId);

  const rows: ReactNode[] = [];
  if (dated) {
    const when = touched('when') ? whenLabel(read.when) : item.whenLabel;
    rows.push(<PieceRow key="when" icon={<Calendar size={22} color={colors.text} />} label={when ?? says.noDay} onPress={() => onFix('when')} />);
    if (read.personId || touched('person')) {
      rows.push(
        <PieceRow
          key="person"
          icon={person ? <Avatar uri={person.avatarUrl} name={person.name} size={24} /> : <View style={{ width: 24 }} />}
          label={touched('person') || !item.personLabel ? whoLabel(read, membersOf(circle)) : item.personLabel}
          onPress={() => onFix('person')}
        />,
      );
    }
    if (read.remindMinutes !== null || touched('remind')) {
      const label = read.remindMinutes === null ? says.noRemind : says.remind(touched('remind') || !item.remindLabel ? words.plan.remind.before(read.remindMinutes).toLowerCase() : item.remindLabel);
      rows.push(<PieceRow key="remind" icon={<Bell size={22} color={colors.text} />} label={label} onPress={() => onFix('remind')} />);
    }
    if (read.repeat || touched('repeat')) {
      rows.push(<PieceRow key="repeat" icon={<Repeat size={22} color={colors.text} />} label={read.repeat ? words.plan.repeat.label(read.repeat) : says.noRepeat} onPress={() => onFix('repeat')} />);
    }
    if (read.as === 'event' && (read.place || touched('place'))) {
      rows.push(<PieceRow key="place" icon={<MapPin size={22} color={colors.accentText} />} label={touched('place') || !item.place ? (read.place ?? says.noPlace) : item.place.label} onPress={() => onFix('place')} />);
    }
  } else if (read.as === 'list_item') {
    rows.push(<PieceRow key="list" icon={<ListChecks size={22} color={colors.text} />} label={item.list?.title ? says.list(item.list.title, item.quantity) : says.listUnnamed} />);
  } else if (read.as === 'note') {
    rows.push(<PieceRow key="note" icon={<FileText size={22} color={colors.text} />} label={says.note} />);
  }

  return (
    <View style={{ gap: 16 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: -4, marginHorizontal: layout.barGutter }}>
        <Txt variant="footnote" weight={600} color="muted">
          {says.readAs}
        </Txt>
        <Tap
          accessibilityRole="button"
          accessibilityLabel={dated ? says.asSpoken(says.as[read.as]) : says.as[read.as]}
          disabled={!dated}
          hitSlop={6}
          onPress={() => onFix('as')}
          scaleTo={0.94}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 12, borderRadius: radius.photo, backgroundColor: colors.accentSoft }}>
          <Kind size={14} color={colors.accentText} />
          <Txt variant="caption" weight={700} color="accentText">
            {says.as[read.as]}
          </Txt>
        </Tap>
        <Txt variant="footnote" weight={600} color="muted">
          {says.in}
        </Txt>
        <View accessible accessibilityLabel={circle.name} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 26, paddingLeft: 7, paddingRight: 9, borderRadius: radius.pill, backgroundColor: colors.fill }}>
          <Emoji char={kind.emoji} size={16} />
          <Txt variant="small" weight={700} color="muted" numberOfLines={1}>
            {circle.name}
          </Txt>
        </View>
      </View>
      {read.as === 'code' ? (
        <NoteBox icon={(c) => <KeyRound size={20} color={c} />} title={says.code.title} style={{ marginHorizontal: layout.barGutter }}>
          {says.code.body}
        </NoteBox>
      ) : (
        <Card style={{ marginHorizontal: layout.barGutter, borderRadius: radius.card, overflow: 'hidden' }}>{rows}</Card>
      )}
    </View>
  );
}

/** One piece of the reading: an icon or a face, what it was read as, and an arrow when it can be corrected. */
function PieceRow({ icon, label, onPress }: { icon: ReactNode; label: string; onPress?: () => void }) {
  const { colors } = useTheme();
  const frame = { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingVertical: 14, paddingHorizontal: 16 } as const;
  const content = (
    <>
      {icon}
      <Txt variant="item" weight={600} style={{ flex: 1 }}>
        {label}
      </Txt>
      {onPress ? <ChevronRight size={18} color={colors.muted} /> : null}
    </>
  );
  // The rows of one card are drawn one under another with a line between them; the first has none above it.
  if (!onPress) return <View style={[frame, { borderTopWidth: 1, borderTopColor: colors.line, marginTop: -1 }]}>{content}</View>;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={words.plan.quick.piece(label)} onPress={onPress} style={({ pressed }) => [frame, { borderTopWidth: 1, borderTopColor: colors.line, marginTop: -1, backgroundColor: pressed ? colors.fill : 'transparent' }]}>
      {content}
    </Pressable>
  );
}

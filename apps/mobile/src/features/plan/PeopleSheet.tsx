import { useState } from 'react';
import { View } from 'react-native';

import type { MemberResponse } from '@/api/generated/homeport';
import { firstName } from '@/lib/names';
import { layout } from '@/theme';
import { Avatar } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { Sheet } from '@/ui/Sheet';
import { words } from '@/words';

import { PickRow } from './PickRow';

type Props = {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  /** Who can be picked: the people of the circle, or some of them. */
  members: readonly MemberResponse[];
  /** The ids that are picked, in the order they were picked (the order people take turns in). */
  value: readonly string[];
  onChange: (next: string[]) => void;
  /** One person or nobody, instead of any number: picking closes the sheet. */
  single?: boolean;
  /** What picking nobody is called, for `single`. */
  nobody?: string;
};

/** Picks people of the circle: one (or nobody), or any number of them in the order they are picked. */
export function PeopleSheet({ visible, onClose, title, subtitle, members, value, onChange, single, nobody = words.plan.people.nobody }: Props) {
  return (
    <Sheet visible={visible} onClose={onClose} title={title} subtitle={subtitle}>
      <Picking members={members} value={value} onChange={onChange} onClose={onClose} single={single} nobody={nobody} />
    </Sheet>
  );
}

function Picking({ members, value, onChange, onClose, single, nobody }: Pick<Props, 'members' | 'value' | 'onChange' | 'onClose' | 'single' | 'nobody'>) {
  const [picked, setPicked] = useState<string[]>([...value]);
  const nameOf = (member: MemberResponse) => (member.you ? words.plan.people.you : firstName(member.name));
  const face = (member: MemberResponse) => <Avatar uri={member.avatarUrl} name={member.name} size={32} />;

  if (single) {
    const pick = (next: string[]) => {
      onChange(next);
      onClose();
    };
    return (
      <View accessibilityRole="radiogroup">
        <PickRow first label={nobody ?? words.plan.people.nobody} chosen={picked.length === 0} onPress={() => pick([])} />
        {members.map((member) => (
          <PickRow key={member.id} label={nameOf(member)} leading={face(member)} chosen={picked[0] === member.id} onPress={() => pick([member.id])} />
        ))}
      </View>
    );
  }
  return (
    <View>
      {members.map((member, index) => (
        <PickRow
          key={member.id}
          first={index === 0}
          role="checkbox"
          label={nameOf(member)}
          leading={face(member)}
          chosen={picked.includes(member.id)}
          onPress={() => setPicked((old) => (old.includes(member.id) ? old.filter((id) => id !== member.id) : [...old, member.id]))}
        />
      ))}
      <View style={{ paddingTop: 12, paddingHorizontal: layout.barGutter }}>
        <Button
          label={words.common.done}
          size="lg"
          block
          onPress={() => {
            onChange(picked);
            onClose();
          }}
        />
      </View>
    </View>
  );
}

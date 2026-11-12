import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { membersOf } from '@/features/circles/members';
import { addDays, formatDayFull, today } from '@/lib/dates';
import { firstName } from '@/lib/names';
import { layout } from '@/theme';
import { CheckRow } from '@/ui/CheckRow';
import { DayPicker } from '@/ui/DayPicker';
import { Field, FieldButton } from '@/ui/Field';
import { GroupLabel } from '@/ui/Heading';
import { words } from '@/words';

import { PersonChips } from '../parts/People';
import type { SetupProps } from '../types';

const say = words.templates.timeCapsule.setup;

/**
 * What a time capsule needs before it starts: the day it opens (it has to be after today), and, if it is
 * for someone, who. Made for someone, it can be kept from them until it opens.
 */
export function TimeCapsuleSetup({ circle, onChange }: SetupProps) {
  const people = membersOf(circle).filter((member) => member.kind !== 'pet' && member.id !== circle.myMemberId);
  const [name, setName] = useState('');
  const [opensOn, setOpensOn] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [forId, setForId] = useState<string | null>(null);
  const [surprise, setSurprise] = useState(true);
  const tomorrow = addDays(today(), 1);
  const forWhom = people.find((member) => member.id === forId);

  useEffect(() => {
    onChange(opensOn ? { title: name.trim() || undefined, settings: { opensOn, forMemberIds: forId ? [forId] : [], hideFromThem: forId ? surprise : false } } : null);
  }, [name, opensOn, forId, surprise, onChange]);

  return (
    <View style={{ gap: 12 }}>
      <View style={{ gap: 12, paddingHorizontal: layout.rowGutter }}>
        <Field label={say.name} value={name} onChangeText={setName} maxLength={200} placeholder={say.namePlaceholder} />
        <View style={{ flexDirection: 'row' }}>
          <FieldButton label={say.opensOn} value={opensOn ? formatDayFull(opensOn) : say.choose} onPress={() => setPicking(true)} />
        </View>
      </View>
      {people.length ? (
        <View>
          <GroupLabel style={{ marginTop: 4, marginHorizontal: layout.gutter }}>{say.forWhom}</GroupLabel>
          <PersonChips inset people={people} value={forId} onChange={(id) => setForId(id === forId ? null : id)} />
        </View>
      ) : null}
      {forWhom ? <CheckRow label={say.surprise(firstName(forWhom.name))} checked={surprise} onChange={setSurprise} style={{ paddingHorizontal: layout.gutter }} /> : null}
      <DayPicker visible={picking} onClose={() => setPicking(false)} title={say.opensOn} value={opensOn ?? addDays(today(), 365)} min={tomorrow} byYear onChange={setOpensOn} />
    </View>
  );
}

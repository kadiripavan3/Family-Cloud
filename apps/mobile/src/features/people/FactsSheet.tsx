import { useMutation } from '@tanstack/react-query';
import { X } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { useCache } from '@/api/cache';
import { messageFor } from '@/api/fetcher';
import { changeMember, type MemberResponse } from '@/api/generated/homeport';
import { firstName } from '@/lib/names';
import { layout, radius, useTheme } from '@/theme';
import { Button } from '@/ui/Button';
import { Field } from '@/ui/Field';
import { Tap } from '@/ui/Motion';
import { Sheet } from '@/ui/Sheet';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

/** How many facts a circle keeps about one person, at most. */
const MOST = 12;

/** Changes the short facts a circle keeps about one of its people: "Shoes 33", "Class 4B". Take one away, add one, save. */
export function FactsSheet({ member, visible, onClose }: { member: MemberResponse; visible: boolean; onClose: () => void }) {
  return (
    <Sheet visible={visible} onClose={onClose} title={words.people.person.facts.title(firstName(member.name))} subtitle={words.people.person.facts.hint}>
      <Form member={member} onClose={onClose} />
    </Sheet>
  );
}

function Form({ member, onClose }: { member: MemberResponse; onClose: () => void }) {
  const { colors } = useTheme();
  const cache = useCache();
  const says = words.people.person.facts;
  const [facts, setFacts] = useState<string[]>(member.facts);
  const [typed, setTyped] = useState('');
  const next = typed.trim();
  const add = () => {
    if (!next || facts.includes(next) || facts.length >= MOST) return;
    setFacts([...facts, next]);
    setTyped('');
  };
  // Whatever is still in the box when Save is pressed counts too.
  const all = next && !facts.includes(next) && facts.length < MOST ? [...facts, next] : facts;
  const save = useMutation({
    mutationFn: () => changeMember(member.id, { facts: all }),
    onSuccess: async (saved) => {
      await cache.memberSaved(saved);
      onClose();
    },
  });

  return (
    <View style={{ gap: 12, paddingHorizontal: layout.rowGutter }}>
      {facts.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {facts.map((fact) => (
            <Tap
              key={fact}
              accessibilityRole="button"
              accessibilityLabel={says.remove(fact)}
              hitSlop={5}
              onPress={() => setFacts(facts.filter((one) => one !== fact))}
              scaleTo={0.94}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 7, paddingLeft: 12, paddingRight: 9, borderRadius: radius.pill, backgroundColor: colors.fill }}>
              <Txt variant="caption" weight={700}>
                {fact}
              </Txt>
              <X size={13} color={colors.muted} strokeWidth={2.6} />
            </Tap>
          ))}
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Field label={says.field} value={typed} onChangeText={setTyped} maxLength={40} placeholder={says.placeholder} returnKeyType="done" onSubmitEditing={add} />
        </View>
        <Button label={says.addButton} variant="soft" inline disabled={!next || facts.length >= MOST} onPress={add} />
      </View>
      {save.isError ? (
        <Txt variant="caption" color="danger" accessibilityLiveRegion="polite">
          {messageFor(save.error)}
        </Txt>
      ) : null}
      <Button label={says.save} size="lg" block loading={save.isPending} onPress={() => save.mutate()} />
    </View>
  );
}

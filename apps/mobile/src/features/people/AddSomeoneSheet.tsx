import { useMutation } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { View } from 'react-native';

import { useCache } from '@/api/cache';
import { ApiError, messageFor } from '@/api/fetcher';
import { addMember, type CircleResponse, type MemberKind } from '@/api/generated/homeport';
import { formatDayLong, today } from '@/lib/dates';
import { newClientId } from '@/lib/ids';
import { layout } from '@/theme';
import { Button } from '@/ui/Button';
import { DayPicker } from '@/ui/DayPicker';
import { Field, FieldButton } from '@/ui/Field';
import { Segmented } from '@/ui/Segmented';
import { Sheet } from '@/ui/Sheet';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

const KINDS: readonly MemberKind[] = ['person', 'child', 'pet'];

type Props = { circle: CircleResponse; visible: boolean; onClose: () => void };

/**
 * Adds someone to a circle: a person by their email (they get an invitation), or a child or a pet, who need
 * no phone. Used while setting a circle up and from People.
 */
export function AddSomeoneSheet({ circle, visible, onClose }: Props) {
  return (
    <Sheet visible={visible} onClose={onClose} title={words.setup.add.title}>
      <Form circle={circle} onClose={onClose} />
    </Sheet>
  );
}

function Form({ circle, onClose }: { circle: CircleResponse; onClose: () => void }) {
  const cache = useCache();
  const [kind, setKind] = useState<MemberKind>('person');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [about, setAbout] = useState('');
  const [birthday, setBirthday] = useState<string | null>(null);
  const [pickingDay, setPickingDay] = useState(false);
  const clientId = useRef(newClientId());

  const add = useMutation({
    mutationFn: () =>
      addMember(circle.id, {
        clientId: clientId.current,
        name: name.trim(),
        kind,
        email: kind === 'person' ? email.trim() : undefined,
        birthday: kind === 'child' && birthday ? birthday : undefined,
        about: kind === 'pet' && about.trim() ? about.trim() : undefined,
      }),
    onSuccess: async (member) => {
      await cache.memberAdded(member);
      onClose();
    },
  });
  const failed = add.error instanceof ApiError ? add.error : null;
  const ready = name.trim().length > 0 && (kind !== 'person' || email.trim().length > 0);

  return (
    <View style={{ gap: 12, paddingTop: 6 }}>
      <Segmented label={words.setup.add.kind} options={KINDS.map((id) => ({ id, label: words.setup.add.kinds[id] }))} value={kind} onChange={setKind} />
      <View style={{ gap: 12, paddingHorizontal: layout.rowGutter }}>
        <Field label={words.setup.add.name} value={name} onChangeText={setName} maxLength={50} autoCapitalize="words" error={failed?.fields.name} />
        {kind === 'person' ? (
          <Field
            label={words.setup.add.email}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={200}
            error={failed?.fields.email}
            note={words.setup.add.emailNote}
          />
        ) : null}
        {kind === 'child' ? (
          <>
            <View style={{ flexDirection: 'row' }}>
              <FieldButton label={words.setup.add.birthday} value={birthday ? formatDayLong(birthday) : words.setup.add.noBirthday} onPress={() => setPickingDay(true)} />
            </View>
            <Txt variant="caption" color="muted" style={{ marginHorizontal: 4 }}>
              {words.setup.add.childNote}
            </Txt>
          </>
        ) : null}
        {kind === 'pet' ? <Field label={words.setup.add.about} value={about} onChangeText={setAbout} maxLength={60} placeholder={words.setup.add.aboutPlaceholder} /> : null}
        {add.isError && !(failed?.fields.name || failed?.fields.email) ? (
          <Txt variant="caption" color="danger" accessibilityLiveRegion="polite">
            {messageFor(add.error)}
          </Txt>
        ) : null}
        <Button label={kind === 'person' ? words.setup.add.invite : words.setup.add.confirm} size="lg" block disabled={!ready} loading={add.isPending} onPress={() => add.mutate()} />
      </View>
      <DayPicker visible={pickingDay} onClose={() => setPickingDay(false)} title={words.setup.add.birthdayTitle} value={birthday ?? today()} max={today()} onChange={setBirthday} />
    </View>
  );
}

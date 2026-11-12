import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { View } from 'react-native';

import { useCache } from '@/api/cache';
import { ApiError, messageFor } from '@/api/fetcher';
import { createChecklist } from '@/api/generated/homeport';
import { useCircle } from '@/features/circles/current';
import { useUnsaved } from '@/features/navigation/useUnsaved';
import { StartsAsPill } from '@/features/sharing/StartsAsPill';
import { useStartsAs } from '@/features/sharing/useStartsAs';
import { linesOf } from '@/features/things/lines';
import { thingHref } from '@/features/things/open';
import { newClientId } from '@/lib/ids';
import { AppBar, BarLink } from '@/ui/AppBar';
import { ConfirmSheet } from '@/ui/ConfirmSheet';
import { Field } from '@/ui/Field';
import { Screen } from '@/ui/Screen';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

/**
 * /new/checklist, one of the ten things the + sheet opens: a list with a name and, if wanted, its first
 * lines, made in the current circle. Saving opens the list itself, where lines are ticked and added.
 */
export default function NewChecklist() {
  const router = useRouter();
  const cache = useCache();
  const circle = useCircle();
  const [audience, setAudience] = useStartsAs(circle);
  const [title, setTitle] = useState('');
  const [lines, setLines] = useState('');
  const clientId = useRef(newClientId());
  const typed = title.trim().length > 0 || lines.trim().length > 0;
  const unsaved = useUnsaved(typed);

  const save = useMutation({
    mutationFn: () => createChecklist({ clientId: clientId.current, circleId: circle.id, title: title.trim(), items: linesOf(lines), audience }),
    onSuccess: (list) => {
      void cache.thingMade(circle.id);
      unsaved.release();
      router.replace(thingHref({ kind: 'checklist', id: list.id }));
    },
  });
  const failed = save.error instanceof ApiError ? save.error : null;

  return (
    <Screen header={<AppBar leading="close" title={words.things.list.new} trailing={<BarLink label={words.things.list.create} disabled={title.trim().length === 0 || save.isPending} onPress={() => save.mutate()} />} />}>
      <View style={{ gap: 12, paddingTop: 8 }}>
        <Field label={words.things.list.title} value={title} onChangeText={setTitle} maxLength={200} autoFocus placeholder={words.things.list.titlePlaceholder} error={failed?.fields.title} />
        <Field label={words.things.list.lines} value={lines} onChangeText={setLines} multiline placeholder={words.things.list.linesPlaceholder} note={words.things.list.linesNote} error={failed?.fields.items} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 4 }}>
          <Txt variant="caption" color="muted">
            {words.things.seenBy}
          </Txt>
          <StartsAsPill circle={circle} value={audience} onChange={setAudience} />
        </View>
        {save.isError && !(failed?.fields.title || failed?.fields.items) ? (
          <Txt variant="caption" color="danger" accessibilityLiveRegion="polite" style={{ marginHorizontal: 4 }}>
            {messageFor(save.error)}
          </Txt>
        ) : null}
      </View>
      <ConfirmSheet visible={unsaved.asking} onClose={unsaved.stay} title={words.things.discard.title} body={words.things.discard.body} confirm={words.things.discard.confirm} cancel={words.things.discard.cancel} onConfirm={unsaved.leave} />
    </Screen>
  );
}

import { useMutation } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { View } from 'react-native';

import { useCache } from '@/api/cache';
import { ApiError, messageFor } from '@/api/fetcher';
import { createPage, useGetFolder } from '@/api/generated/homeport';
import { useCircle } from '@/features/circles/current';
import { useUnsaved } from '@/features/navigation/useUnsaved';
import { GoesInto } from '@/features/notes/GoesInto';
import { StartsAsPill } from '@/features/sharing/StartsAsPill';
import { useStartsAs } from '@/features/sharing/useStartsAs';
import { thingHref } from '@/features/things/open';
import { newClientId } from '@/lib/ids';
import { AppBar, BarLink } from '@/ui/AppBar';
import { ConfirmSheet } from '@/ui/ConfirmSheet';
import { Field } from '@/ui/Field';
import { Screen } from '@/ui/Screen';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

/**
 * /new/note, one of the ten things the + sheet opens, and "New in Home" in a space (`?folder=<id>`): a page
 * with a title and its first words, made in the current circle and filed in that folder when one is named.
 * It starts as seen by whoever the + sheet said, or else by what the circle's kind says, and that can be
 * changed here before it is saved. Saving opens the page itself, where it is built further from blocks.
 */
export default function NewNote() {
  const router = useRouter();
  const cache = useCache();
  const circle = useCircle();
  const { folder: folderId } = useLocalSearchParams<{ folder?: string }>();
  const folder = useGetFolder(folderId ?? '', { query: { enabled: !!folderId } }).data;
  const [audience, setAudience] = useStartsAs(circle);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const clientId = useRef(newClientId());
  const typed = title.trim().length > 0 || body.trim().length > 0;
  const unsaved = useUnsaved(typed);

  const save = useMutation({
    mutationFn: () => createPage({ clientId: clientId.current, circleId: circle.id, title: title.trim(), body, audience, ...(folderId ? { folderId } : null) }),
    onSuccess: (page) => {
      void cache.noteMade(circle.id);
      unsaved.release();
      router.replace(thingHref({ kind: 'page', id: page.id }));
    },
  });
  const failed = save.error instanceof ApiError ? save.error : null;

  return (
    <Screen header={<AppBar leading="close" title={words.things.page.new} trailing={<BarLink label={words.things.page.create} disabled={!typed || save.isPending} onPress={() => save.mutate()} />} />}>
      <View style={{ gap: 12, paddingTop: 8 }}>
        <Field label={words.things.page.title} value={title} onChangeText={setTitle} maxLength={200} autoFocus error={failed?.fields.title} />
        <Field label={words.things.page.body} value={body} onChangeText={setBody} maxLength={100000} multiline placeholder={words.things.page.bodyPlaceholder} error={failed?.fields.body} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 4 }}>
          <Txt variant="caption" color="muted">
            {words.things.seenBy}
          </Txt>
          <StartsAsPill circle={circle} value={audience} onChange={setAudience} />
        </View>
        {folder ? <GoesInto folder={folder} /> : null}
        {save.isError && !(failed?.fields.title || failed?.fields.body) ? (
          <Txt variant="caption" color="danger" accessibilityLiveRegion="polite" style={{ marginHorizontal: 4 }}>
            {messageFor(save.error)}
          </Txt>
        ) : null}
      </View>
      <ConfirmSheet visible={unsaved.asking} onClose={unsaved.stay} title={words.things.discard.title} body={words.things.discard.body} confirm={words.things.discard.confirm} cancel={words.things.discard.cancel} onConfirm={unsaved.leave} />
    </Screen>
  );
}

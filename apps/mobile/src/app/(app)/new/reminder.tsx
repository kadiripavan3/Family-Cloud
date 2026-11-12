import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useCache } from '@/api/cache';
import { ApiError, messageFor } from '@/api/fetcher';
import { createReminder } from '@/api/generated/homeport';
import { useCircle } from '@/features/circles/current';
import { useLeave } from '@/features/navigation/useLeave';
import { useUnsaved } from '@/features/navigation/useUnsaved';
import { newReminderDraft, newReminderRequest, type ReminderDraft } from '@/features/plan/reminderDraft';
import { ReminderFields } from '@/features/plan/ReminderFields';
import { TypeItLine } from '@/features/plan/TypeItLine';
import { StartsAsPill } from '@/features/sharing/StartsAsPill';
import { useStartsAs } from '@/features/sharing/useStartsAs';
import { newClientId } from '@/lib/ids';
import { layout, useTheme } from '@/theme';
import { AppBar, BarLink } from '@/ui/AppBar';
import { AvoidKeyboard } from '@/ui/AvoidKeyboard';
import { ConfirmSheet } from '@/ui/ConfirmSheet';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

/**
 * /new/reminder, one of the ten things the + sheet opens, and what the + on Reminders opens: a job with a
 * tick. It has a day and maybe a time, or waits for a place, or neither; it can repeat, be given to someone
 * else, and be taken in turns. It goes into the current circle. Saving goes back to where the person was.
 * The line on top leads to "Type it", for writing it as a sentence instead.
 */
export default function NewReminder() {
  const { colors } = useTheme();
  const router = useRouter();
  const leave = useLeave();
  const cache = useCache();
  const circle = useCircle();
  const says = words.plan.reminderForm;
  const [audience, setAudience] = useStartsAs(circle);
  const [start] = useState(newReminderDraft);
  const [draft, setDraft] = useState<ReminderDraft>(start);
  const [nameless, setNameless] = useState(false);
  const clientId = useRef(newClientId());
  const unsaved = useUnsaved(JSON.stringify(draft) !== JSON.stringify(start));

  const save = useMutation({
    mutationFn: () => createReminder(newReminderRequest(draft, { clientId: clientId.current, circleId: circle.id, audience })),
    onSuccess: (reminder) => {
      void cache.reminderMade(reminder);
      unsaved.release();
      leave();
    },
  });
  const failed = save.error instanceof ApiError ? save.error : null;
  const add = () => {
    if (draft.title.trim().length === 0) return setNameless(true);
    setNameless(false);
    save.mutate();
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <AvoidKeyboard style={{ flex: 1 }}>
        <AppBar leading="close" title={says.newTitle} trailing={<BarLink label={says.add} disabled={save.isPending} onPress={add} />} />
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingTop: 4, paddingBottom: 32 }}>
          <TypeItLine label={says.typeIt} onPress={() => router.replace(audience === circle.startsAs ? '/plan/quick-add' : { pathname: '/plan/quick-add', params: { audience } })} />
          <ReminderFields circle={circle} draft={draft} onChange={setDraft} autoFocus problems={{ ...failed?.fields, ...(nameless ? { title: says.needsTitle } : null) }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: layout.gutter }}>
            <Txt variant="caption" color="muted">
              {words.things.seenBy}
            </Txt>
            <StartsAsPill circle={circle} value={audience} onChange={setAudience} />
          </View>
          {save.isError && Object.keys(failed?.fields ?? {}).length === 0 ? (
            <Txt variant="caption" color="danger" accessibilityLiveRegion="polite" style={{ marginHorizontal: layout.gutter }}>
              {messageFor(save.error)}
            </Txt>
          ) : null}
        </ScrollView>
      </AvoidKeyboard>
      <ConfirmSheet visible={unsaved.asking} onClose={unsaved.stay} title={words.things.discard.title} body={words.things.discard.body} confirm={words.things.discard.confirm} cancel={words.things.discard.cancel} onConfirm={unsaved.leave} />
    </SafeAreaView>
  );
}

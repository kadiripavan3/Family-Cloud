import { useMutation } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useCache } from '@/api/cache';
import { ApiError, messageFor } from '@/api/fetcher';
import { createEvent } from '@/api/generated/homeport';
import { useCircle } from '@/features/circles/current';
import { useUnsaved } from '@/features/navigation/useUnsaved';
import { type EventDraft, newEventDraft, newEventRequest } from '@/features/plan/eventDraft';
import { EventFields } from '@/features/plan/EventFields';
import { TypeItLine } from '@/features/plan/TypeItLine';
import { StartsAsPill } from '@/features/sharing/StartsAsPill';
import { useStartsAs } from '@/features/sharing/useStartsAs';
import { thingHref } from '@/features/things/open';
import { today } from '@/lib/dates';
import { newClientId } from '@/lib/ids';
import { layout, useTheme } from '@/theme';
import { AppBar, BarLink } from '@/ui/AppBar';
import { AvoidKeyboard } from '@/ui/AvoidKeyboard';
import { ConfirmSheet } from '@/ui/ConfirmSheet';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

/** True for a day as the address carries it: "2026-11-14". */
const isDay = (value: string | undefined): value is string => !!value && /^\d{4}-\d{2}-\d{2}$/.test(value);

/**
 * /new/event, one of the ten things the + sheet opens, and what the + on the month opens for the chosen day
 * (`?day=2026-11-14`): an event with a name, a day and maybe a time, a place, who is coming, a reminder
 * ahead of it and how often it comes round. It goes into the current circle. Saving opens the event itself.
 * The line on top leads to "Type it", for writing it as a sentence instead.
 */
export default function NewEvent() {
  const { colors } = useTheme();
  const router = useRouter();
  const cache = useCache();
  const circle = useCircle();
  const says = words.plan.eventForm;
  const { day } = useLocalSearchParams<{ day?: string }>();
  const [audience, setAudience] = useStartsAs(circle);
  const [start] = useState(() => newEventDraft(isDay(day) ? day : today()));
  const [draft, setDraft] = useState<EventDraft>(start);
  const [nameless, setNameless] = useState(false);
  const clientId = useRef(newClientId());
  const unsaved = useUnsaved(JSON.stringify(draft) !== JSON.stringify(start));

  const save = useMutation({
    mutationFn: () => createEvent(newEventRequest(draft, { clientId: clientId.current, circleId: circle.id, audience })),
    onSuccess: (event) => {
      void cache.eventMade(event);
      unsaved.release();
      router.replace(thingHref({ kind: 'event', id: event.id }));
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
          <EventFields circle={circle} draft={draft} onChange={setDraft} withGuests autoFocus problems={{ ...failed?.fields, ...(nameless ? { title: says.needsTitle } : null) }} />
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

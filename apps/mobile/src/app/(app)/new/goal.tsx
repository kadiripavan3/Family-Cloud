import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useCache } from '@/api/cache';
import { ApiError, messageFor } from '@/api/fetcher';
import { createGoal } from '@/api/generated/homeport';
import { useCircle } from '@/features/circles/current';
import { useUnsaved } from '@/features/navigation/useUnsaved';
import { type GoalDraft, goalProblems, newGoalDraft, newGoalRequest } from '@/features/plan/goalDraft';
import { GoalFields } from '@/features/plan/GoalFields';
import { StartsAsPill } from '@/features/sharing/StartsAsPill';
import { useStartsAs } from '@/features/sharing/useStartsAs';
import { thingHref } from '@/features/things/open';
import { newClientId } from '@/lib/ids';
import { layout, useTheme } from '@/theme';
import { AppBar, BarLink } from '@/ui/AppBar';
import { AvoidKeyboard } from '@/ui/AvoidKeyboard';
import { ConfirmSheet } from '@/ui/ConfirmSheet';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

/**
 * /new/goal, one of the ten things the + sheet opens, and what the + on Goals opens: something to work
 * towards, with a ring that fills. It counts money, a number of something, or the ticked steps of a list
 * (the steps become a checklist linked to the goal). It goes into the current circle. Saving opens the goal.
 */
export default function NewGoal() {
  const { colors } = useTheme();
  const router = useRouter();
  const cache = useCache();
  const circle = useCircle();
  const says = words.plan.goalForm;
  const [audience, setAudience] = useStartsAs(circle);
  const [start] = useState(newGoalDraft);
  const [draft, setDraft] = useState<GoalDraft>(start);
  const [tried, setTried] = useState(false);
  const clientId = useRef(newClientId());
  const unsaved = useUnsaved(JSON.stringify(draft) !== JSON.stringify(start));
  const missing = goalProblems(draft, says);

  const save = useMutation({
    mutationFn: () => createGoal(newGoalRequest(draft, { clientId: clientId.current, circleId: circle.id, audience })),
    onSuccess: (goal) => {
      void cache.goalMade(goal);
      unsaved.release();
      router.replace(thingHref({ kind: 'goal', id: goal.id }));
    },
  });
  const failed = save.error instanceof ApiError ? save.error : null;
  const add = () => {
    setTried(true);
    if (Object.keys(missing).length === 0) save.mutate();
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <AvoidKeyboard style={{ flex: 1 }}>
        <AppBar leading="close" title={says.newTitle} trailing={<BarLink label={says.add} disabled={save.isPending} onPress={add} />} />
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingTop: 4, paddingBottom: 32 }}>
          <GoalFields draft={draft} onChange={setDraft} autoFocus problems={{ ...failed?.fields, ...(tried ? missing : null) }} />
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

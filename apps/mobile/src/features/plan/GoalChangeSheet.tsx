import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';

import { useCache } from '@/api/cache';
import { ApiError, messageFor } from '@/api/fetcher';
import { changeGoal, type GoalResponse } from '@/api/generated/homeport';
import { layout } from '@/theme';
import { Button } from '@/ui/Button';
import { Sheet } from '@/ui/Sheet';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

import { goalChangeRequest, goalDraftOf, goalProblems } from './goalDraft';
import { GoalFields } from './GoalFields';

type Props = { goal: GoalResponse; visible: boolean; onClose: () => void };

/** Changes a goal: its name, its words, its picture, how much or how many, and the day to be done by. What it counts stays as it began. */
export function GoalChangeSheet({ goal, visible, onClose }: Props) {
  return (
    <Sheet visible={visible} onClose={onClose} title={words.plan.goalForm.changeTitle} tall>
      <Changing goal={goal} onClose={onClose} />
    </Sheet>
  );
}

function Changing({ goal, onClose }: Omit<Props, 'visible'>) {
  const cache = useCache();
  const says = words.plan.goalForm;
  const [draft, setDraft] = useState(() => goalDraftOf(goal));
  const [tried, setTried] = useState(false);
  // The steps of a goal that counts ticks are its list's own lines: nothing to check about them here.
  const { steps: _steps, ...missing } = goalProblems(draft, says);
  const save = useMutation({
    mutationFn: () => changeGoal(goal.id, goalChangeRequest(draft, goal)),
    onSuccess: (saved) => {
      void cache.goalSaved(saved);
      onClose();
    },
  });
  const failed = save.error instanceof ApiError ? save.error : null;
  return (
    <View style={{ paddingTop: 6 }}>
      <GoalFields draft={draft} onChange={setDraft} fixedKind problems={{ ...failed?.fields, ...(tried ? missing : null) }} />
      {save.isError && Object.keys(failed?.fields ?? {}).length === 0 ? (
        <Txt variant="caption" color="danger" accessibilityLiveRegion="polite" style={{ marginTop: 10, marginHorizontal: layout.gutter }}>
          {messageFor(save.error)}
        </Txt>
      ) : null}
      <View style={{ paddingTop: 14, paddingHorizontal: layout.barGutter }}>
        <Button
          label={words.things.save}
          size="lg"
          block
          loading={save.isPending}
          onPress={() => {
            setTried(true);
            if (Object.keys(missing).length === 0) save.mutate();
          }}
        />
      </View>
    </View>
  );
}

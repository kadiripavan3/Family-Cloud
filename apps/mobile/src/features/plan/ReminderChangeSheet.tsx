import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';

import { useCache } from '@/api/cache';
import { ApiError, messageFor } from '@/api/fetcher';
import { changeReminder, type ReminderResponse } from '@/api/generated/homeport';
import { useCircles } from '@/features/circles/current';
import { layout } from '@/theme';
import { Button } from '@/ui/Button';
import { Sheet } from '@/ui/Sheet';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

import { reminderChangeRequest, reminderDraftOf } from './reminderDraft';
import { ReminderFields } from './ReminderFields';

type Props = { reminder: ReminderResponse; visible: boolean; onClose: () => void };

/** Changes a reminder: the same boxes and rows as a new one, filled with what it is now. */
export function ReminderChangeSheet({ reminder, visible, onClose }: Props) {
  return (
    <Sheet visible={visible} onClose={onClose} title={words.plan.reminderForm.changeTitle} tall>
      <Changing reminder={reminder} onClose={onClose} />
    </Sheet>
  );
}

function Changing({ reminder, onClose }: Omit<Props, 'visible'>) {
  const cache = useCache();
  const circle = useCircles().find((one) => one.id === reminder.circleId);
  const says = words.plan.reminderForm;
  const [draft, setDraft] = useState(() => reminderDraftOf(reminder));
  const [nameless, setNameless] = useState(false);
  const save = useMutation({
    mutationFn: () => changeReminder(reminder.id, reminderChangeRequest(draft, reminder)),
    onSuccess: (saved) => {
      void cache.reminderSaved(saved);
      onClose();
    },
  });
  const failed = save.error instanceof ApiError ? save.error : null;
  if (!circle) return null;
  return (
    <View style={{ paddingTop: 6 }}>
      <ReminderFields circle={circle} draft={draft} onChange={setDraft} problems={{ ...failed?.fields, ...(nameless ? { title: says.needsTitle } : null) }} />
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
            if (draft.title.trim().length === 0) return setNameless(true);
            setNameless(false);
            save.mutate();
          }}
        />
      </View>
    </View>
  );
}

import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { View } from 'react-native';

import { useCache } from '@/api/cache';
import { ApiError, messageFor } from '@/api/fetcher';
import { createSheet } from '@/api/generated/homeport';
import { useCircle } from '@/features/circles/current';
import { Trouble } from '@/features/money/parts';
import { TemplateGrid } from '@/features/money/sheet/Templates';
import { StartsAsPill } from '@/features/sharing/StartsAsPill';
import { useStartsAs } from '@/features/sharing/useStartsAs';
import { thingHref } from '@/features/things/open';
import { today } from '@/lib/dates';
import { newClientId } from '@/lib/ids';
import { layout } from '@/theme';
import { AppBar } from '@/ui/AppBar';
import { Button } from '@/ui/Button';
import { Field } from '@/ui/Field';
import { GroupLabel } from '@/ui/Heading';
import { Screen } from '@/ui/Screen';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

/**
 * /new/sheet, one of the ten things the + sheet opens: a table that does the maths, made in the current
 * circle. Give it a name and start blank, or start from a template that has its columns and formulas
 * already. It starts as seen by whoever the + sheet said (`?audience=…`), or by what the circle's kind says.
 */
export default function NewSheet() {
  const router = useRouter();
  const cache = useCache();
  const circle = useCircle();
  const [audience, setAudience] = useStartsAs(circle);
  const [title, setTitle] = useState('');
  const clientId = useRef(newClientId());
  const start = useMutation({
    mutationFn: () => createSheet({ clientId: clientId.current, circleId: circle.id, title: title.trim(), audience, day: today() }),
    onSuccess: (sheet) => {
      void cache.sheetMade(sheet);
      router.replace(thingHref({ kind: 'sheet', id: sheet.id }));
    },
  });
  const failed = start.error instanceof ApiError ? start.error : null;

  return (
    <Screen header={<AppBar leading="close" title={words.money.sheets.new} />}>
      <View style={{ gap: 12, paddingTop: 8 }}>
        <Field label={words.money.sheets.name} value={title} onChangeText={setTitle} maxLength={120} placeholder={words.money.sheets.namePlaceholder} autoFocus error={failed?.fields.title} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 4 }}>
          <Txt variant="caption" color="muted">
            {words.things.seenBy}
          </Txt>
          <StartsAsPill circle={circle} value={audience} onChange={setAudience} />
        </View>
        <Button label={words.money.sheets.startBlank} size="lg" block disabled={title.trim().length === 0} loading={start.isPending} onPress={() => start.mutate()} />
        <Trouble message={start.isError && !failed?.fields.title ? messageFor(start.error) : null} style={{ marginTop: 0, marginHorizontal: 4 }} />
      </View>
      <View style={{ marginHorizontal: -layout.rowGutter }}>
        <GroupLabel style={{ marginHorizontal: layout.gutter }}>{words.money.sheets.orTemplate}</GroupLabel>
        <TemplateGrid audience={audience} onStarted={(sheet) => router.replace(thingHref({ kind: 'sheet', id: sheet.id }))} />
      </View>
    </Screen>
  );
}

import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useRef } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { useCache } from '@/api/cache';
import { messageFor } from '@/api/fetcher';
import { type Audience, createSheet, type SheetResponse, type SheetTemplate, type TemplateResponse, useGetSheetTemplates } from '@/api/generated/homeport';
import { useCircle } from '@/features/circles/current';
import { today } from '@/lib/dates';
import { newClientId } from '@/lib/ids';
import { layout, radius, useTheme } from '@/theme';
import { Emoji } from '@/ui/Emoji';
import { Tap } from '@/ui/Motion';
import { Sk } from '@/ui/Skeleton';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

import { Trouble } from '../parts';

type Props = {
  /** Who a sheet started here is seen by, when the person chose (the form behind the + button). Left out: what the circle's kind says. */
  audience?: Audience;
  /** What happens with the sheet a template made: the screen opens it. */
  onStarted: (sheet: SheetResponse) => void;
};

/**
 * The templates a sheet can start from, two to a row, as the API lists them. Pressing one makes the sheet,
 * with its columns, formulas and a few sample rows, in the current circle. The loan planner is "live": it
 * opens with sliders to try first, and becomes a sheet when the person says "Keep as a sheet" there.
 */
export function TemplateGrid({ audience, onStarted }: Props) {
  const router = useRouter();
  const cache = useCache();
  const circle = useCircle();
  const { width } = useWindowDimensions();
  const templates = useGetSheetTemplates();
  /** One id for each template, so a second tap on the same card doesn't make a second sheet. */
  const ids = useRef<Partial<Record<SheetTemplate, string>>>({});
  const start = useMutation({
    mutationFn: (template: SheetTemplate) => createSheet({ clientId: (ids.current[template] ??= newClientId()), circleId: circle.id, template, audience, day: today() }),
    onSuccess: (sheet, template) => {
      delete ids.current[template];
      void cache.sheetMade(sheet);
      onStarted(sheet);
    },
  });
  const card = (width - 2 * layout.barGutter - 10) / 2;

  if (!templates.data) {
    return (
      <View accessibilityLabel={words.states.loading} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginHorizontal: layout.barGutter }}>
        {[0, 1, 2, 3].map((one) => (
          <Sk key={one} width={card} height={132} radius="cardLarge" />
        ))}
      </View>
    );
  }
  return (
    <>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginHorizontal: layout.barGutter }}>
        {templates.data.map((template) => (
          <TemplateCard
            key={template.code}
            template={template}
            width={card}
            on={start.isPending && start.variables === template.code}
            onPress={() => {
              // The planner is tried first, on a screen of its own. (The savings plan has no such screen yet: it starts as its sheet.)
              if (template.code === 'loan') router.push('/money/loan');
              else if (!start.isPending) start.mutate(template.code);
            }}
          />
        ))}
      </View>
      <Trouble message={start.isError ? messageFor(start.error) : null} />
    </>
  );
}

function TemplateCard({ template, width, on, onPress }: { template: TemplateResponse; width: number; on: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel={words.money.sheets.template(template.title, template.says, template.live)}
      accessibilityState={{ busy: on }}
      onPress={onPress}
      style={{ width, gap: 4, padding: on ? 15.5 : 16, borderRadius: radius.cardLarge, borderWidth: on ? 2 : 1.5, borderColor: on ? colors.text : colors.line, backgroundColor: colors.bg }}>
      <View style={{ marginBottom: 8 }}>
        <Emoji char={template.emoji} size={34} />
      </View>
      <Txt variant="headline" weight={800}>
        {template.title}
      </Txt>
      <Txt variant="footnote" color="muted">
        {template.says}
      </Txt>
      {template.live ? (
        <View style={{ position: 'absolute', top: 12, right: 12, paddingVertical: 4, paddingHorizontal: 8, borderRadius: radius.chip, backgroundColor: colors.text }}>
          <Txt variant="micro" style={{ color: colors.bg }}>
            {words.money.sheets.live}
          </Txt>
        </View>
      ) : null}
    </Tap>
  );
}

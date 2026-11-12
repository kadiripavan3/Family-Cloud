import { useRouter } from 'expo-router';
import { Mic, Sparkles } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import type { Audience } from '@/api/generated/homeport';
import { useCircle } from '@/features/circles/current';
import { AudienceChip } from '@/features/sharing/AudienceChip';
import { StartsAsPill } from '@/features/sharing/StartsAsPill';
import { layout, radius, useTheme } from '@/theme';
import { Emoji } from '@/ui/Emoji';
import { Tap } from '@/ui/Motion';
import { Sheet } from '@/ui/Sheet';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

import { NEW_THINGS, newThingHref } from './newThings';

/**
 * 3.4 The + button: the sheet behind it. The + always creates. Pick one of ten things; each opens its own
 * screen. Whatever is added goes into the current circle and starts as that circle's kind says ("Only you"
 * in a family), unless it is changed here for this one thing. The line on top opens Plan's "Type it"
 * (`/plan/quick-add`), where a sentence is read as it is typed.
 */
export function PlusSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <Sheet visible={visible} onClose={onClose}>
      <Things onClose={onClose} />
    </Sheet>
  );
}

/** The sheet's inside. It starts afresh each time the sheet opens: what was changed for one thing is not kept for the next. */
function Things({ onClose }: { onClose: () => void }) {
  const { colors } = useTheme();
  const router = useRouter();
  const circle = useCircle();
  const [audience, setAudience] = useState<Audience | null>(null);
  const startsAs = audience ?? circle.startsAs;

  return (
    <>
      <Tap
        accessibilityRole="button"
        accessibilityLabel={words.today.plus.typeItLabel}
        onPress={() => {
          onClose();
          // Plan's "Type it": the line is read as it is typed. Who it starts as seen by goes along, as for the ten.
          router.push(audience ? { pathname: '/plan/quick-add', params: { audience } } : '/plan/quick-add');
        }}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, marginTop: 8, marginHorizontal: layout.barGutter, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: colors.fill }}>
        <Sparkles size={19} color={colors.accentText} />
        <Txt variant="control" weight={500} color="muted" numberOfLines={1} style={{ flex: 1 }}>
          {words.today.plus.typeIt}
        </Txt>
        <Mic size={19} color={colors.text} />
      </Tap>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 16, marginTop: 18, marginBottom: 6, marginHorizontal: 12 }}>
        {NEW_THINGS.map((thing) => (
          <Tap
            key={thing.id}
            accessibilityRole="button"
            accessibilityLabel={words.today.plus.things[thing.id]}
            onPress={() => {
              onClose();
              // Only what the person changed is handed over; otherwise the circle's kind decides.
              router.push(newThingHref(thing.id, audience ?? undefined));
            }}
            // Five to a row.
            style={{ width: '20%', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 56, height: 56, borderRadius: radius.photo, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.fill }}>
              <Emoji char={thing.emoji} size={32} />
            </View>
            <Txt variant="small" weight={700} center numberOfLines={1}>
              {words.today.plus.things[thing.id]}
            </Txt>
          </Tap>
        ))}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 14, marginHorizontal: layout.rowGutter }}>
        <Txt variant="caption" color="muted">
          {words.today.plus.goesInto}
        </Txt>
        <AudienceChip quiet thing={{ circleId: circle.id, chip: { audience: 'circle' } }} />
        <Txt variant="caption" color="muted">
          {words.today.plus.seenBy}
        </Txt>
        <StartsAsPill circle={circle} value={startsAs} onChange={setAudience} />
      </View>
    </>
  );
}

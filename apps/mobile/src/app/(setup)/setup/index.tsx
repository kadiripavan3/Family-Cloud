import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { View } from 'react-native';

import { useCache } from '@/api/cache';
import { messageFor } from '@/api/fetcher';
import { changeCircle, type CircleKind, type CircleResponse, createCircle, useGetMe } from '@/api/generated/homeport';
import { switchCircle } from '@/features/circles/current';
import { SetupFrame } from '@/features/circles/SetupFrame';
import { newClientId } from '@/lib/ids';
import { firstName } from '@/lib/names';
import { layout, radius, useTheme } from '@/theme';
import { Button } from '@/ui/Button';
import { Emoji } from '@/ui/Emoji';
import { Heading, Lead } from '@/ui/Heading';
import { MoreRow } from '@/ui/MoreRow';
import { Tap } from '@/ui/Motion';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

/** The four kinds a circle of several people can be, in the order of the cards. */
const SHARED = ['family', 'couple', 'flat', 'crew'] as const;
type Shared = (typeof SHARED)[number];

/** The name a new circle starts with, until the person types their own on the next step. */
function suggestedName(kind: CircleKind, displayName: string): string {
  const names = displayName.trim().split(/\s+/);
  const suggested = words.setup.kind.suggested;
  if (kind === 'solo') return words.circles.yours.justMe;
  if (kind === 'family') return suggested.family(names.length > 1 ? names[names.length - 1]! : '');
  if (kind === 'couple') return suggested.couple(firstName(displayName));
  return suggested[kind];
}

/**
 * 2.1 Who is it for? Step 1 of 3. Four kinds of circle, and "Just me for now". The kind only sets sensible
 * defaults; nothing is locked. Continue makes the circle, so the next step can add people to it; coming
 * back here and choosing again changes that one instead of making a second.
 */
export default function CircleKindStep() {
  const { colors } = useTheme();
  const router = useRouter();
  const cache = useCache();
  const me = useGetMe().data?.profile;
  const [kind, setKind] = useState<Shared>('family');
  const [made, setMade] = useState<CircleResponse | null>(null);
  const clientId = useRef(newClientId());

  const save = useMutation({
    mutationFn: async (next: CircleKind) => {
      const name = suggestedName(next, me?.displayName ?? '');
      if (!made) return createCircle({ clientId: clientId.current, kind: next, name });
      if (made.kind === next) return made;
      // A name nobody typed follows the kind; one that was typed stays.
      const untouched = made.name === suggestedName(made.kind, me?.displayName ?? '');
      return changeCircle(made.id, untouched ? { kind: next, name } : { kind: next });
    },
    onSuccess: async (circle) => {
      setMade(circle);
      await cache.circleJoined(circle);
      switchCircle(circle.id);
      const step = circle.kind === 'solo' ? '/setup/ready' : circle.kind === 'family' ? '/setup/people' : '/setup/made';
      router.push({ pathname: step, params: { circle: circle.id } });
    },
  });

  return (
    <SetupFrame
      step={1}
      footer={
        <>
          {save.isError ? (
            <Txt variant="caption" color="danger" center accessibilityLiveRegion="polite">
              {messageFor(save.error)}
            </Txt>
          ) : null}
          <Button label={words.common.continue} size="lg" block loading={save.isPending && save.variables !== 'solo'} disabled={save.isPending} onPress={() => save.mutate(kind)} />
        </>
      }>
      <View style={{ paddingHorizontal: layout.rowGutter }}>
        <Heading style={{ marginTop: 6 }}>{words.setup.kind.title}</Heading>
        <Lead>{words.setup.kind.lead}</Lead>
      </View>
      <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 16, marginHorizontal: layout.barGutter }}>
        {SHARED.map((one) => {
          const on = one === kind;
          const says = words.kinds[one];
          return (
            <Tap
              key={one}
              accessibilityRole="radio"
              accessibilityLabel={words.common.spoken([says.name, words.setup.kind.cards[one]])}
              accessibilityState={{ checked: on }}
              // Said this way, a browser hears which one is chosen as well: the web takes no `accessibilityState`.
              aria-checked={on}
              onPress={() => setKind(one)}
              style={{
                // Two to a row.
                flexBasis: '45%',
                flexGrow: 1,
                gap: 4,
                // The thicker line of the chosen one takes its half point from the padding, so nothing moves.
                padding: on ? 15.5 : 16,
                borderRadius: radius.cardLarge,
                borderWidth: on ? 2 : 1.5,
                borderColor: on ? colors.text : colors.line,
                backgroundColor: colors.bg,
              }}>
              <View style={{ marginBottom: 8 }}>
                <Emoji char={says.emoji} size={41} />
              </View>
              <Txt variant="headline" weight={800}>
                {says.name}
              </Txt>
              <Txt variant="footnote" color="muted">
                {words.setup.kind.cards[one]}
              </Txt>
            </Tap>
          );
        })}
      </View>
      <MoreRow emoji={words.kinds.solo.emoji} title={words.setup.kind.justMe} rest={words.setup.kind.justMeRest} onPress={() => (save.isPending ? undefined : save.mutate('solo'))} />
    </SetupFrame>
  );
}

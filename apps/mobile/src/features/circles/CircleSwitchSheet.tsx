import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Check, ChevronRight, Lock, Plus } from 'lucide-react-native';
import { useRef } from 'react';
import { View } from 'react-native';

import { useCache } from '@/api/cache';
import { messageFor } from '@/api/fetcher';
import { type CircleResponse, createCircle, useGetCircleSwitcher } from '@/api/generated/homeport';
import { newClientId } from '@/lib/ids';
import { layout, radius, useTheme } from '@/theme';
import { Emoji } from '@/ui/Emoji';
import { Tap } from '@/ui/Motion';
import { Photo } from '@/ui/Photo';
import { Sheet, SheetRow } from '@/ui/Sheet';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

import { useCircle, useCircles, useSwitchCircle } from './current';
import { circleLine } from './members';

/**
 * 3.2 Your circles: the sheet behind the round button in Home's search pill. The circles the person shares
 * with others, a tick on the one they are in; "Just me", their circle of one (made the first time it is
 * chosen); and the way to a new circle. Each circle's line is the API's ("Friends · 5 people · you're owed
 * €64": every place adds its own few words), and so is the count under "Just me"; until they arrive, a line
 * says what the phone knows already.
 */
export function CircleSwitchSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { colors } = useTheme();
  const router = useRouter();
  const cache = useCache();
  const circles = useCircles();
  const current = useCircle();
  const switchTo = useSwitchCircle();
  // Each circle's line, and how many things only this person can see in all their circles. Asked for afresh
  // each time the sheet opens: a circle made a moment ago has its line, and a debt settled meanwhile is gone from one.
  const switcher = useGetCircleSwitcher({ query: { enabled: visible, staleTime: 0 } }).data;
  const onlyYou = switcher?.onlyYou;
  const lineOf = (circle: CircleResponse) => switcher?.circles.find((one) => one.id === circle.id)?.line ?? circleLine(circle);

  const shared = circles.filter((circle) => circle.kind !== 'solo');
  const solo = circles.find((circle) => circle.kind === 'solo');
  const choose = (circle: CircleResponse) => {
    switchTo(circle.id);
    onClose();
  };

  // "Just me" is a circle of one. Someone who has none yet gets it the first time they choose it.
  const clientId = useRef(newClientId());
  const makeSolo = useMutation({
    mutationFn: () => createCircle({ clientId: clientId.current, kind: 'solo', name: words.circles.yours.justMe }),
    onSuccess: async (circle) => {
      await cache.circleJoined(circle);
      choose(circle);
    },
  });

  return (
    <Sheet visible={visible} onClose={onClose} title={words.circles.yours.title}>
      {shared.map((circle) => {
        const on = circle.id === current.id;
        const line = lineOf(circle);
        return (
          <Tap
            key={circle.id}
            accessibilityRole="button"
            accessibilityLabel={words.circles.yours.row(circle.name, line, on)}
            // Said this way, a browser hears which one is chosen as well: the web takes no `accessibilityState`.
            aria-current={on}
            onPress={() => choose(circle)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4, marginBottom: 8, marginHorizontal: layout.barGutter, padding: 10, borderRadius: radius.card, backgroundColor: colors.fill }}>
            <Photo uri={circle.coverUrl} radius="thumb" style={{ width: 56, height: 56, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.fill2 }}>
              {circle.coverUrl ? null : <Emoji char={words.kinds[circle.kind].emoji} size={30} />}
            </Photo>
            <View style={{ flex: 1 }}>
              <Txt variant="item" weight={800} numberOfLines={1}>
                {circle.name}
              </Txt>
              {/* The API's line can be long ("… · you're owed €64"): it runs on to a second line before it is cut. */}
              <Txt variant="footnote" color="muted" numberOfLines={2}>
                {line}
              </Txt>
            </View>
            {on ? <Tick /> : null}
          </Tap>
        );
      })}
      <SheetRow
        first
        icon={(c) => <Lock size={22} color={c} />}
        label={words.circles.yours.justMe}
        note={onlyYou === undefined ? undefined : words.circles.yours.onlyYou(onlyYou)}
        trailing={solo && solo.id === current.id ? <Tick /> : <ChevronRight size={18} color={colors.muted} />}
        onPress={() => (solo ? choose(solo) : makeSolo.mutate())}
      />
      {makeSolo.isError ? (
        <Txt variant="caption" color="danger" accessibilityLiveRegion="polite" style={{ paddingHorizontal: layout.gutter, paddingBottom: 8 }}>
          {messageFor(makeSolo.error)}
        </Txt>
      ) : null}
      <SheetRow
        icon={(c) => <Plus size={22} color={c} />}
        label={words.circles.yours.newCircle.label}
        note={words.circles.yours.newCircle.note}
        trailing={<ChevronRight size={18} color={colors.muted} />}
        onPress={() => {
          onClose();
          router.push('/setup');
        }}
      />
    </Sheet>
  );
}

/** The round tick on the circle the person is in. */
function Tick() {
  const { colors } = useTheme();
  return (
    <View style={{ width: 26, height: 26, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent }}>
      <Check size={14} color={colors.onAccent} strokeWidth={3} />
    </View>
  );
}

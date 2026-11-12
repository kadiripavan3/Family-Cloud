import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Check, ChevronRight, Lock, Plus } from 'lucide-react-native';
import { useRef } from 'react';
import { View } from 'react-native';

import { useCache } from '@/api/cache';
import { messageFor } from '@/api/fetcher';
import { type CircleResponse, createCircle, useGetToday } from '@/api/generated/homeport';
import { today } from '@/lib/dates';
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
 * chosen); and the way to a new circle.
 */
export function CircleSwitchSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { colors } = useTheme();
  const router = useRouter();
  const cache = useCache();
  const circles = useCircles();
  const current = useCircle();
  const switchTo = useSwitchCircle();
  // How many things only this person can see, in all their circles: Today counts them.
  const onlyYou = useGetToday(current.id, { day: today() }, { query: { enabled: visible } }).data?.onlyYou;

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
        const line = circleLine(circle);
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
              <Txt variant="footnote" color="muted" numberOfLines={1}>
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

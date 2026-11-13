import { useMutation } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { View } from 'react-native';

import { useCache } from '@/api/cache';
import { messageFor } from '@/api/fetcher';
import { askToSee, useGetAsk, withdrawAsk } from '@/api/generated/homeport';
import { addDays, fromISODate, timeAgo, today } from '@/lib/dates';
import { newClientId } from '@/lib/ids';
import { layout, radius, useTheme } from '@/theme';
import { Button } from '@/ui/Button';
import { Tap } from '@/ui/Motion';
import { Sheet } from '@/ui/Sheet';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

const says = words.activity.ask;

/** How long the person would like it for. */
type Way = keyof typeof says.ways;
const WAYS: readonly Way[] = ['today', 'once', 'open'];

/** What the API is asked for, by the way chosen: until midnight on this phone, for one look, or with no end. */
function wish(way: Way): { until?: string; once?: boolean } {
  if (way === 'today') return { until: fromISODate(addDays(today(), 1)).toISOString() };
  return way === 'once' ? { once: true } : {};
}

type Props = {
  /** The thing the person can see exists and can't open. */
  thing: { id: string; circleId: string; title: string };
  /** The first name of whoever it belongs to. */
  owner: string;
};

/**
 * "Ask to see it": for a thing the viewer knows is there and can't open (an item of the Vault whose one look
 * is used up, that stopped working, or that no key was ever sealed for). The owner finds the question in
 * Activity and answers it there. While a question waits, this says so and offers to take it back; after
 * "not now" it says that, and asking again is open. It draws nothing when there is nothing to ask.
 */
export function AskToSee({ thing, owner }: Props) {
  const cache = useCache();
  const standing = useGetAsk(thing.id).data;
  const [asking, setAsking] = useState(false);
  const [way, setWay] = useState<Way>('today');
  // One id for one question: a second tap, or a try again, doesn't ask twice.
  const clientId = useRef(newClientId());
  const ask = useMutation({
    mutationFn: () => askToSee(thing.id, { clientId: clientId.current, ...wish(way) }),
    onSuccess: () => {
      clientId.current = newClientId();
      setAsking(false);
      return cache.askChanged(thing);
    },
  });
  const withdraw = useMutation({ mutationFn: (askId: string) => withdrawAsk(askId), onSuccess: () => cache.askChanged(thing) });

  if (!standing) return null;
  const last = standing.ask?.mine ? standing.ask : null;
  const waiting = last?.state === 'open';
  if (!waiting && !standing.canAsk) return null;

  return (
    <View style={{ alignItems: 'flex-start', gap: 8, marginTop: 12, marginHorizontal: layout.barGutter }}>
      {waiting ? (
        <>
          <Txt variant="note" color="muted" accessibilityLiveRegion="polite" style={{ marginHorizontal: 6 }}>
            {says.waiting(owner, timeAgo(last.askedAt))}
          </Txt>
          <Button label={says.withdraw} variant="soft" size="sm" loading={withdraw.isPending} onPress={() => withdraw.mutate(last.id)} />
        </>
      ) : (
        <>
          {last?.state === 'declined' ? (
            <Txt variant="note" color="muted" style={{ marginHorizontal: 6 }}>
              {says.declined(owner)}
            </Txt>
          ) : null}
          <Button label={says.button} variant="ink" onPress={() => setAsking(true)} />
        </>
      )}
      {withdraw.isError ? (
        <Txt variant="caption" color="danger" accessibilityLiveRegion="polite" style={{ marginHorizontal: 6 }}>
          {messageFor(withdraw.error)}
        </Txt>
      ) : null}

      <Sheet visible={asking} onClose={() => setAsking(false)} title={says.title(thing.title)} subtitle={says.lead(owner)}>
        <View accessibilityRole="radiogroup" style={{ gap: 10, marginHorizontal: layout.barGutter }}>
          {WAYS.map((one) => (
            <Choice key={one} on={one === way} label={says.ways[one].label} note={says.ways[one].note} onPress={() => setWay(one)} />
          ))}
        </View>
        {ask.isError ? (
          <Txt variant="caption" color="danger" center accessibilityLiveRegion="polite" style={{ marginTop: 10, marginHorizontal: layout.gutter }}>
            {messageFor(ask.error)}
          </Txt>
        ) : null}
        <View style={{ paddingTop: 14, paddingHorizontal: layout.rowGutter }}>
          <Button label={says.send(owner)} size="lg" block loading={ask.isPending} onPress={() => ask.mutate()} />
        </View>
      </Sheet>
    </View>
  );
}

/** One way of having it: a line, what it means, and a radio button. */
function Choice({ on, label, note, onPress }: { on: boolean; label: string; note: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Tap
      accessibilityRole="radio"
      accessibilityLabel={words.common.spoken([label, note])}
      accessibilityState={{ checked: on }}
      // Said this way, a browser hears which one is chosen as well: the web takes no `accessibilityState`.
      aria-checked={on}
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        // The thicker line of the chosen one takes its half point from the padding, so nothing moves.
        paddingVertical: on ? 12.5 : 13,
        paddingHorizontal: on ? 15.5 : 16,
        borderRadius: radius.card,
        borderWidth: on ? 2 : 1.5,
        borderColor: on ? colors.text : colors.line,
        backgroundColor: colors.bg,
      }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Txt variant="item" weight={800}>
          {label}
        </Txt>
        <Txt variant="caption" weight={500} color="muted">
          {note}
        </Txt>
      </View>
      <View style={{ width: 22, height: 22, borderRadius: radius.pill, borderWidth: on ? 7 : 2, borderColor: on ? colors.text : colors.lineStrong }} />
    </Tap>
  );
}

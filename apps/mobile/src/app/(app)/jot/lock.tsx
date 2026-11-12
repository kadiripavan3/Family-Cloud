import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Mic, Plus } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

import { useCache } from '@/api/cache';
import { messageFor } from '@/api/fetcher';
import { changeChecklistItem, type ListInUseResponse, stopUsingList, useGetWidgets, useList as startUsingList, type WidgetLineResponse, type WidgetsResponse } from '@/api/generated/homeport';
import { useCircle } from '@/features/circles/current';
import { OnPhoto, OnPhotoNote } from '@/features/jot/OnPhoto';
import { phoneNow } from '@/features/jot/phone';
import { TickLine, useWidgetLines } from '@/features/jot/Widgets';
import { PageProblem } from '@/features/states/PageProblem';
import { useOpenThing } from '@/features/things/open';
import { formatTime } from '@/lib/dates';
import { loadState } from '@/lib/loading';
import { firstName } from '@/lib/names';
import { radius, useTheme, withAlpha } from '@/theme';
import { BrandMark } from '@/ui/Brand';
import { Button } from '@/ui/Button';
import { Frost } from '@/ui/Frost';
import { Loading } from '@/ui/Loading';
import { Tap } from '@/ui/Motion';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

/**
 * 14.5 On the iPhone Lock Screen, as the app shows it: the small widgets under the clock, the list that is
 * in use with its ticks (a Live Activity on the phone, for up to eight hours), and the pinned note. The
 * ticks tick, the buttons open the jot bar and voice, and "Use this list on the Lock Screen" says which
 * list you are using right now (the API's `useList`, which is a call and not a hook, so it has another name here). On the Lock Screen itself these are native code, written in
 * native/jot and first run on a phone build; the quiet line says so.
 */
export default function Lock() {
  const circle = useCircle();
  const asked = useGetWidgets(circle.id, phoneNow());
  const load = loadState(asked);
  return (
    <OnPhoto photo="bed" shade="light">
      {load.error ? <PageProblem tone="onPhoto" error={load.error} onRetry={load.retry} retrying={load.retrying} inset={false} /> : !asked.data ? <Loading tone="onPhoto" offline={load.offline} /> : <LockScreen widgets={asked.data} />}
    </OnPhoto>
  );
}

function LockScreen({ widgets }: { widgets: WidgetsResponse }) {
  const { colors } = useTheme();
  const router = useRouter();
  const circle = useCircle();
  const cache = useCache();
  const open = useOpenThing();
  const now = new Date();
  const { shopping, inUse } = widgets;
  /** The list the button is about: the one in use, else the shopping list. */
  const list = inUse?.list ?? shopping;

  const use = useMutation({
    mutationFn: (start: boolean) => (start && list ? startUsingList(circle.id, { listId: list.id }) : stopUsingList(circle.id)),
    onSuccess: () => void cache.listInUseChanged(circle.id),
  });
  const tick = useMutation({
    mutationFn: (line: WidgetLineResponse) => changeChecklistItem(line.id, { done: !line.done }),
    onSettled: () => (inUse ? cache.checklistLineChanged({ id: inUse.list.id, circleId: circle.id }) : undefined),
  });
  const problem = [use, tick].find((one) => one.isError)?.error;

  /** One of the round widgets under the clock. */
  const round = (label: string, onPress: () => void, inside: ReactNode) => (
    <Tap accessibilityRole="button" accessibilityLabel={label} onPress={onPress} scaleTo={0.92} style={{ width: 58, height: 58, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: withAlpha(colors.stage, 0.42), borderWidth: 1, borderColor: withAlpha(colors.white, 0.14) }}>
      <Frost tone="dark" intensity={20} />
      {inside}
    </Tap>
  );

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1, paddingBottom: 20 }}>
      <View accessible accessibilityRole="header" style={{ alignItems: 'center', marginTop: 28 }}>
        <Txt variant="subtitle" weight={600} color="onPhoto">
          {words.jot.lock.date(now.getDay(), now.getDate(), now.getMonth())}
        </Txt>
        {/* The clock is bigger than any text the app itself uses: the largest style, drawn larger. */}
        <View style={{ height: 104, justifyContent: 'center' }}>
          <Txt variant="hero" weight={700} color="onPhoto" style={{ transform: [{ scale: 2.3 }] }}>
            {words.jot.clock(formatTime(now))}
          </Txt>
        </View>
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 14, marginTop: 14 }}>
        {round(words.jot.lock.add, () => router.push('/jot'), <Plus size={24} color={colors.white} />)}
        {round(words.jot.lock.mic, () => router.push('/jot/voice'), <Mic size={24} color={colors.white} />)}
        {shopping
          ? round(
              words.jot.lock.toBuyLabel(shopping.left, shopping.title),
              () => open({ kind: 'checklist', id: shopping.id }),
              <>
                <Txt variant="subtitle" color="onPhoto">
                  {shopping.left}
                </Txt>
                <Txt variant="micro" weight={700} color="onPhoto" style={{ opacity: 0.8, marginTop: -3 }}>
                  {words.jot.lock.toBuy}
                </Txt>
              </>,
            )
          : null}
      </View>

      <View style={{ flex: 1, minHeight: 24 }} />
      <View style={{ gap: 8, marginHorizontal: 12 }}>
        <OnPhotoNote>
          <Txt variant="footnote" color="onPhoto" accessibilityLiveRegion="polite">
            {problem ? messageFor(problem) : list && !inUse ? words.jot.lock.useNote(list.title) : words.jot.lock.standIn}
          </Txt>
        </OnPhotoNote>
        {list ? <Button variant="glass" block label={inUse?.you ? words.jot.lock.stop : words.jot.lock.use} loading={use.isPending} onPress={() => use.mutate(!inUse?.you)} /> : null}

        {inUse ? <InUse inUse={inUse} onTick={(line) => tick.mutate(line)} /> : null}
        <Tap accessibilityRole="button" accessibilityLabel={words.jot.lock.note.open} onPress={() => router.push('/jot')} onLongPress={() => router.push('/jot')} scaleTo={0.98}>
          <Notice title={words.jot.lock.note.title} aside={words.jot.lock.note.pinned}>
            <Txt variant="note" color="onPhoto" style={{ marginTop: 2, opacity: 0.92 }}>
              {words.jot.lock.hold(widgets.addedToday)}
            </Txt>
          </Notice>
        </Tap>
      </View>
    </ScrollView>
  );
}

/** The list someone is using right now, with its first lines to tick: what the Live Activity shows. */
function InUse({ inUse, onTick }: { inUse: ListInUseResponse; onTick: (line: WidgetLineResponse) => void }) {
  const [lines, tick] = useWidgetLines(inUse.list.lines, 3);
  return (
    <Notice title={inUse.list.title} aside={words.jot.lock.using(firstName(inUse.by.name), inUse.you)}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 6, marginTop: 8 }}>
        {lines.map((line) => (
          <TickLine
            key={line.id}
            tone="glass"
            compact
            line={line}
            onTick={() => {
              tick(line);
              onTick(line);
            }}
          />
        ))}
      </View>
    </Notice>
  );
}

/** A notification on the Lock Screen: the app's mark, a bold line with a few quiet words at its right, and what is under it. */
function Notice({ title, aside, children }: { title: string; aside: string; children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 12, borderRadius: radius.cardLarge, overflow: 'hidden', backgroundColor: withAlpha(colors.stage, 0.5), borderWidth: 1, borderColor: withAlpha(colors.white, 0.12) }}>
      <Frost tone="dark" intensity={26} />
      <BrandMark size={38} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
          <Txt variant="callout" weight={800} color="onPhoto" numberOfLines={1} style={{ flexShrink: 1 }}>
            {title}
          </Txt>
          <Txt variant="small" weight={500} color="onPhoto" style={{ opacity: 0.7 }}>
            {aside}
          </Txt>
        </View>
        {children}
      </View>
    </View>
  );
}

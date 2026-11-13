import { useMutation } from '@tanstack/react-query';
import { useLocalSearchParams, usePreventRemove, useRouter } from 'expo-router';
import { Sparkle, X } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCache } from '@/api/cache';
import { messageFor } from '@/api/fetcher';
import { changeJourneyDraft, deleteJourneyDraft, type JourneyDraftChangeRequest, type JourneyDraftDay, type JourneyDraftResponse, useGetJourneyDraft } from '@/api/generated/homeport';
import { useOpenJourney } from '@/features/journeyLink/open';
import { DaySheet } from '@/features/journeyLink/tell/DaySheet';
import { useToast } from '@/features/library/Toast';
import { useLeave } from '@/features/navigation/useLeave';
import { NotFound } from '@/features/states/NotFound';
import { PageProblem } from '@/features/states/PageProblem';
import { looksLikeId } from '@/features/things/open';
import { formatWeekdayPast } from '@/lib/dates';
import { loadState } from '@/lib/loading';
import { layout, radius, useTheme } from '@/theme';
import { AppBar } from '@/ui/AppBar';
import { AvoidKeyboard } from '@/ui/AvoidKeyboard';
import { Button } from '@/ui/Button';
import { ConfirmSheet } from '@/ui/ConfirmSheet';
import { Field } from '@/ui/Field';
import { Loading } from '@/ui/Loading';
import { Tap } from '@/ui/Motion';
import { NoteBox } from '@/ui/NoteBox';
import { Photo } from '@/ui/Photo';
import { rich } from '@/ui/rich';
import { RoundButton } from '@/ui/RoundButton';
import { Sk } from '@/ui/Skeleton';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

/** How many tiles a day's strip has: four photos and how many more, or five photos. */
const STRIP = 5;

/**
 * 10.5 Tell it as a journey: the draft the API made from a moment or an album. Where it comes from, its
 * title to change, and its photos sorted into days by when and where they were taken; pressing a day
 * changes its first line, moves a photo to another day or leaves one out. Nothing has been posted: the next
 * screen (10.6) stands between this and Journey. A draft is its writer's alone; closing it throws it away.
 */
export default function TellJourney() {
  const { id, left } = useLocalSearchParams<{ id: string; left?: string }>();
  const { colors } = useTheme();
  const isThing = looksLikeId(id);
  const asked = useGetJourneyDraft(id, { query: { enabled: isThing } });
  const load = loadState(asked);
  const draft = asked.data;
  if (!isThing) return <NotFound />;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      {load.error ? (
        <>
          <AppBar leading="close" title={words.together.tell.title} />
          <PageProblem error={load.error} onRetry={load.retry} retrying={load.retrying} inset={false} />
        </>
      ) : !draft ? (
        <>
          <AppBar leading="close" title={words.together.tell.title} />
          {load.offline ? (
            <Loading offline />
          ) : (
            <View accessibilityLabel={words.states.loading} style={{ gap: 16, paddingHorizontal: layout.barGutter }}>
              <Sk width={250} height={40} radius="pill" />
              <Sk height={62} radius="field" />
              <Sk height={78} radius="photo" />
              <Sk height={96} />
              <Sk height={96} />
            </View>
          )}
        </>
      ) : (
        <Loaded draft={draft} notIn={Number(left) || 0} />
      )}
    </SafeAreaView>
  );
}

function Loaded({ draft, notIn }: { draft: JourneyDraftResponse; notIn: number }) {
  const { colors } = useTheme();
  const router = useRouter();
  const leave = useLeave();
  const cache = useCache();
  const insets = useSafeAreaInsets();
  const says = words.together.tell;
  const [title, setTitle] = useState<string | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const { say, toast } = useToast(insets.bottom + 96);
  const openJourney = useOpenJourney(say);
  const open = draft.status === 'draft' || draft.status === 'failed';

  const change = useMutation({
    mutationFn: (request: JourneyDraftChangeRequest) => changeJourneyDraft(draft.id, request),
    onSuccess: (changed) => void cache.journeyDraftChanged(changed),
  });
  // Android's back button and a swipe ask the same question as the X, for as long as the draft is one.
  const goOn = useRef<(() => void) | null>(null);
  const [thrown, setThrown] = useState(false);
  const stopGuard = usePreventRemove(open && !thrown, ({ repeat }) => {
    goOn.current = repeat;
    setLeaving(true);
  });
  const stay = () => {
    goOn.current = null;
    setLeaving(false);
  };
  const discard = useMutation({
    mutationFn: () => deleteJourneyDraft(draft.id),
    onSuccess: () => {
      setLeaving(false);
      setThrown(true);
      stopGuard();
      // On with what was asked for (the way back that was stopped), or simply out.
      const carryOn = goOn.current;
      goOn.current = null;
      (carryOn ?? leave)();
      cache.journeyDraftGone(draft.id);
    },
  });
  const saveTitle = () => {
    if (title !== null && title.trim() && title.trim() !== draft.title) change.mutate({ title: title.trim() }, { onSettled: () => setTitle(null) });
    else setTitle(null);
  };
  const going = draft.photos + draft.clips;
  const shown = draft.days.find((one) => one.day === day) ?? null;

  return (
    <AvoidKeyboard style={{ flex: 1 }}>
      <AppBar title={says.title} left={<RoundButton label={words.common.close} onPress={() => (open ? setLeaving(true) : leave())} icon={(c) => <X size={20} color={c} />} />} />
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', maxWidth: '92%', marginHorizontal: layout.barGutter, paddingVertical: 6, paddingLeft: 6, paddingRight: 12, borderRadius: radius.cardLarge, backgroundColor: colors.fill }}>
          <Photo uri={draft.from.coverUrl} radius="chip" style={{ width: 28, height: 28 }} />
          <Txt variant="caption" weight={500} color="muted" numberOfLines={2} style={{ flexShrink: 1 }}>
            {rich(says.from(draft.from.title ?? '', draft.from.kind, draft.from.daysAround ?? 0), {
              bold: (text) => (
                <Txt variant="caption" weight={700}>
                  {text}
                </Txt>
              ),
            })}
          </Txt>
        </View>

        {open ? (
          <View style={{ marginTop: 16, marginHorizontal: layout.rowGutter }}>
            <Field label={says.titleLabel} value={title ?? draft.title} onChangeText={setTitle} onBlur={saveTitle} onSubmitEditing={saveTitle} maxLength={120} returnKeyType="done" />
          </View>
        ) : (
          <Txt variant="title" accessibilityRole="header" style={{ marginTop: 16, marginHorizontal: layout.rowGutter }}>
            {draft.title}
          </Txt>
        )}

        {open ? (
          <NoteBox soft icon={(c) => <Sparkle size={20} color={c} />} title={says.sorted.title(draft.days.length)} style={{ marginTop: 16, marginHorizontal: layout.barGutter }}>
            {says.sorted.body}
          </NoteBox>
        ) : (
          <NoteBox soft icon={(c) => <Sparkle size={20} color={c} />} title={says.posted.title} style={{ marginTop: 16, marginHorizontal: layout.barGutter }}>
            {says.posted.body}
          </NoteBox>
        )}
        {notIn > 0 ? (
          <Txt variant="footnote" color="muted" style={{ marginTop: 10, marginHorizontal: layout.gutter }}>
            {says.notAll(notIn)}
          </Txt>
        ) : null}
        {change.isError ? (
          <Txt variant="caption" color="danger" accessibilityLiveRegion="polite" style={{ marginTop: 10, marginHorizontal: layout.gutter }}>
            {messageFor(change.error)}
          </Txt>
        ) : null}

        {draft.days.map((one, index) => (
          <DayStrip key={one.day ?? index} day={one} onPress={open ? () => setDay(one.day ?? null) : undefined} />
        ))}
      </ScrollView>

      <View style={{ gap: 10, paddingTop: 12, paddingBottom: 12, paddingHorizontal: layout.rowGutter }}>
        {open && going === 0 ? (
          <Txt variant="footnote" color="muted" center>
            {says.nothing}
          </Txt>
        ) : null}
        {open ? (
          <Button label={says.next} size="lg" block disabled={going === 0} onPress={() => router.push({ pathname: '/journey/tell/[id]/check', params: { id: draft.id } })} />
        ) : draft.status === 'posting' ? (
          <Button label={words.together.check.sending} size="lg" block onPress={() => router.push({ pathname: '/journey/tell/[id]/check', params: { id: draft.id } })} />
        ) : (
          <Button label={words.together.open.inJourney} size="lg" block onPress={() => openJourney(draft.openUrl)} />
        )}
      </View>
      {toast}

      <DaySheet day={shown} days={draft.days} onClose={() => setDay(null)} onChange={(request) => change.mutate(request)} busy={change.isPending} problem={change.isError ? messageFor(change.error) : null} />
      <ConfirmSheet
        visible={leaving}
        onClose={stay}
        title={says.leave.title}
        body={says.leave.body}
        confirm={says.leave.confirm}
        cancel={says.leave.cancel}
        busy={discard.isPending}
        problem={discard.isError ? messageFor(discard.error) : null}
        onConfirm={() => discard.mutate()}
      />
    </AvoidKeyboard>
  );
}

/** One day of the draft: "Day 1" and its line ("Fri 6 Nov · the drive up · 9 photos"), then its first photos and how many more there are. */
function DayStrip({ day, onPress }: { day: JourneyDraftDay; onPress?: () => void }) {
  const { colors } = useTheme();
  const says = words.together.tell;
  const items = (day.items ?? []).filter((item) => !item.dropped);
  const tiles = items.length > STRIP ? items.slice(0, STRIP - 1) : items;
  const more = items.length - tiles.length;
  const name = says.day(day.number ?? 1);
  const line = words.common.join([day.day ? formatWeekdayPast(day.day) : null, day.line, says.counts(day.photos ?? 0, day.clips ?? 0)]);
  return (
    <Tap accessibilityRole="button" accessibilityLabel={says.daySpoken(name, line)} disabled={!onPress} onPress={onPress} scaleTo={0.99} style={{ marginTop: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, paddingBottom: 7, paddingHorizontal: layout.rowGutter }}>
        <Txt variant="subheading">{name}</Txt>
        <Txt variant="footnote" color="muted" numberOfLines={2} style={{ flex: 1 }}>
          {line}
        </Txt>
      </View>
      <View style={{ flexDirection: 'row', gap: 4, paddingHorizontal: layout.barGutter }}>
        {Array.from({ length: STRIP }, (_, index) => {
          const item = tiles[index];
          if (item) return <Photo key={item.itemId ?? index} uri={item.thumbUrl} radius="tile" style={{ flex: 1, aspectRatio: 1 }} />;
          if (index === tiles.length && more > 0) {
            return (
              <View key="more" style={{ flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: radius.tile, backgroundColor: colors.fill }}>
                <Txt variant="callout" weight={800}>
                  {says.more(more)}
                </Txt>
              </View>
            );
          }
          // A day with fewer photos keeps its tiles the same size.
          return <View key={index} style={{ flex: 1 }} />;
        })}
      </View>
    </Tap>
  );
}

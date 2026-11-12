import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Bell, Check, Copy, LayoutGrid, type LucideIcon, Mail, Mic, Share as ShareIcon, Sparkle } from 'lucide-react-native';
import { type ReactNode, useEffect, useState } from 'react';
import { Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useCache } from '@/api/cache';
import { messageFor } from '@/api/fetcher';
import { type CodesGo, getGetJotWaysQueryKey, saveJotWays, type TimedAs, useGetChecklists, useGetJotWays, type WaysRequest, type WaysResponse } from '@/api/generated/homeport';
import { useCircle } from '@/features/circles/current';
import { LaterSheet } from '@/features/jot/LaterSheet';
import { ensurePinnedNote, turnOffPinnedNote, turnOnPinnedNote } from '@/features/jot/pinned/service';
import { pushSupport } from '@/features/notifications/support';
import { PageProblem } from '@/features/states/PageProblem';
import { loadState } from '@/lib/loading';
import { copyText } from '@/lib/share';
import { layout, radius, useTheme } from '@/theme';
import { AppBar } from '@/ui/AppBar';
import { GroupLabel } from '@/ui/Heading';
import { Loading } from '@/ui/Loading';
import { Tap } from '@/ui/Motion';
import { Row, RowGroup } from '@/ui/Rows';
import { Sheet, SheetRow } from '@/ui/Sheet';
import { ListSkeleton } from '@/ui/Skeleton';
import { Toggle } from '@/ui/Toggle';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

/**
 * 14.8 Every way in: one place to switch the ways on, and to say where a jot goes when it isn't obvious.
 * The switches and the choices are the person's own and are saved with `saveJotWays`. A way that needs the
 * phone build, or a service that isn't connected, says so when it is pressed; each row also leads to the
 * screen that shows it.
 */
export default function Ways() {
  const { colors } = useTheme();
  const circle = useCircle();
  const asked = useGetJotWays(circle.id);
  const load = loadState(asked);
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar title={words.jot.ways.title} />
      {load.error ? <PageProblem error={load.error} onRetry={load.retry} retrying={load.retrying} inset={false} /> : !asked.data ? load.offline ? <Loading offline /> : <ListSkeleton count={6} /> : <Loaded ways={asked.data} />}
    </SafeAreaView>
  );
}

type Choosing = 'buy' | 'timed' | 'codes' | null;

function Loaded({ ways }: { ways: WaysResponse }) {
  const { colors } = useTheme();
  const router = useRouter();
  const circle = useCircle();
  const client = useQueryClient();
  const cache = useCache();
  const support = pushSupport();
  /** The sentence under the switches: what the last one pressed needs before it does anything on this phone. */
  const [said, setSaid] = useState<string | null>(null);
  const [later, setLater] = useState<{ title: string; body: string } | null>(null);
  const [choosing, setChoosing] = useState<Choosing>(null);
  const [copied, setCopied] = useState(false);
  const lists = useGetChecklists(circle.id, { limit: 50 }, { query: { enabled: choosing === 'buy' } });

  // The account says the note is on and this phone hasn't got it yet (a new phone): it goes up, without asking anything.
  useEffect(() => {
    if (ways.pinnedNote) void ensurePinnedNote({ circleId: circle.id, circleName: circle.name });
  }, [ways.pinnedNote, circle.id, circle.name]);

  const save = useMutation({
    mutationFn: (change: WaysRequest) => saveJotWays(circle.id, change),
    // A switch moves at once; the API's answer is what stays.
    onMutate: (change) => {
      const { buyListId, useCirclesList, ...shown } = change;
      client.setQueryData<WaysResponse>(getGetJotWaysQueryKey(circle.id), (old) => (old ? { ...old, ...shown } : old));
    },
    onSuccess: (saved) => void cache.jotWaysSaved(circle.id, saved),
    onError: () => void client.invalidateQueries({ queryKey: getGetJotWaysQueryKey(circle.id) }),
  });

  /** The pinned note is the one switch that also does something on this phone, where it can. */
  const pin = async (next: boolean) => {
    save.mutate({ pinnedNote: next });
    if (!next) {
      setSaid(null);
      await turnOffPinnedNote();
      return;
    }
    const answer = await turnOnPinnedNote({ circleId: circle.id, circleName: circle.name });
    setSaid(answer === 'unavailable' ? words.jot.pinned.where[support === 'expoGo' ? 'expoGo' : 'browser'] : answer === 'blocked' ? words.jot.pinned.where.blocked : words.jot.pinned.where[Platform.OS === 'ios' ? 'ios' : 'android']);
  };
  const flip = (way: 'voice' | 'share', next: boolean) => {
    save.mutate({ [way]: next });
    setSaid(next ? words.jot.ways.later[way] : null);
  };
  const copy = async () => {
    if (!ways.forwardAddress) return setLater(words.jot.ways.later.email);
    setCopied(await copyText(ways.forwardAddress));
  };
  const choose = (change: WaysRequest) => {
    save.mutate(change);
    setChoosing(null);
  };
  const tick = (on: boolean): ReactNode => (on ? <Check size={18} color={colors.ok} strokeWidth={2.6} /> : null);

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
      <Txt variant="lead" color="muted" style={{ marginHorizontal: layout.rowGutter }}>
        {words.jot.ways.lead}
      </Txt>
      <View style={{ height: 16 }} />
      <RowGroup>
        <Way first icon={Bell} label={words.jot.ways.pinned.label} note={words.jot.ways.pinned.note} onOpen={() => router.push('/jot/pinned')}>
          <Toggle label={words.jot.ways.pinned.label} value={ways.pinnedNote} onChange={(next) => void pin(next)} />
        </Way>
        <Way icon={LayoutGrid} label={words.jot.ways.widgets.label} note={words.jot.ways.widgets.note} onOpen={() => router.push('/jot/widgets')}>
          <Txt variant="callout" color="muted">
            {words.jot.ways.widgets.value}
          </Txt>
        </Way>
        <Way icon={Mic} label={words.jot.ways.voice.label} note={words.jot.ways.voice.note} onOpen={() => router.push('/jot/voice')}>
          <Toggle label={words.jot.ways.voice.label} value={ways.voice} onChange={(next) => flip('voice', next)} />
        </Way>
        <Way icon={Sparkle} label={words.jot.ways.button.label} note={words.jot.ways.button.note} spoken={words.common.spoken([words.jot.ways.button.label, words.jot.ways.button.value])} onOpen={() => setLater(words.jot.ways.later.button)}>
          <Txt variant="callout" color="muted">
            {words.jot.ways.button.value}
          </Txt>
        </Way>
        <Way icon={ShareIcon} label={words.jot.ways.share.label} note={words.jot.ways.share.note} onOpen={() => router.push('/jot/share')}>
          <Toggle label={words.jot.ways.share.label} value={ways.share} onChange={(next) => flip('share', next)} />
        </Way>
        <Way icon={Mail} label={words.jot.ways.email.label} note={copied ? words.jot.ways.email.copied : (ways.forwardAddress ?? words.jot.ways.email.notYet)} spoken={words.common.spoken([words.jot.ways.email.label, ways.forwardAddress ?? words.jot.ways.email.notYet])} onOpen={() => setLater(words.jot.ways.later.email)}>
          <Tap accessibilityRole="button" accessibilityLabel={words.jot.ways.email.copy} hitSlop={12} onPress={() => void copy()}>
            <Copy size={18} color={colors.muted} />
          </Tap>
        </Way>
      </RowGroup>
      {said || save.isError ? (
        <Txt variant="footnote" color={save.isError ? 'danger' : 'muted'} accessibilityLiveRegion="polite" style={{ marginTop: 12, marginHorizontal: layout.gutter }}>
          {save.isError ? messageFor(save.error) : said}
        </Txt>
      ) : null}

      <GroupLabel style={{ marginHorizontal: layout.gutter }}>{words.jot.ways.whereTitle}</GroupLabel>
      <RowGroup>
        <Row first label={words.jot.ways.buy} value={ways.buyList.title} onPress={() => setChoosing('buy')} />
        <Row label={words.jot.ways.timed} value={words.jot.ways.timedAs[ways.timedAs]} onPress={() => setChoosing('timed')} />
        <Row label={words.jot.ways.rest} value={words.jot.ways.restValue} onPress={() => setLater(words.jot.ways.later.rest)} />
        <Row label={words.jot.ways.codes} value={words.jot.ways.codesGo[ways.codes]} onPress={() => setChoosing('codes')} />
      </RowGroup>

      <LaterSheet said={later} onClose={() => setLater(null)} />
      <Sheet visible={choosing === 'timed'} onClose={() => setChoosing(null)} title={words.jot.ways.timed}>
        {(['reminder', 'event'] as const satisfies readonly TimedAs[]).map((as, index) => (
          <SheetRow key={as} first={index === 0} label={words.jot.ways.timedAs[as]} note={words.jot.ways.timedNote[as]} trailing={tick(ways.timedAs === as)} onPress={() => choose({ timedAs: as })} />
        ))}
      </Sheet>
      <Sheet visible={choosing === 'codes'} onClose={() => setChoosing(null)} title={words.jot.ways.codes}>
        {(['ask', 'vault', 'note'] as const satisfies readonly CodesGo[]).map((go, index) => (
          <SheetRow key={go} first={index === 0} label={words.jot.ways.codesGo[go]} note={words.jot.ways.codesNote[go]} trailing={tick(ways.codes === go)} onPress={() => choose({ codes: go })} />
        ))}
      </Sheet>
      <Sheet visible={choosing === 'buy'} onClose={() => setChoosing(null)} title={words.jot.ways.buySheet.title}>
        <SheetRow first label={words.jot.ways.buySheet.circles} note={words.jot.ways.buySheet.circlesNote} trailing={tick(!ways.buyListIsYours)} onPress={() => choose({ useCirclesList: true })} />
        {(lists.data?.items ?? [])
          .filter((list) => list.id)
          .map((list) => (
            <SheetRow key={list.id} label={list.title ?? ''} trailing={tick(ways.buyListIsYours && ways.buyList.id === list.id)} onPress={() => choose({ buyListId: list.id })} />
          ))}
      </Sheet>
    </ScrollView>
  );
}

type WayProps = {
  icon: LucideIcon;
  label: string;
  note: string;
  /** What a screen reader says for the part that opens. */
  spoken?: string;
  first?: boolean;
  /** Pressing the row's words: the screen that shows this way, or the sentence about what it needs. */
  onOpen: () => void;
  /** What stands at the right: a switch, a value, a button. It is a control of its own, not part of what opens. */
  children: ReactNode;
};

/** One way in: an icon, its name and a line about it, and at the right its switch or its value. */
function Way({ icon: Icon, label, note, spoken, first, onOpen, children }: WayProps) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 54, paddingRight: 16, borderTopWidth: first ? 0 : 1, borderTopColor: colors.line }}>
      <Tap accessibilityRole="button" accessibilityLabel={spoken ?? words.jot.ways.open(label)} onPress={onOpen} scaleTo={0.99} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingLeft: 16 }}>
        <View style={{ width: 34, height: 34, borderRadius: radius.tile, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.fill }}>
          <Icon size={18} color={colors.text} />
        </View>
        <View style={{ flex: 1, gap: 1 }}>
          <Txt variant="item" weight={600}>
            {label}
          </Txt>
          <Txt variant="footnote" color="muted">
            {note}
          </Txt>
        </View>
      </Tap>
      {children}
    </View>
  );
}

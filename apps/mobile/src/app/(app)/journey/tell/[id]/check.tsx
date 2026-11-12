import { useMutation } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Check, House, Images, Lock, MapPin, Route, TriangleAlert, User, Video } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useCache } from '@/api/cache';
import { messageFor } from '@/api/fetcher';
import { changeJourneyDraftCheck, type JourneyDraftResponse, type JourneyJobResponse, type JourneyVisibility, type LeavingCheckItem, type LeavingCheckRequest, type LeavingCheckResponse, postJourneyDraft, useCheckJourneyDraft, useGetJourneyDraft } from '@/api/generated/homeport';
import { useJourneyJob } from '@/features/journeyLink/jobs';
import { useOpenJourney } from '@/features/journeyLink/open';
import { JobProgress } from '@/features/journeyLink/parts';
import { useToast } from '@/features/library/Toast';
import { NotFound } from '@/features/states/NotFound';
import { PageProblem } from '@/features/states/PageProblem';
import { looksLikeId } from '@/features/things/open';
import { newClientId } from '@/lib/ids';
import { loadState } from '@/lib/loading';
import { layout, radius, useTheme, withAlpha } from '@/theme';
import { AppBar } from '@/ui/AppBar';
import { Button } from '@/ui/Button';
import { GroupLabel, Heading, Lead } from '@/ui/Heading';
import { Loading } from '@/ui/Loading';
import { Tap } from '@/ui/Motion';
import { NoteBox } from '@/ui/NoteBox';
import { Photo } from '@/ui/Photo';
import { Row, RowGroup } from '@/ui/Rows';
import { Segmented } from '@/ui/Segmented';
import { Sheet } from '@/ui/Sheet';
import { Sk } from '@/ui/Skeleton';
import { Toggle } from '@/ui/Toggle';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

/**
 * 10.6 Before it leaves home: the one screen between what a circle keeps and a journey other people can
 * read. Three switches (children, the exact spot, photos taken at home), all on to begin with; what can
 * never go; what the journey starts as in Journey; and every photo one by one, to send one after all or to
 * see why it stays. Then it is sent, with its progress. Until the button is pressed nothing has left.
 */
export default function BeforeItLeaves() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const isThing = looksLikeId(id);
  const asked = useCheckJourneyDraft(id, { query: { enabled: isThing } });
  const draftAsked = useGetJourneyDraft(id, { query: { enabled: isThing } });
  const load = loadState(asked, draftAsked);
  const check = asked.data;
  const draft = draftAsked.data;
  if (!isThing) return <NotFound />;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar title={words.together.tell.title} />
      {load.error ? (
        <PageProblem error={load.error} onRetry={load.retry} retrying={load.retrying} inset={false} />
      ) : !check || !draft ? (
        load.offline ? (
          <Loading offline />
        ) : (
          <View accessibilityLabel={words.states.loading} style={{ gap: 14, paddingTop: 6, paddingHorizontal: layout.rowGutter }}>
            <Sk width="85%" height={34} />
            <Sk width="70%" height={16} />
            <Sk height={250} radius="card" />
            <Sk height={46} radius="field" />
          </View>
        )
      ) : (
        <Loaded check={check} draft={draft} />
      )}
    </SafeAreaView>
  );
}

function Loaded({ check, draft }: { check: LeavingCheckResponse; draft: JourneyDraftResponse }) {
  const cache = useCache();
  const says = words.together.check;
  const [started, setStarted] = useState<JourneyJobResponse | null>(null);
  const [looking, setLooking] = useState(false);
  const clientId = useRef(newClientId());

  const change = useMutation({
    mutationFn: (request: LeavingCheckRequest) => changeJourneyDraftCheck(check.draftId, request),
    onSuccess: (changed) => cache.journeyDraftChecked(changed),
  });
  const send = useMutation({
    mutationFn: () => postJourneyDraft(check.draftId, { clientId: clientId.current }),
    onSuccess: (job) => {
      clientId.current = newClientId();
      setStarted(job);
    },
  });
  // A draft that is on its way already (the screen was opened again) shows how far it is.
  const sending = started ?? (draft.status === 'posting' || draft.status === 'posted' ? draft.job : null);
  if (sending || draft.status === 'posted') return <Sending started={sending} draft={draft} onAgain={() => setStarted(null)} />;

  const going = check.photosGoing + check.clipsGoing;
  const staying = check.items.filter((item) => !item.goes).length;
  // While a switch is on its way, it already shows where it is going.
  const sent = change.isPending ? change.variables : undefined;
  const on = { children: sent?.leaveOutChildren ?? check.children.on ?? false, town: sent?.townOnly ?? check.town.on ?? false, home: sent?.skipHome ?? check.home.on ?? false };
  const visibility = sent?.visibility ?? check.visibility;

  return (
    <View style={{ flex: 1 }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 16 }}>
        <Heading style={{ marginTop: 6, marginHorizontal: layout.rowGutter }}>{says.heading}</Heading>
        <Lead style={{ marginHorizontal: layout.rowGutter }}>{says.lead}</Lead>
        <View style={{ marginTop: 16 }}>
          <RowGroup>
            <Row
              first
              icon={(c) => <User size={18} color={c} />}
              label={says.children.title(check.children.names ?? [])}
              note={says.children.note(check.children.count ?? 0, check.children.of ?? 0)}
              trailing={<Toggle label={says.children.title(check.children.names ?? [])} value={on.children} onChange={(next) => change.mutate({ leaveOutChildren: next })} />}
            />
            <Row icon={(c) => <MapPin size={18} color={c} />} label={says.town.title} note={says.town.note(check.town.shows)} trailing={<Toggle label={says.town.title} value={on.town} onChange={(next) => change.mutate({ townOnly: next })} />} />
            <Row
              icon={(c) => <House size={18} color={c} />}
              label={says.home.title}
              note={check.home.homeKnown === false ? says.home.unknown : says.home.note(check.home.count ?? 0)}
              trailing={<Toggle label={says.home.title} value={on.home} onChange={(next) => change.mutate({ skipHome: next })} />}
            />
            <Row
              icon={(c) => <Lock size={18} color={c} />}
              label={says.never.title}
              note={says.never.note}
              trailing={
                // Not a choice: nothing but photos and videos can ever be in a draft.
                <View style={{ opacity: 0.45 }} pointerEvents="none">
                  <Toggle label={says.never.title} value={false} onChange={() => undefined} />
                </View>
              }
            />
          </RowGroup>
        </View>
        {change.isError ? (
          <Txt variant="caption" color="danger" accessibilityLiveRegion="polite" style={{ marginTop: 8, marginHorizontal: layout.gutter }}>
            {messageFor(change.error)}
          </Txt>
        ) : null}

        <GroupLabel style={{ marginHorizontal: layout.gutter }}>{words.together.visibility.label}</GroupLabel>
        <Segmented label={words.together.visibility.label} options={words.together.visibility.options} value={visibility} onChange={(next) => change.mutate({ visibility: next as JourneyVisibility })} style={{ marginTop: 2 }} />
        <Txt variant="footnote" color="muted" style={{ marginTop: 8, marginHorizontal: layout.gutter }}>
          {words.together.visibility.note[visibility]}
        </Txt>

        <View style={{ marginTop: 18 }}>
          <RowGroup>
            <Row first icon={(c) => <Images size={18} color={c} />} label={says.going.title(check.photosGoing, check.clipsGoing)} note={says.going.note(staying)} onPress={() => setLooking(true)} />
          </RowGroup>
        </View>
        <Txt variant="footnote" color="muted" style={{ marginTop: 8, marginHorizontal: layout.gutter }}>
          {says.tagged}
        </Txt>
        {check.flags.length ? (
          <NoteBox tone="warn" icon={(c) => <TriangleAlert size={20} color={c} />} title={says.flags.title} style={{ marginTop: 12, marginHorizontal: layout.barGutter }}>
            {check.flags.map((flag) => says.flags.line(flag.flag, flag.count ?? 0)).join('. ')}
          </NoteBox>
        ) : null}
        {check.clipsGoing > 0 || check.tooLong > 0 ? (
          <NoteBox icon={(c) => <Video size={20} color={c} />} style={{ marginTop: 12, marginHorizontal: layout.barGutter }}>
            {[check.tooLong > 0 ? says.tooLong(check.tooLong) : null, check.clipsGoing > 0 ? says.clipsAsTheyAre : null].filter(Boolean).join(' ')}
          </NoteBox>
        ) : null}
      </ScrollView>

      <View style={{ gap: 10, paddingTop: 12, paddingBottom: 12, paddingHorizontal: layout.rowGutter }}>
        {send.isError ? (
          <Txt variant="caption" color="danger" accessibilityLiveRegion="polite" center>
            {messageFor(send.error)}
          </Txt>
        ) : null}
        <Button label={says.create(check.photosGoing, check.clipsGoing)} size="lg" block icon={(c) => <Route size={19} color={c} strokeWidth={2.4} />} loading={send.isPending} disabled={going === 0 || change.isPending} onPress={() => send.mutate()} />
        <Txt variant="small" weight={500} color="muted" center>
          {going === 0 ? says.nothing : says.fine}
        </Txt>
      </View>

      <OneByOne visible={looking} onClose={() => setLooking(false)} items={check.items} busy={change.isPending} onChange={(request) => change.mutate(request)} />
    </View>
  );
}

/** While it goes to Journey: how far it is. Then that it is there, and the way to it. */
function Sending({ started, draft, onAgain }: { started: JourneyJobResponse | null; draft: JourneyDraftResponse; onAgain: () => void }) {
  const router = useRouter();
  const cache = useCache();
  const says = words.together.check;
  const { job } = useJourneyJob(started);
  const done = job ? job.status === 'done' : draft.status === 'posted';
  const { say, toast } = useToast(140);
  const openJourney = useOpenJourney(say);
  // Once, when it has arrived: the draft says which journey it became.
  const told = useRef(false);
  useEffect(() => {
    if (job?.status === 'done' && !told.current) {
      told.current = true;
      void cache.journeyDraftSent(draft.id);
    }
  }, [job?.status, cache, draft.id]);
  const close = async () => {
    // The draft's own screen, underneath, knows by now that it was sent, and lets go without asking.
    await cache.journeyDraftSent(draft.id).catch(() => undefined);
    // Out of the whole flow: past the draft, back to where it was started from.
    if (router.canDismiss()) router.dismiss(2);
    else router.replace('/');
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1, justifyContent: 'center', gap: 14 }}>
        {done ? (
          <View style={{ gap: 8, paddingHorizontal: 34 }}>
            <Txt variant="title" accessibilityRole="header" center>
              {says.sent.title}
            </Txt>
            <Txt variant="bodySmall" color="muted" center>
              {says.sent.body(words.together.visibility.name(draft.visibility))}
            </Txt>
          </View>
        ) : null}
        {job ? <JobProgress job={job} title={says.sending} onRetry={onAgain} /> : null}
      </View>
      {done ? (
        <View style={{ gap: 10, paddingTop: 12, paddingBottom: 12, paddingHorizontal: layout.rowGutter }}>
          <Button label={words.together.open.inJourney} size="lg" block icon={(c) => <Route size={19} color={c} strokeWidth={2.4} />} onPress={() => openJourney(draft.openUrl)} />
          <Button label={says.sent.close} size="lg" block variant="soft" onPress={() => void close()} />
        </View>
      ) : null}
      {toast}
    </View>
  );
}

/**
 * Every photo and clip of the draft, one by one: what goes, and what stays home with why. One that a switch
 * left out (a child, at home) goes after all when it is tapped, and is left to the switches when tapped again.
 */
function OneByOne({ visible, onClose, items, busy, onChange }: { visible: boolean; onClose: () => void; items: readonly LeavingCheckItem[]; busy: boolean; onChange: (request: LeavingCheckRequest) => void }) {
  const says = words.together.check.sheet;
  return (
    <Sheet visible={visible} onClose={onClose} title={says.title} subtitle={says.hint} tall>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: layout.barGutter - 2, paddingBottom: 16 }}>
        {items.map((item, index) => (
          <CheckTile key={item.itemId ?? index} item={item} busy={busy} onChange={onChange} />
        ))}
      </View>
    </Sheet>
  );
}

function CheckTile({ item, busy, onChange }: { item: LeavingCheckItem; busy: boolean; onChange: (request: LeavingCheckRequest) => void }) {
  const { colors } = useTheme();
  const says = words.together.check.sheet;
  const reasons = item.leftOut ?? [];
  // A switch's rule can be overruled for one photo; a dropped one, a file or a long clip can't.
  const canTurn = item.backOn || (reasons.length > 0 && reasons.every((reason) => reason === 'child' || reason === 'home'));
  const why = item.backOn ? says.backOn : reasons.length ? says.why(reasons[0]) : null;
  const id = item.itemId ?? '';
  return (
    <View style={{ width: '25%', padding: 2 }}>
      <Tap accessibilityRole={canTurn ? 'switch' : 'image'} accessibilityLabel={says.spoken(!!item.goes, why)} aria-checked={canTurn ? !!item.goes : undefined} disabled={!canTurn || busy} onPress={() => onChange(item.backOn ? { backOff: [id] } : { backOn: [id] })} scaleTo={0.95}>
        <Photo uri={item.thumbUrl} radius="tile" style={{ aspectRatio: 1, justifyContent: 'flex-end' }}>
          {item.goes ? null : <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: withAlpha(colors.bg, 0.72) }} />}
          {item.backOn ? (
            <View style={{ position: 'absolute', top: 6, right: 6, width: 20, height: 20, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent }}>
              <Check size={12} color={colors.onAccent} strokeWidth={3} />
            </View>
          ) : null}
          {why ? (
            <View style={{ margin: 4, paddingVertical: 2, paddingHorizontal: 6, alignSelf: 'flex-start', borderRadius: radius.chip, backgroundColor: colors.glassStrong }}>
              <Txt variant="micro" numberOfLines={1}>
                {why}
              </Txt>
            </View>
          ) : null}
        </Photo>
      </Tap>
    </View>
  );
}

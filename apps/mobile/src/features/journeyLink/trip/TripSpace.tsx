import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { BookOpen, CalendarDays, ChevronRight, Ellipsis, FolderOpen, Trash2, Wallet } from 'lucide-react-native';
import { type ReactNode, useRef, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useCache } from '@/api/cache';
import { messageFor } from '@/api/fetcher';
import { type FolderResponse, type JourneyVisibility, removeTrip, startTripJourney, type TripResponse, useGetTrip } from '@/api/generated/homeport';
import { useToast } from '@/features/library/Toast';
import { AudienceChip } from '@/features/sharing/AudienceChip';
import { PageProblem } from '@/features/states/PageProblem';
import { kindOf } from '@/features/things/kinds';
import { thingHref, useOpenThing } from '@/features/things/open';
import { formatDayFull, today } from '@/lib/dates';
import { newClientId } from '@/lib/ids';
import { loadState } from '@/lib/loading';
import { formatMoneyRound } from '@/lib/money';
import { firstName } from '@/lib/names';
import { layout, radius, useTheme } from '@/theme';
import { AppBar } from '@/ui/AppBar';
import { JourneyMark } from '@/ui/Brand';
import { Button } from '@/ui/Button';
import { ConfirmSheet } from '@/ui/ConfirmSheet';
import { GroupLabel } from '@/ui/Heading';
import { Loading } from '@/ui/Loading';
import { NoteBox } from '@/ui/NoteBox';
import { RoundButton } from '@/ui/RoundButton';
import { Row, RowGroup } from '@/ui/Rows';
import { Segmented } from '@/ui/Segmented';
import { Sheet, SheetRow } from '@/ui/Sheet';
import { Sk } from '@/ui/Skeleton';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

import { useOpenJourney } from '../open';
import { becomesTitle, stageLines, tripDates } from './dates';
import { TripDatesSheet } from './TripDatesSheet';

type Asking = 'menu' | 'draft' | 'dates' | 'stop' | null;

/**
 * 10.7 A trip, start to finish: a folder of Notes that was given dates. One space holds three stages. It is
 * planned here (what is filed in it: the day-by-day page, the packing list, the budget, the passports); on
 * its first day it becomes a journey that is told in Journey; and when it is over it comes back as a book,
 * with what it cost next to what was planned. `/folder/<id>` draws this for a folder that is a trip;
 * "Open as a folder" in its menu shows the same folder the way Notes does.
 */
export function TripSpace({ folder }: { folder: FolderResponse }) {
  const { colors } = useTheme();
  const asked = useGetTrip(folder.id, { day: today() });
  const load = loadState(asked);
  const trip = asked.data;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      {load.error ? (
        <>
          <AppBar />
          <PageProblem error={load.error} onRetry={load.retry} retrying={load.retrying} inset={false} />
        </>
      ) : !trip ? (
        <>
          <AppBar title={folder.title} />
          {load.offline ? (
            <Loading offline />
          ) : (
            <View accessibilityLabel={words.states.loading} style={{ gap: 14, paddingTop: 4, paddingHorizontal: layout.barGutter }}>
              <Sk height={58} radius="field" />
              <Sk width={120} height={12} style={{ marginTop: 10 }} />
              <Sk height={220} radius="card" />
              <Sk height={130} radius="cardLarge" />
            </View>
          )}
        </>
      ) : (
        <Loaded trip={trip} folder={folder} refreshing={asked.isRefetching} onRefresh={() => void asked.refetch()} />
      )}
    </SafeAreaView>
  );
}

function Loaded({ trip, folder, refreshing, onRefresh }: { trip: TripResponse; folder: FolderResponse; refreshing: boolean; onRefresh: () => void }) {
  const { colors } = useTheme();
  const router = useRouter();
  const cache = useCache();
  const open = useOpenThing();
  const says = words.together.trip;
  const [asking, setAsking] = useState<Asking>(null);
  const { say, toast } = useToast(48);
  const openJourney = useOpenJourney(say);
  const lines = stageLines(trip.stage, trip.startsOn, trip.endsOn);
  const journey = trip.journey;
  const told = journey?.journey;
  const close = () => setAsking(null);

  const stop = useMutation({
    mutationFn: () => removeTrip(trip.id),
    onSuccess: async () => {
      close();
      await cache.tripRemoved(trip);
    },
  });

  return (
    <View style={{ flex: 1 }}>
      <AppBar
        title={trip.title.trim() || words.things.untitled}
        subtitle={says.sub(trip.space)}
        trailing={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <AudienceChip thing={folder} />
            <RoundButton label={words.things.more} icon={(c) => <Ellipsis size={20} color={c} />} onPress={() => setAsking('menu')} />
          </View>
        }
      />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.muted} />}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2, marginHorizontal: layout.barGutter }}>
          <Stage name={says.stages.plan} line={lines.plan} on={trip.stage === 'plan'} />
          <ChevronRight size={14} color={colors.muted} />
          <Stage name={says.stages.go} line={lines.go} on={trip.stage === 'go'} />
          <ChevronRight size={14} color={colors.muted} />
          <Stage name={says.stages.keep} line={lines.keep} on={trip.stage === 'keep'} />
        </View>

        <GroupLabel style={{ marginHorizontal: layout.gutter }}>{says.filed[trip.stage]}</GroupLabel>
        {trip.items.length ? (
          <RowGroup>
            {trip.items.map((item, index) => {
              const Icon = kindOf(item.kind).icon;
              return <Row key={item.id ?? index} first={index === 0} icon={(c) => <Icon size={18} color={c} />} label={item.title?.trim() || words.things.untitled} note={item.glance ?? undefined} onPress={() => open(item)} />;
            })}
          </RowGroup>
        ) : (
          <Txt variant="callout" color="muted" style={{ marginHorizontal: layout.gutter }}>
            {says.empty}
          </Txt>
        )}

        {journey ? (
          // It became a journey: how it stands there, and the way to it.
          <GoBox title={trip.stage === 'keep' || told?.status === 'completed' ? says.told.over : says.told.title} body={says.told.line(told?.title ?? trip.title, told?.progressLabel)}>
            <Button label={words.together.open.inJourney} size="sm" onPress={() => openJourney(journey.openUrl)} style={{ marginTop: 10 }} />
          </GoBox>
        ) : trip.becomes ? (
          <GoBox title={becomesTitle(trip.becomes.on ?? trip.startsOn)} body={trip.becomes.note ?? says.becomes.body((trip.becomes.coAuthors ?? []).map((person) => firstName(person.name)))}>
            <Button label={says.becomes.see} size="sm" onPress={() => setAsking('draft')} style={{ marginTop: 10 }} />
          </GoBox>
        ) : null}

        {trip.book?.pageId ? (
          <View style={{ marginTop: 16 }}>
            <RowGroup>
              <Row first icon={(c) => <BookOpen size={18} color={c} />} label={says.book.title} note={words.together.kept.by(trip.book.byline)} onPress={() => router.push(thingHref({ kind: 'page', id: trip.book?.pageId }))} />
              {trip.money?.paidCents != null ? (
                <Row
                  icon={(c) => <Wallet size={18} color={c} />}
                  label={says.cost.title}
                  note={trip.money.plannedCents != null ? says.cost.line(formatMoneyRound(trip.money.paidCents, trip.money.currency), formatMoneyRound(trip.money.plannedCents, trip.money.currency)) : says.cost.paidOnly(formatMoneyRound(trip.money.paidCents, trip.money.currency))}
                  onPress={() => open({ kind: 'sheet', id: trip.money?.sheetId })}
                />
              ) : null}
            </RowGroup>
          </View>
        ) : journey && trip.stage === 'keep' ? (
          // Over, and not kept yet: the journey comes home as the trip's book.
          <>
            <NoteBox icon={(c) => <BookOpen size={20} color={c} />} title={says.bringHome.title} style={{ marginTop: 16, marginHorizontal: layout.barGutter }}>
              {says.bringHome.body}
            </NoteBox>
            <View style={{ marginTop: 10, marginHorizontal: layout.barGutter }}>
              <Button label={says.bringHome.button} block onPress={() => router.push({ pathname: '/journey/keep/[journeyId]', params: { journeyId: journey.journeyId ?? '', trip: trip.id } })} />
            </View>
          </>
        ) : (
          <NoteBox icon={(c) => <BookOpen size={20} color={c} />} title={says.book.later.title} style={{ marginTop: 16, marginHorizontal: layout.barGutter }}>
            {says.book.later.body}
          </NoteBox>
        )}
      </ScrollView>
      {toast}

      <Sheet visible={asking === 'menu'} onClose={close} title={trip.title.trim() || words.things.untitled}>
        {trip.canEdit ? <SheetRow first icon={(c) => <CalendarDays size={22} color={c} />} label={says.menu.dates} onPress={() => setAsking('dates')} /> : null}
        <SheetRow
          first={!trip.canEdit}
          icon={(c) => <FolderOpen size={22} color={c} />}
          label={says.menu.asFolder}
          note={says.menu.asFolderNote}
          onPress={() => {
            close();
            router.push({ pathname: '/folder/[id]', params: { id: trip.id, as: 'folder' } });
          }}
        />
        {trip.canEdit ? <SheetRow danger icon={(c) => <Trash2 size={22} color={c} />} label={says.menu.stop} onPress={() => setAsking('stop')} /> : null}
      </Sheet>
      <TripDatesSheet visible={asking === 'dates'} onClose={close} folder={trip} startsOn={trip.startsOn} endsOn={trip.endsOn} />
      <ConfirmSheet
        visible={asking === 'stop'}
        onClose={close}
        title={says.stopAsk.title(trip.title.trim() || words.things.untitled)}
        body={says.stopAsk.body}
        confirm={says.stopAsk.confirm}
        busy={stop.isPending}
        problem={stop.isError ? messageFor(stop.error) : null}
        onConfirm={() => stop.mutate()}
      />
      <DraftSheet visible={asking === 'draft'} onClose={close} trip={trip} />
    </View>
  );
}

/** One of the three stages: its name and what stands under it. The one the trip is in is filled in. */
function Stage({ name, line, on }: { name: string; line: string; on: boolean }) {
  const { colors } = useTheme();
  return (
    <View accessible accessibilityLabel={words.together.trip.stageSpoken(name, line)} style={{ flex: 1, alignItems: 'center', gap: 2, paddingVertical: 10, paddingHorizontal: 6, borderRadius: radius.field, backgroundColor: on ? colors.text : colors.fill }}>
      <Txt variant="callout" weight={800} numberOfLines={1} style={{ color: on ? colors.bg : colors.text }}>
        {name}
      </Txt>
      <Txt variant="tiny" weight={600} numberOfLines={1} style={{ color: on ? colors.bg : colors.muted, opacity: on ? 0.7 : 1 }}>
        {line}
      </Txt>
    </View>
  );
}

/** The box about the journey a trip becomes, or became: Journey's mark, a bold line, a sentence and a button. */
function GoBox({ title, body, children }: { title: string; body: string; children?: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginTop: 14, marginHorizontal: layout.barGutter, padding: 14, borderRadius: radius.cardLarge, backgroundColor: colors.accentSoft }}>
      <JourneyMark size={40} />
      <View style={{ flex: 1 }}>
        <Txt variant="lead" weight={800}>
          {title}
        </Txt>
        <Txt variant="caption" weight={500} color="muted" style={{ marginTop: 2 }}>
          {body}
        </Txt>
        {children}
      </View>
    </View>
  );
}

/**
 * "See the draft": what Journey would be told (the title and the dates), what stays here (the route), who
 * would write in it, and what it starts as. From here the trip becomes a journey, once: on its first day,
 * or earlier when the person says so.
 */
function DraftSheet({ visible, onClose, trip }: { visible: boolean; onClose: () => void; trip: TripResponse }) {
  const cache = useCache();
  const says = words.together.trip.draft;
  const becomes = trip.becomes;
  const [visibility, setVisibility] = useState<JourneyVisibility>('private');
  const clientId = useRef(newClientId());
  const start = useMutation({
    mutationFn: () => startTripJourney(trip.id, { clientId: clientId.current, visibility }, { day: today() }),
    onSuccess: async (started) => {
      clientId.current = newClientId();
      await cache.tripSaved(started);
      onClose();
    },
  });
  const early = trip.stage === 'plan';
  const coAuthors = (becomes?.coAuthors ?? []).map((person) => firstName(person.name));
  return (
    <Sheet visible={visible && !!becomes} onClose={onClose} title={says.title} subtitle={says.lead}>
      <RowGroup>
        <Row first label={says.name} value={becomes?.title} />
        <Row label={says.dates} value={tripDates(trip.startsOn, trip.endsOn)} />
        {becomes?.route?.length ? <Row label={says.route} note={words.common.join([becomes.route.join(', '), says.routeNote])} /> : null}
        {coAuthors.length ? <Row label={says.coAuthors} value={coAuthors.join(', ')} /> : null}
      </RowGroup>
      <GroupLabel style={{ marginHorizontal: layout.gutter }}>{words.together.visibility.label}</GroupLabel>
      <Segmented label={words.together.visibility.label} options={words.together.visibility.options} value={visibility} onChange={(next) => setVisibility(next as JourneyVisibility)} />
      <Txt variant="footnote" color="muted" style={{ marginTop: 8, marginHorizontal: layout.gutter }}>
        {words.together.visibility.note[visibility]}
      </Txt>
      <Txt variant="footnote" color="muted" style={{ marginTop: 12, marginHorizontal: layout.gutter }}>
        {becomes?.note ?? (early ? says.early(formatDayFull(trip.startsOn)) : says.once)}
      </Txt>
      {start.isError ? (
        <Txt variant="caption" color="danger" accessibilityLiveRegion="polite" style={{ marginTop: 8, marginHorizontal: layout.gutter }}>
          {messageFor(start.error)}
        </Txt>
      ) : null}
      <View style={{ paddingTop: 14, paddingHorizontal: layout.rowGutter }}>
        <Button label={early ? says.startEarly : says.start} size="lg" block variant={early ? 'line' : 'primary'} disabled={!becomes?.canBecome} loading={start.isPending} onPress={() => start.mutate()} />
      </View>
    </Sheet>
  );
}

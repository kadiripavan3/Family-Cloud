import { useMutation } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Bell, Ellipsis, ImageOff, ImagePlus, MapPin, Pencil, Repeat, Share, Trash2, Users } from 'lucide-react-native';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCache } from '@/api/cache';
import { messageFor } from '@/api/fetcher';
import { type Answer, answerEvent, changeEvent, deleteThing, type EventResponse, useGetEvent } from '@/api/generated/homeport';
import { uploadPhoto } from '@/api/upload';
import { useLeave } from '@/features/navigation/useLeave';
import { EventChangeSheet } from '@/features/plan/EventChangeSheet';
import { whenLine } from '@/features/plan/eventDraft';
import { EventLinks } from '@/features/plan/EventLinks';
import { Faces } from '@/features/plan/Faces';
import { GuestsSheet } from '@/features/plan/GuestsSheet';
import { useNotice } from '@/features/plan/Notice';
import { pickCover } from '@/features/plan/pickCover';
import { AudienceChip } from '@/features/sharing/AudienceChip';
import { PageProblem } from '@/features/states/PageProblem';
import { formatWeekdayDay, today } from '@/lib/dates';
import { loadState } from '@/lib/loading';
import { shareText } from '@/lib/share';
import { layout, radius, useTheme, withAlpha } from '@/theme';
import { ConfirmSheet } from '@/ui/ConfirmSheet';
import { Eyebrow } from '@/ui/Eyebrow';
import { GroupLabel } from '@/ui/Heading';
import { LightStatusBar } from '@/ui/LightStatusBar';
import { Loading } from '@/ui/Loading';
import { Tap } from '@/ui/Motion';
import { Photo } from '@/ui/Photo';
import { rich } from '@/ui/rich';
import { RoundButton } from '@/ui/RoundButton';
import { Segmented } from '@/ui/Segmented';
import { Sheet, SheetRow } from '@/ui/Sheet';
import { Sk } from '@/ui/Skeleton';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

const ANSWERS: readonly Answer[] = ['going', 'maybe', 'cant'];
/** What the row of three shows chosen for someone who hasn't answered: none of them. */
const UNANSWERED = 'none' as const;
/** How tall the top of the page is: with a picture, and without one (only room for the round buttons). */
const HERO = 210;
const BARE = 74;

/**
 * 7.3 An event: its picture, when and where, who sees it, your own answer, who is coming, and what it
 * gathers (a to-do list, a budget, an album). The three dots change it, change who is coming, give it a
 * picture and delete it; Share hands its line to a message.
 */
export default function EventPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const leave = useLeave();
  const asked = useGetEvent(id, { day: today() });
  const load = loadState(asked);
  const event = asked.data;

  if (!event || load.error) {
    // Not here yet, or not at all: the way back stays, on the page's own colours.
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        {load.error ? (
          <View style={{ flex: 1, paddingTop: insets.top + 56 }}>
            <PageProblem error={load.error} onRetry={load.retry} retrying={load.retrying} />
          </View>
        ) : load.offline ? (
          <Loading offline />
        ) : (
          <View accessibilityLabel={words.states.loading} style={{ flex: 1 }}>
            <Sk height={HERO} radius="none" />
            <View style={{ flex: 1, gap: 12, marginTop: -26, paddingTop: 24, paddingHorizontal: layout.rowGutter, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, backgroundColor: colors.bg }}>
              <Sk width="45%" height={12} radius="chip" />
              <Sk width="80%" height={28} />
              <Sk width="35%" height={14} radius="chip" />
              <Sk height={46} radius="field" />
              <Sk height={160} radius="card" style={{ marginTop: 14 }} />
            </View>
          </View>
        )}
        <View style={{ position: 'absolute', top: insets.top + 8, left: layout.barGutter }}>
          <RoundButton label={words.common.back} onPress={leave} icon={(c) => <ArrowLeft size={20} color={c} />} />
        </View>
      </View>
    );
  }
  return <Loaded event={event} />;
}

function Loaded({ event }: { event: EventResponse }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const leave = useLeave();
  const cache = useCache();
  const says = words.plan.event;
  const [say, notice] = useNotice();
  const [sheet, setSheet] = useState<'menu' | 'change' | 'guests' | 'delete' | null>(null);
  const close = () => setSheet(null);

  const answer = useMutation({
    mutationFn: (next: Answer) => answerEvent(event.id, { answer: next }),
    onSuccess: (saved) => cache.eventSaved(saved),
  });
  const remove = useMutation({
    mutationFn: () => deleteThing(event.id),
    onSuccess: () => {
      close();
      leave();
      void cache.thingDeleted(event);
    },
  });
  const cover = useMutation({
    mutationFn: async (take: 'off' | 'pick') => {
      if (take === 'off') return changeEvent(event.id, { removeCover: true });
      const photo = await pickCover().catch(() => {
        throw new Error(says.photoProblem);
      });
      return photo ? changeEvent(event.id, { coverMediaId: await uploadPhoto(photo) }) : null;
    },
    onSuccess: (saved) => (saved ? cache.eventSaved(saved) : undefined),
    onError: (error) => say(error instanceof Error && error.message === says.photoProblem ? says.photoProblem : messageFor(error)),
  });

  const when = whenLine(event.day, event.time, event.endTime, event.endDay);
  const title = event.title.trim() || words.things.untitled;
  const share = async () => {
    const how = await shareText(says.shared([title, when, event.place]));
    if (how !== 'shared') say(how === 'copied' ? says.copied : says.notCopied);
  };
  const withPhoto = !!event.coverUrl;
  // The people whose faces are known first; the number says how many there are in all.
  const faces = [...event.guests].sort((a, b) => Number(!!b.avatarUrl) - Number(!!a.avatarUrl)).filter((guest) => guest.answer !== 'cant');
  const facts = [
    event.repeat ? { key: 'repeat', icon: Repeat, text: says.repeats(event.repeat.label, event.nextDay && event.nextDay !== event.day ? formatWeekdayDay(event.nextDay) : null) } : null,
    event.remindLabel ? { key: 'remind', icon: Bell, text: says.reminds(event.remindLabel) } : null,
  ].flatMap((fact) => (fact ? [fact] : []));

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {withPhoto ? <LightStatusBar /> : null}
      <ScrollView contentContainerStyle={{ paddingBottom: 40 + insets.bottom }} showsVerticalScrollIndicator={false}>
        {withPhoto ? (
          <Photo uri={event.coverUrl} radius="none" style={{ height: HERO, backgroundColor: colors.fill }} label={says.cover(title)}>
            <LinearGradient colors={[withAlpha(colors.black, 0.4), withAlpha(colors.black, 0)]} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: HERO * 0.45 }} />
          </Photo>
        ) : (
          <View style={{ height: insets.top + BARE + 26, backgroundColor: colors.fill }} />
        )}
        <View style={{ marginTop: -26, paddingTop: 22, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, backgroundColor: colors.bg }}>
          <View style={{ paddingHorizontal: layout.rowGutter }}>
            <Eyebrow>{when}</Eyebrow>
            <Txt variant="titleLarge" accessibilityRole="header" style={{ marginTop: 6 }}>
              {title}
            </Txt>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 8, rowGap: 6, marginTop: 8, marginBottom: 14 }}>
              {event.place ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <MapPin size={14} color={colors.muted} />
                  <Txt variant="caption" color="muted">
                    {event.place}
                  </Txt>
                </View>
              ) : null}
              <AudienceChip thing={event} />
              {facts.map(({ key, icon: Icon, text }) => (
                <View key={key} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Icon size={14} color={colors.muted} />
                  <Txt variant="caption" color="muted">
                    {text}
                  </Txt>
                </View>
              ))}
            </View>
            <Segmented label={says.answer} style={{ marginHorizontal: 0 }} options={ANSWERS.map((one) => ({ id: one, label: says.answers[one] }))} value={answer.isPending ? (answer.variables ?? UNANSWERED) : (event.myAnswer ?? UNANSWERED)} onChange={(next) => (next === UNANSWERED ? undefined : answer.mutate(next))} />
            {answer.isError ? (
              <Txt variant="caption" color="danger" accessibilityLiveRegion="polite" style={{ marginTop: 8 }}>
                {messageFor(answer.error)}
              </Txt>
            ) : null}
            <Tap accessibilityRole="button" accessibilityLabel={says.goingSpoken(event.going, event.unanswered)} onPress={() => setSheet('guests')} scaleTo={0.985} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 32, marginTop: 12 }}>
              <Faces people={faces} size={28} most={4} ring={colors.bg} />
              <Txt variant="caption" weight={500} color="muted" style={{ flex: 1 }}>
                {rich(says.going(event.going, event.maybe, event.unanswered), {
                  bold: (text) => (
                    <Txt variant="caption" weight={800}>
                      {text}
                    </Txt>
                  ),
                })}
              </Txt>
            </Tap>
            {event.notes ? (
              <>
                <GroupLabel style={{ marginTop: 18, marginHorizontal: 2 }}>{says.notes}</GroupLabel>
                <Txt variant="body">{event.notes}</Txt>
              </>
            ) : null}
          </View>
          <EventLinks event={event} say={say} />
        </View>
      </ScrollView>

      <View style={{ position: 'absolute', top: insets.top + 8, left: layout.barGutter, right: layout.barGutter, flexDirection: 'row', justifyContent: 'space-between' }}>
        <RoundButton tone={withPhoto ? 'photo' : 'soft'} label={words.common.back} onPress={leave} icon={(c) => <ArrowLeft size={20} color={c} />} />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <RoundButton tone={withPhoto ? 'photo' : 'soft'} label={says.share} onPress={() => void share()} icon={(c) => <Share size={19} color={c} />} />
          <RoundButton tone={withPhoto ? 'photo' : 'soft'} label={says.more} onPress={() => setSheet('menu')} icon={(c) => <Ellipsis size={20} color={c} />} />
        </View>
      </View>
      {notice}

      <Sheet visible={sheet === 'menu'} onClose={close} title={says.menu.title}>
        {event.canEdit ? <SheetRow first icon={(c) => <Pencil size={20} color={c} />} label={says.menu.change} onPress={() => setSheet('change')} /> : null}
        <SheetRow first={!event.canEdit} icon={(c) => <Users size={20} color={c} />} label={says.menu.guests} onPress={() => setSheet('guests')} />
        {event.canEdit ? (
          <SheetRow
            icon={(c) => <ImagePlus size={20} color={c} />}
            label={says.menu.photo}
            onPress={() => {
              close();
              cover.mutate('pick');
            }}
          />
        ) : null}
        {event.canEdit && withPhoto ? (
          <SheetRow
            icon={(c) => <ImageOff size={20} color={c} />}
            label={says.menu.removePhoto}
            onPress={() => {
              close();
              cover.mutate('off');
            }}
          />
        ) : null}
        {event.mine ? <SheetRow danger icon={(c) => <Trash2 size={20} color={c} />} label={says.menu.delete} onPress={() => setSheet('delete')} /> : null}
      </Sheet>
      <EventChangeSheet event={event} visible={sheet === 'change'} onClose={close} />
      <GuestsSheet event={event} visible={sheet === 'guests'} onClose={close} />
      <ConfirmSheet visible={sheet === 'delete'} onClose={close} title={says.delete.title} body={says.delete.body} confirm={says.delete.confirm} onConfirm={() => remove.mutate()} busy={remove.isPending} problem={remove.isError ? messageFor(remove.error) : null} />
    </View>
  );
}

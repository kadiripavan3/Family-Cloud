import { useMutation } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { Check, Clock, Link, Send, ShieldCheck } from 'lucide-react-native';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useCache } from '@/api/cache';
import { messageFor } from '@/api/fetcher';
import { endGuestPass, type GuestPassResponse, useGetGuestPass } from '@/api/generated/homeport';
import { useCircles } from '@/features/circles/current';
import { PageProblem } from '@/features/states/PageProblem';
import { ThingRow } from '@/features/things/ThingRow';
import { formatSpan, formatTime } from '@/lib/dates';
import { loadState } from '@/lib/loading';
import { firstName } from '@/lib/names';
import { shareText } from '@/lib/share';
import { layout, radius, useTheme } from '@/theme';
import { AppBar } from '@/ui/AppBar';
import { Avatar } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { ConfirmSheet } from '@/ui/ConfirmSheet';
import { GroupLabel } from '@/ui/Heading';
import { LinkBox } from '@/ui/LinkBox';
import { NoteBox } from '@/ui/NoteBox';
import { rich } from '@/ui/rich';
import { RowGroup } from '@/ui/Rows';
import { ListSkeleton } from '@/ui/Skeleton';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

/**
 * 4.5 Guest pass: for someone who is not in the circle and shouldn't be. The sitter gets a few things for
 * one evening, on one phone, with no account; at its end time it stops by itself. This is the pass once it
 * is made: who it is for and when, what they can open, the link to send and the code to tell them another
 * way, and ending it early.
 */
export default function GuestPass() {
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const asked = useGetGuestPass(id);
  const load = loadState(asked);
  const pass = asked.data;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar leading="close" title={words.people.pass.title} />
      {load.error ? <PageProblem error={load.error} onRetry={load.retry} retrying={load.retrying} inset={false} /> : !pass ? <ListSkeleton count={4} /> : <Loaded pass={pass} />}
    </SafeAreaView>
  );
}

function Loaded({ pass }: { pass: GuestPassResponse }) {
  const { colors } = useTheme();
  const cache = useCache();
  const says = words.people.pass;
  const circle = useCircles().find((one) => one.id === pass.circleId);
  const name = firstName(pass.guestName);
  const [ending, setEnding] = useState(false);
  const [sent, setSent] = useState(false);
  const over = !pass.running && new Date(pass.startsAt) <= new Date();

  const end = useMutation({
    mutationFn: () => endGuestPass(pass.id),
    onSuccess: async () => {
      setEnding(false);
      await cache.guestPassChanged(pass.circleId);
    },
  });
  const send = async () => {
    const how = await shareText(says.message(name, circle?.name ?? '', pass.url));
    setSent(how === 'copied');
  };

  return (
    <>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 6, marginHorizontal: layout.barGutter, padding: 16, borderRadius: radius.panel, backgroundColor: colors.accentSoft }}>
          <Avatar name={pass.guestName} size={56} />
          <View style={{ flex: 1 }}>
            <Txt variant="subtitle" numberOfLines={2}>
              {pass.guestName}
            </Txt>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
              <Clock size={14} color={colors.accentText} />
              <Txt variant="caption" color="accentText" style={{ flex: 1 }}>
                {formatSpan(pass.startsAt, pass.endsAt)}
              </Txt>
            </View>
          </View>
        </View>

        <GroupLabel style={{ marginHorizontal: layout.gutter }}>{says.canOpen(name)}</GroupLabel>
        <RowGroup>
          {pass.things.map((thing, index) => (
            <ThingRow key={thing.id} look="grouped" first={index === 0} thing={{ ...thing, circleId: pass.circleId }} trailing={<Check size={20} color={colors.ok} strokeWidth={2.6} />} />
          ))}
        </RowGroup>

        {over ? (
          <NoteBox icon={(c) => <Clock size={20} color={c} />} style={{ marginTop: 22, marginHorizontal: layout.barGutter }}>
            {says.ended}
          </NoteBox>
        ) : (
          <>
            <GroupLabel style={{ marginHorizontal: layout.gutter }}>{says.how(name)}</GroupLabel>
            <LinkBox url={pass.url} icon={(c) => <Link size={18} color={c} />} style={{ marginHorizontal: layout.barGutter }} />
            <NoteBox icon={(c) => <ShieldCheck size={20} color={c} />} style={{ marginTop: 14, marginHorizontal: layout.barGutter }}>
              {rich(says.note(pass.code, formatTime(pass.endsAt)), {
                bold: (text) => (
                  <Txt variant="note" weight={800}>
                    {text}
                  </Txt>
                ),
              })}
            </NoteBox>
            <Txt variant="footnote" color="muted" style={{ marginTop: 10, marginHorizontal: layout.gutter }}>
              {words.common.join([pass.running ? says.status.running : says.status.later, pass.opened ? says.status.opened : says.status.notOpened])}
            </Txt>
          </>
        )}
      </ScrollView>

      {over ? null : (
        <View style={{ gap: 10, paddingTop: 12, paddingBottom: 12, paddingHorizontal: layout.rowGutter }}>
          {sent ? (
            <Txt variant="caption" color="muted" center accessibilityLiveRegion="polite">
              {says.sent}
            </Txt>
          ) : null}
          <Button label={says.send(name)} size="lg" block icon={(c) => <Send size={19} color={c} />} onPress={() => void send()} />
          <Button label={says.end} variant="quiet" block onPress={() => setEnding(true)} />
        </View>
      )}
      <ConfirmSheet
        visible={ending}
        onClose={() => setEnding(false)}
        title={says.endAsk.title}
        body={says.endAsk.body(name)}
        confirm={says.endAsk.confirm}
        busy={end.isPending}
        problem={end.isError ? messageFor(end.error) : null}
        onConfirm={() => end.mutate()}
      />
    </>
  );
}

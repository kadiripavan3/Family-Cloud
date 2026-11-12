import { useMutation } from '@tanstack/react-query';
import { Bell, Calendar, ChevronRight, Euro, Folder, type LucideIcon, Share as ShareIcon, X } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useCache } from '@/api/cache';
import { messageFor } from '@/api/fetcher';
import { type Audience, createBill, createEvent, createPage, createReminder } from '@/api/generated/homeport';
import { useCircle } from '@/features/circles/current';
import { takeHandedIn } from '@/features/jot/handedIn';
import { type Found, foundIn, letterTitle } from '@/features/jot/letter';
import { phoneDay, phoneZone } from '@/features/jot/phone';
import { canPickText, pickText } from '@/features/jot/pickText';
import { useReading } from '@/features/jot/useReading';
import { useLeave } from '@/features/navigation/useLeave';
import { StartsAsPill } from '@/features/sharing/StartsAsPill';
import { kindOf } from '@/features/things/kinds';
import { useOpenThing } from '@/features/things/open';
import { formatWeekday } from '@/lib/dates';
import { newClientId } from '@/lib/ids';
import { formatMoney } from '@/lib/money';
import { layout, radius, useTheme } from '@/theme';
import { AppBar } from '@/ui/AppBar';
import { Button } from '@/ui/Button';
import { GrowingInput } from '@/ui/GrowingInput';
import { GroupLabel } from '@/ui/Heading';
import { Loading } from '@/ui/Loading';
import { Tap } from '@/ui/Motion';
import { RoundButton } from '@/ui/RoundButton';
import { RowGroup } from '@/ui/Rows';
import { Sheet } from '@/ui/Sheet';
import { Toggle } from '@/ui/Toggle';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

/** What was made from a letter: enough to list it and to open it. */
type Made = { id: string; kind: 'event' | 'reminder' | 'bill' | 'page'; title: string };

const ICONS: Record<Found['kind'], LucideIcon> = { event: Calendar, reminder: Bell, bill: Euro, keep: Folder };

/**
 * 14.7 Share into it: a letter becomes several things (a day on the calendar, a form to sign by a day, an
 * amount to pay, the letter itself), each with a switch, and "Save" makes what stays on.
 *
 * On a phone, another app's share button hands the letter over (native/jot/README.md). Here the page behind
 * the sheet stands in for that other app: paste the letter's words or pick a text file, then press its
 * share button. From there on it is the real thing: the API reads the words, and events and reminders are
 * made through Plan's API, a bill through Money's.
 */
export default function ShareIn() {
  const { colors, shadow } = useTheme();
  const circle = useCircle();
  const cache = useCache();
  const leave = useLeave();
  const open = useOpenThing();
  const [handed] = useState(() => takeHandedIn('share'));
  const [text, setText] = useState(handed?.text ?? '');
  const [name, setName] = useState<string | null>(handed?.name ?? null);
  const [sheet, setSheet] = useState(!!handed);
  /** The rows that were switched off. */
  const [off, setOff] = useState<string[]>([]);
  const [audience, setAudience] = useState<Audience>(circle.startsAs);
  const [cantRead, setCantRead] = useState(false);
  /** One id per row, made once, so pressing Save twice makes each thing once. */
  const ids = useRef<Record<string, string>>({});
  const { reading, error } = useReading(circle.id, sheet ? text : '', 0);

  const letter = text.trim();
  const title = name ?? letterTitle(letter, words.jot.share.untitled);
  const found = foundIn(reading, letter, phoneDay(), words.jot.share.untitled);
  const on = found.filter((row) => !off.includes(row.id));

  const make = async (row: Found): Promise<Made> => {
    const clientId = (ids.current[row.id] ??= newClientId());
    const timeZone = phoneZone() ?? 'UTC';
    if (row.kind === 'event') {
      const made = await createEvent({ clientId, circleId: circle.id, title: row.title, day: row.day, time: row.time ?? undefined, timeZone, audience });
      return { id: made.id, kind: 'event', title: made.title };
    }
    if (row.kind === 'reminder') {
      const made = await createReminder({ clientId, circleId: circle.id, title: row.title, dueOn: row.day, dueTime: row.time ?? undefined, timeZone, audience });
      return { id: made.id, kind: 'reminder', title: made.title };
    }
    if (row.kind === 'bill') {
      const made = await createBill({ clientId, circleId: circle.id, title: row.title, amountCents: row.cents, currency: row.currency, dueOn: row.dueOn });
      return { id: made.id, kind: 'bill', title: made.title };
    }
    const made = await createPage({ clientId, circleId: circle.id, title: row.title, body: row.body, audience });
    return { id: made.id, kind: 'page', title: made.title };
  };
  const save = useMutation({
    mutationFn: async (rows: Found[]) => {
      const made: Made[] = [];
      // One after the other: a row that fails stops the rest, and Save can be pressed again.
      for (const row of rows) made.push(await make(row));
      return made;
    },
    onSettled: () => void cache.letterSaved(circle.id),
  });

  const share = () => {
    if (!letter) return;
    ids.current = {};
    setOff([]);
    save.reset();
    setSheet(true);
  };
  const pick = async () => {
    setCantRead(false);
    try {
      const picked = await pickText();
      if (!picked) return;
      setText(picked.text);
      setName(picked.name);
    } catch {
      setCantRead(true);
    }
  };
  const label = (row: Found): { title: string; note: string } => {
    if (row.kind === 'event') return { title: words.jot.share.event(row.title, formatWeekday(row.day), row.time), note: words.jot.share.eventNote };
    if (row.kind === 'reminder') return { title: words.jot.share.reminder(row.title, formatWeekday(row.day)), note: words.jot.share.reminderNote };
    if (row.kind === 'bill') return { title: words.jot.share.bill(formatMoney(row.cents, row.currency)), note: words.jot.share.billNote(formatWeekday(row.dueOn)) };
    return { title: words.jot.share.keep, note: words.jot.share.keepNote };
  };
  const saved = save.data;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar title={title} trailing={<RoundButton label={words.jot.share.open} icon={(c) => <ShareIcon size={20} color={c} />} onPress={share} />} />
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={{ marginTop: 10, marginHorizontal: layout.rowGutter, paddingVertical: 22, paddingHorizontal: 20, borderRadius: radius.chip, backgroundColor: colors.surface, boxShadow: shadow.sm }}>
          <GrowingInput
            label={words.jot.share.paper}
            variant="body"
            minHeight={150}
            placeholder={words.jot.share.placeholder}
            value={text}
            maxLength={20000}
            onChangeText={(next) => {
              setText(next);
              // Words typed over a picked file are no longer that file.
              setName(null);
            }}
          />
        </View>
        <View style={{ gap: 12, marginTop: 16, marginHorizontal: layout.gutter }}>
          {canPickText ? <Button variant="soft" label={words.jot.share.pick} onPress={() => void pick()} /> : null}
          {cantRead ? (
            <Txt variant="caption" color="danger" accessibilityLiveRegion="polite">
              {words.jot.share.cantRead}
            </Txt>
          ) : null}
          <Txt variant="footnote" color="muted">
            {words.jot.share.standIn}
          </Txt>
        </View>
      </ScrollView>

      <Sheet visible={sheet} onClose={() => setSheet(false)} title={saved ? words.jot.share.saved(saved.length) : words.jot.share.title} subtitle={saved ? words.jot.share.savedNote : undefined} action={<RoundButton label={words.jot.share.close} icon={(c) => <X size={17} color={c} />} onPress={() => setSheet(false)} />}>
        {saved ? (
          <>
            <RowGroup>
              {saved.map((made, index) => {
                const { icon: Icon, name: kind } = kindOf(made.kind);
                return (
                  <Tap
                    key={made.id}
                    accessibilityRole="button"
                    accessibilityLabel={words.common.spoken([made.title, kindOf(made.kind).name])}
                    onPress={() => {
                      setSheet(false);
                      open(made);
                    }}
                    scaleTo={0.99}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 54, paddingVertical: 14, paddingHorizontal: 16, borderTopWidth: index === 0 ? 0 : 1, borderTopColor: colors.line }}>
                    <Icon size={22} color={colors.text} />
                    <View style={{ flex: 1, gap: 1 }}>
                      <Txt variant="item" weight={600} numberOfLines={2}>
                        {made.title}
                      </Txt>
                      <Txt variant="footnote" color="muted">
                        {kind}
                      </Txt>
                    </View>
                    <ChevronRight size={18} color={colors.muted} />
                  </Tap>
                );
              })}
            </RowGroup>
            <View style={{ paddingTop: 14, paddingHorizontal: 16 }}>
              <Button size="lg" block label={words.jot.share.done} onPress={leave} />
            </View>
          </>
        ) : (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4, marginBottom: 8, marginHorizontal: 16, padding: 10, borderRadius: radius.card, backgroundColor: colors.fill }}>
              <View style={{ width: 46, height: 58, marginVertical: 2, marginHorizontal: 4, justifyContent: 'flex-end', padding: 6, borderRadius: radius.chip, borderWidth: 1.5, borderColor: colors.lineStrong, backgroundColor: colors.surface }}>
                <View style={{ alignSelf: 'flex-start', paddingVertical: 2, paddingHorizontal: 5, borderRadius: radius.chip, backgroundColor: colors.text }}>
                  <Txt variant="micro" style={{ color: colors.bg }}>
                    {words.jot.share.badge}
                  </Txt>
                </View>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Txt variant="item" weight={800} numberOfLines={2}>
                  {title}
                </Txt>
                <Txt variant="footnote" color="muted">
                  {words.jot.share.about(letter.split('\n').length, name ? 'file' : 'pasted')}
                </Txt>
              </View>
              <StartsAsPill circle={circle} value={audience} onChange={setAudience} />
            </View>
            {!reading && !error ? (
              <View style={{ minHeight: 160 }}>
                <Loading />
              </View>
            ) : (
              <>
                <GroupLabel style={{ marginTop: 14, marginHorizontal: layout.gutter }}>{words.jot.share.read}</GroupLabel>
                {error ? (
                  <Txt variant="caption" color="danger" accessibilityLiveRegion="polite" style={{ marginBottom: 8, marginHorizontal: layout.gutter }}>
                    {messageFor(error)}
                  </Txt>
                ) : found.length === 1 ? (
                  <Txt variant="footnote" color="muted" style={{ marginBottom: 8, marginHorizontal: layout.gutter }}>
                    {words.jot.share.nothingRead}
                  </Txt>
                ) : null}
                <RowGroup>
                  {found.map((row, index) => {
                    const Icon = ICONS[row.kind];
                    const said = label(row);
                    return (
                      <View key={row.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 54, paddingVertical: 14, paddingHorizontal: 16, borderTopWidth: index === 0 ? 0 : 1, borderTopColor: colors.line }}>
                        <Icon size={22} color={colors.text} />
                        <View style={{ flex: 1, gap: 1 }}>
                          <Txt variant="item" weight={600}>
                            {said.title}
                          </Txt>
                          <Txt variant="footnote" color="muted">
                            {said.note}
                          </Txt>
                        </View>
                        <Toggle label={said.title} value={!off.includes(row.id)} onChange={(next) => setOff(next ? off.filter((id) => id !== row.id) : [...off, row.id])} />
                      </View>
                    );
                  })}
                </RowGroup>
                {save.isError ? (
                  <Txt variant="caption" color="danger" accessibilityLiveRegion="polite" style={{ marginTop: 10, marginHorizontal: layout.gutter }}>
                    {messageFor(save.error)}
                  </Txt>
                ) : null}
                <View style={{ paddingTop: 14, paddingHorizontal: 16 }}>
                  <Button size="lg" block label={words.jot.share.save(on.length)} disabled={on.length === 0} loading={save.isPending} onPress={() => save.mutate(on)} />
                </View>
              </>
            )}
          </>
        )}
      </Sheet>
    </SafeAreaView>
  );
}

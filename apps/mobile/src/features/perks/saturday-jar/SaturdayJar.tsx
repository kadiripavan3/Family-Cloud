import { Plus, RefreshCw, SlidersHorizontal } from 'lucide-react-native';
import { type ReactNode, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { messageFor } from '@/api/fetcher';
import { type SaturdayJarIdeaResponse, type SaturdayJarResponse, type SaturdayJarSettings, useGetBoardEntriesInfinite } from '@/api/generated/homeport';
import { paged, rows } from '@/api/pages';
import { useCircles } from '@/features/circles/current';
import { membersOf } from '@/features/circles/members';
import { readCents } from '@/features/plan/times';
import { BoardFrame, type MenuRow } from '@/features/templates/BoardFrame';
import { PersonChips } from '@/features/templates/parts/People';
import type { Board, BoardScreenProps } from '@/features/templates/types';
import { useBoardChanges } from '@/features/templates/useBoard';
import { useOpenThing } from '@/features/things/open';
import { formatComingDay, phoneTimeZone, today } from '@/lib/dates';
import { newClientId } from '@/lib/ids';
import { formatMoney } from '@/lib/money';
import { layout, radius, useTheme } from '@/theme';
import { Button } from '@/ui/Button';
import { Chip } from '@/ui/Chip';
import { Emoji } from '@/ui/Emoji';
import { EmptyState } from '@/ui/EmptyState';
import { Field } from '@/ui/Field';
import { MoreButton } from '@/ui/MoreButton';
import { Tap } from '@/ui/Motion';
import { RoundButton } from '@/ui/RoundButton';
import { Segmented } from '@/ui/Segmented';
import { Sheet } from '@/ui/Sheet';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

import { ItemTile, Label, type Picture, PicturePick, PICTURES, standsInFor, Up } from '../parts';
import { ideaLine, putInLine, slipTags } from './facts';

type Jar = Board<SaturdayJarResponse, SaturdayJarSettings>;
type Idea = SaturdayJarIdeaResponse;
const say = words.perks.saturdayJar;
const BASKET = '🧺';
const FILTERS = ['fits', 'rainy', 'home', 'free'] as const;
type Filter = (typeof FILTERS)[number];
const OFFERED: readonly Picture[] = ['basket', 'tent', 'swim', 'pancakes', 'film', 'pizza', 'run', 'car'];
/** How long an idea can be said to take, in minutes: the choices of the sheet that adds one. */
const TIMES = ['any', '30', '60', '120', '240', '480'] as const;

/** What the jar is asked before it is shaken, as the sheet holds it: the time there is, what it may cost, and the sky. */
type Ask = { minutes: 'any' | '60' | '120' | '240'; cents: 'any' | '0' | '2000' | '5000'; sky: 'either' | 'indoors' | 'outdoors' };
/** The same as the API takes it: what doesn't matter is left out. */
const askFields = (ask: Ask) => ({ minutes: ask.minutes === 'any' ? undefined : Number(ask.minutes), cents: ask.cents === 'any' ? undefined : Number(ask.cents), outdoors: ask.sky === 'either' ? undefined : ask.sky === 'outdoors' });
/** What the jar was last asked today, to begin the sheet with. An amount the sheet doesn't offer counts as "any". */
function askOf(view: SaturdayJarResponse): Ask {
  const minutes = String(view.asked?.minutes ?? 'any');
  const cents = String(view.asked?.cents ?? 'any');
  return {
    minutes: minutes === '60' || minutes === '120' || minutes === '240' ? minutes : 'any',
    cents: cents === '0' || cents === '2000' || cents === '5000' ? cents : 'any',
    sky: view.asked?.outdoors === true ? 'outdoors' : view.asked?.outdoors === false ? 'indoors' : 'either',
  };
}

/**
 * 16.4 The Saturday jar. Everyone drops ideas in all year. On a free day the jar is shaken: it pulls one idea
 * that fits the time there is, what it may cost, and indoors or outdoors (no weather source is connected, so
 * the jar asks instead of knowing). "Let's do it" takes the idea out of the jar and puts it on the calendar
 * with an album waiting for the photos. Below, what is in the jar, narrowed by the API's own four filters.
 */
export function SaturdayJar({ board }: BoardScreenProps<SaturdayJarResponse, SaturdayJarSettings>) {
  const view = board.view;
  const changes = useBoardChanges(board);
  const open = useOpenThing();
  const [filter, setFilter] = useState<Filter>('fits');
  const [adding, setAdding] = useState(false);
  const [asking, setAsking] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const asked = useGetBoardEntriesInfinite(board.id, { kind: 'idea', filter, day: today() }, { query: paged });
  // One template's list holds that template's own: in this jar every entry is an idea.
  const ideas = rows(asked.data) as Idea[] | undefined;
  const pulled = view.pulled;
  const looked = ideas?.find((one) => one.id === openId) ?? (pulled?.id === openId ? pulled : null);

  const shakeAgain = () => void changes.act('shake', askFields(askOf(view)));
  const menu: MenuRow[] = [{ icon: (color) => <SlidersHorizontal size={20} color={color} />, label: say.menu.ask, onPress: () => setAsking(true) }];
  const plus = <RoundButton label={say.add.button} onPress={() => setAdding(true)} icon={(color) => <Plus size={20} color={color} />} />;

  return (
    <BoardFrame board={board} title={board.title} chip="menu" actions={plus} menu={menu} problem={changes.problem}>
      {view.count === 0 && !pulled && view.comingUp.length === 0 ? (
        <View style={{ flex: 1, justifyContent: 'center', paddingBottom: 60 }}>
          <EmptyState emoji={board.emoji || BASKET} title={say.empty.title} body={say.empty.body} action={<Button label={say.add.button} icon={(color) => <Plus size={19} color={color} />} onPress={() => setAdding(true)} />} />
        </View>
      ) : (
        <>
          <Txt variant="lead" weight={600} color="muted" center style={{ marginTop: 2, marginHorizontal: layout.rowGutter }}>
            {say.ask}
          </Txt>
          {pulled ? (
            <>
              <Slip idea={pulled} jar={view} onPress={() => setOpenId(pulled.id)} />
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 18, marginHorizontal: layout.barGutter }}>
                <Button label={say.shakeAgain} variant="soft" inline disabled={changes.busy} icon={(color) => <RefreshCw size={17} color={color} />} onPress={shakeAgain} style={{ flex: 1, paddingHorizontal: 10 }} />
                {pulled.done ? (
                  <Button label={say.seeEvent} inline onPress={() => open({ kind: 'event', id: pulled.eventId })} style={{ flex: 1, paddingHorizontal: 10 }} />
                ) : (
                  <Button label={say.letsDoIt} inline loading={changes.busy} onPress={() => void changes.act('do', { day: today(), timeZone: phoneTimeZone() })} style={{ flex: 1, paddingHorizontal: 10 }} />
                )}
              </View>
            </>
          ) : (
            <>
              <NotShaken />
              <View style={{ marginTop: 18, marginHorizontal: layout.barGutter }}>
                <Button label={say.shake} block disabled={view.count === 0} icon={(color) => <RefreshCw size={17} color={color} />} onPress={() => setAsking(true)} />
              </View>
            </>
          )}

          {view.comingUp.length ? (
            <>
              <Label>{say.comingUp}</Label>
              {view.comingUp.map((idea) => (
                <Up key={idea.id} leading={<ItemTile emoji={idea.emoji ?? BASKET} />} title={idea.text} line={say.onCalendar(idea.doneOn ? formatComingDay(idea.doneOn, today()) : null)} onPress={idea.eventId ? () => open({ kind: 'event', id: idea.eventId }) : undefined} />
              ))}
            </>
          ) : null}

          <Label>{say.inTheJar(view.count)}</Label>
          <View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: layout.barGutter }}>
              {FILTERS.map((one) => (
                <Chip key={one} tone="filter" label={say.filters[one]} selected={filter === one} onPress={() => setFilter(one)} />
              ))}
            </ScrollView>
          </View>
          <View style={{ height: 8 }} />
          {asked.isError && !ideas ? (
            <Txt variant="callout" color="muted" style={{ marginHorizontal: layout.gutter }}>
              {messageFor(asked.error)}
            </Txt>
          ) : !ideas ? null : ideas.length === 0 ? (
            <Txt variant="callout" color="muted" style={{ marginHorizontal: layout.gutter }}>
              {view.count === 0 ? say.noneLeft : say.noneFit}
            </Txt>
          ) : (
            <>
              {ideas.map((idea) => (
                <Up key={idea.id} leading={<ItemTile emoji={idea.emoji ?? BASKET} />} title={idea.text} line={ideaLine(idea)} onPress={() => setOpenId(idea.id)} />
              ))}
              <MoreButton pages={asked} />
            </>
          )}
        </>
      )}
      <IdeaSheet board={board} idea={looked} onClose={() => setOpenId(null)} />
      <AskSheet board={board} visible={asking} onClose={() => setAsking(false)} />
      <AddSheet board={board} visible={adding} onClose={() => setAdding(false)} />
    </BoardFrame>
  );
}

/** The slip that was pulled: a card laid down a little askew, with the idea, who put it in, and what is worth knowing. */
function Slip({ idea, jar, onPress }: { idea: Idea; jar: SaturdayJarResponse; onPress: () => void }) {
  const { colors, shadow } = useTheme();
  const tags = slipTags(idea, jar);
  const under = idea.done ? say.onCalendar(idea.doneOn ? formatComingDay(idea.doneOn, today()) : null) : putInLine(idea);
  return (
    // The slip lies a little askew. The turn is the box's own; the press shrinks what is inside it.
    <View style={{ marginTop: 14, marginHorizontal: 24, transform: [{ rotate: '-1.5deg' }] }}>
      <Tap accessibilityRole="button" accessibilityLabel={words.common.spoken([idea.text, under, ...tags])} scaleTo={0.98} onPress={onPress} style={{ alignItems: 'center', gap: 6, paddingTop: 22, paddingHorizontal: 18, paddingBottom: 18, borderRadius: radius.cardLarge, backgroundColor: colors.surface, boxShadow: shadow.md }}>
        <Emoji char={idea.emoji ?? BASKET} size={62} />
        <Txt variant="title" accessibilityRole="header" center>
          {idea.text}
        </Txt>
        <Txt variant="caption" weight={500} color="muted" center>
          {under}
        </Txt>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6, marginTop: 8 }}>
          {tags.map((tag) => (
            <View key={tag} style={{ paddingVertical: 6, paddingHorizontal: 11, borderRadius: radius.photo, backgroundColor: colors.fill }}>
              <Txt variant="footnote" weight={700}>
                {tag}
              </Txt>
            </View>
          ))}
        </View>
      </Tap>
    </View>
  );
}

/** Where the slip lies before the jar was shaken today. */
function NotShaken() {
  const { colors } = useTheme();
  return (
    <View style={{ alignItems: 'center', gap: 6, marginTop: 14, marginHorizontal: 24, paddingTop: 22, paddingHorizontal: 18, paddingBottom: 18, borderRadius: radius.cardLarge, borderWidth: 2, borderStyle: 'dashed', borderColor: colors.lineStrong }}>
      <Emoji char={BASKET} size={62} />
      <Txt variant="title" center>
        {say.notShaken.title}
      </Txt>
      <Txt variant="caption" weight={500} color="muted" center>
        {say.notShaken.body}
      </Txt>
    </View>
  );
}

/** What fits today: the time there is, what it may cost, indoors or outdoors. Then the jar is shaken. */
function AskSheet({ board, visible, onClose }: { board: Jar; visible: boolean; onClose: () => void }) {
  return (
    <Sheet visible={visible} onClose={onClose} title={say.askSheet.title} subtitle={say.askSheet.lead}>
      {visible ? <Asking board={board} onClose={onClose} /> : null}
    </Sheet>
  );
}

function Asking({ board, onClose }: { board: Jar; onClose: () => void }) {
  const changes = useBoardChanges(board);
  const [ask, setAsk] = useState<Ask>(askOf(board.view));
  const sheet = say.askSheet;
  const group = (label: string, control: ReactNode) => (
    <View>
      <Txt variant="label" color="muted" style={{ marginBottom: 8, marginHorizontal: layout.gutter }}>
        {label}
      </Txt>
      {control}
    </View>
  );
  return (
    <View style={{ gap: 14, paddingTop: 6 }}>
      {group(
        sheet.time,
        <Segmented label={sheet.time} value={ask.minutes} onChange={(minutes) => setAsk({ ...ask, minutes })} options={[{ id: 'any', label: sheet.any }, { id: '60', label: sheet.hour }, { id: '120', label: sheet.twoHours }, { id: '240', label: sheet.halfDay }]} />,
      )}
      {group(
        sheet.cost,
        <Segmented label={sheet.cost} value={ask.cents} onChange={(cents) => setAsk({ ...ask, cents })} options={[{ id: 'any', label: sheet.any }, { id: '0', label: sheet.free }, { id: '2000', label: sheet.upTo(formatMoney(2000)) }, { id: '5000', label: sheet.upTo(formatMoney(5000)) }]} />,
      )}
      {group(
        sheet.where,
        <Segmented label={sheet.where} value={ask.sky} onChange={(sky) => setAsk({ ...ask, sky })} options={[{ id: 'either', label: sheet.either }, { id: 'indoors', label: sheet.indoors }, { id: 'outdoors', label: sheet.outdoors }]} />,
      )}
      <View style={{ gap: 10, paddingHorizontal: layout.rowGutter }}>
        {changes.problem ? (
          <Txt variant="caption" color="danger" accessibilityLiveRegion="polite">
            {changes.problem}
          </Txt>
        ) : null}
        <Button label={sheet.shake} size="lg" block loading={changes.busy} icon={(color) => <RefreshCw size={19} color={color} />} onPress={() => void changes.act('shake', askFields(ask)).then((shaken) => (shaken ? onClose() : undefined))} />
      </View>
    </View>
  );
}

/** An idea, pressed: who put it in and when, saying yes to this one, and taking it out for whoever may. */
function IdeaSheet({ board, idea, onClose }: { board: Jar; idea: Idea | null; onClose: () => void }) {
  const changes = useBoardChanges(board);
  const circle = useCircles().find((one) => one.id === board.circleId);
  const close = () => {
    changes.forget();
    onClose();
  };
  const then = (done: unknown) => (done ? close() : undefined);
  const mayChange = idea ? idea.mine || board.canEdit || standsInFor(circle, idea.by?.memberId) : false;
  return (
    <Sheet visible={idea !== null} onClose={close} title={idea?.text} subtitle={idea ? words.common.join([putInLine(idea), ...slipTags(idea, { weather: null, everyoneFree: null, people: 0 })]) : undefined}>
      {idea ? (
        <View style={{ gap: 10, paddingTop: 6, paddingHorizontal: layout.rowGutter }}>
          {changes.problem ? (
            <Txt variant="caption" color="danger" accessibilityLiveRegion="polite">
              {changes.problem}
            </Txt>
          ) : null}
          {idea.done ? (
            mayChange ? <Button label={say.idea.putBack} variant="soft" size="lg" block loading={changes.busy} onPress={() => void changes.change(idea.id, { done: false }).then(then)} /> : null
          ) : (
            <>
              <Button label={say.idea.doIt} size="lg" block loading={changes.busy} onPress={() => void changes.act('do', { ideaId: idea.id, day: today(), timeZone: phoneTimeZone() }).then(then)} />
              {mayChange ? <Button label={say.idea.takeOut} variant="soft" size="lg" block disabled={changes.busy} onPress={() => void changes.remove(idea.id).then(then)} /> : null}
            </>
          )}
        </View>
      ) : null}
    </Sheet>
  );
}

/** A new idea for the jar: what it is, where, how long it takes, about what it costs, and whose idea it is. */
function AddSheet({ board, visible, onClose }: { board: Jar; visible: boolean; onClose: () => void }) {
  return (
    <Sheet visible={visible} onClose={onClose} title={say.add.title} subtitle={say.add.lead}>
      {visible ? <AddIdea board={board} onClose={onClose} /> : null}
    </Sheet>
  );
}

function AddIdea({ board, onClose }: { board: Jar; onClose: () => void }) {
  const changes = useBoardChanges(board);
  const clientId = useRef(newClientId());
  const circle = useCircles().find((one) => one.id === board.circleId);
  // Your own idea, or a child's: theirs is dropped in on a parent's phone.
  const mine = circle ? membersOf(circle).filter((member) => member.kind !== 'pet' && standsInFor(circle, member.id)) : [];
  const [text, setText] = useState('');
  const [emoji, setEmoji] = useState<string>(PICTURES.basket);
  const [place, setPlace] = useState<'any' | 'home' | 'indoors' | 'outdoors'>('any');
  const [minutes, setMinutes] = useState<(typeof TIMES)[number]>('any');
  const [cost, setCost] = useState('');
  const [by, setBy] = useState<string | null>(circle?.myMemberId ?? null);
  const cents = cost.trim() ? readCents(cost) : 0;
  const form = say.add;
  const fields = { text: text.trim(), emoji, place: place === 'any' ? undefined : place, minutes: minutes === 'any' ? undefined : Number(minutes), cents: cents ?? undefined, byMemberId: by ?? undefined };
  return (
    <View style={{ gap: 12, paddingTop: 6 }}>
      <View style={{ gap: 12, paddingHorizontal: layout.rowGutter }}>
        <Field label={form.text} value={text} onChangeText={setText} maxLength={200} autoFocus placeholder={form.textPlaceholder} error={changes.problem} />
        <PicturePick label={form.picture} options={OFFERED} value={emoji} onChange={setEmoji} />
      </View>
      <View>
        <Txt variant="label" color="muted" style={{ marginBottom: 8, marginHorizontal: layout.gutter }}>
          {form.where}
        </Txt>
        <Segmented label={form.where} value={place} onChange={setPlace} options={[{ id: 'any', label: form.anywhere }, { id: 'home', label: form.home }, { id: 'indoors', label: form.indoors }, { id: 'outdoors', label: form.outdoors }]} />
      </View>
      <View>
        <Txt variant="label" color="muted" style={{ marginBottom: 8, marginHorizontal: layout.gutter }}>
          {form.time}
        </Txt>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8, paddingHorizontal: layout.rowGutter }}>
          {TIMES.map((one) => (
            <Chip key={one} tone="filter" label={form.times[one]} selected={minutes === one} onPress={() => setMinutes(one)} />
          ))}
        </ScrollView>
      </View>
      <View style={{ paddingHorizontal: layout.rowGutter }}>
        <Field label={form.cost} value={cost} onChangeText={setCost} keyboardType="decimal-pad" maxLength={10} placeholder={form.costPlaceholder} note={cost.trim() && cents === null ? form.costNote : null} />
      </View>
      {mine.length > 1 ? (
        <View>
          <Txt variant="label" color="muted" style={{ marginBottom: 8, marginHorizontal: layout.gutter }}>
            {form.by}
          </Txt>
          <PersonChips inset people={mine} value={by} onChange={setBy} />
        </View>
      ) : null}
      <View style={{ paddingHorizontal: layout.rowGutter }}>
        <Button label={form.save} size="lg" block disabled={!text.trim() || cents === null} loading={changes.busy} onPress={() => void changes.add('idea', fields, clientId.current).then((added) => (added ? onClose() : undefined))} />
      </View>
    </View>
  );
}

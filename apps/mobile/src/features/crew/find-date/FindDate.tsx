import { CalendarCheck, CalendarX, Link as LinkIcon, Share, Sparkle } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import type { FindDateDayResponse, FindDateSettings, FindDateViewResponse } from '@/api/generated/homeport';
import { PersonRow } from '@/features/people/PersonRow';
import { BoardFrame } from '@/features/templates/BoardFrame';
import { Foot } from '@/features/templates/parts/Bars';
import { Notice } from '@/features/templates/parts/Notice';
import type { Board, BoardScreenProps } from '@/features/templates/types';
import { useBoardChanges } from '@/features/templates/useBoard';
import { useOpenThing } from '@/features/things/open';
import { daysBetween, formatDay, formatWeekday, formatWeekdayLong, fromISODate, monthOf, phoneTimeZone, timeAgo, toISODate, today } from '@/lib/dates';
import { shareText } from '@/lib/share';
import { layout, radius, useTheme } from '@/theme';
import { Button } from '@/ui/Button';
import { GroupLabel } from '@/ui/Heading';
import { LinkBox } from '@/ui/LinkBox';
import { Tap } from '@/ui/Motion';
import { NoteBox } from '@/ui/NoteBox';
import { RoundButton } from '@/ui/RoundButton';
import { Sheet } from '@/ui/Sheet';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

import { type Cell, heatOf, mix, mostOf, paleRange, weeksOf } from './heat';

type Dates = Board<FindDateViewResponse, FindDateSettings>;
const say = words.crew.findDate;

/** When it was sent round, the way people say it for a week: "today", "on Monday"; after that, the date. */
function sentWhen(askedAt: string): string {
  const day = toISODate(new Date(askedAt));
  const ago = daysBetween(day, today());
  return say.sent(ago <= 0 ? null : ago < 7 ? formatWeekdayLong(day) : formatDay(day));
}

/**
 * 19.3 When can everyone? A stretch of days; each person taps the ones they can do, and the darker a day
 * the more of them can make it. The API says which day is best and who it still waits for. People without
 * the app answer through a link, and when a day works one tap puts it on everyone's calendar.
 */
export function FindDate({ board }: BoardScreenProps<FindDateViewResponse, FindDateSettings>) {
  const view = board.view;
  const changes = useBoardChanges(board);
  // The big button and a nudge each have their own, so a day that is tapped behind them doesn't share their spinner.
  const setting = useBoardChanges(board);
  const nudge = useBoardChanges(board);
  const [nudged, setNudged] = useState<string | null>(null);
  const open = useOpenThing();
  const [sharing, setSharing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  useSeen(board);

  const best = view.best;
  const isSet = view.setFor !== null && view.eventId !== null;
  // The calendars it goes on are those of the circle's own people: whoever answered by link has none here.
  const calendars = view.asked - view.byLink.length;
  const others = view.waitingFor.filter((one) => !one.you).map((one) => one.person.name ?? '');
  const waiting = [...others, ...(view.waitingFor.some((one) => one.you) ? [say.you] : [])];

  return (
    <BoardFrame
      board={board}
      title={board.title}
      subtitle={isSet && view.setFor ? say.setLead(formatWeekday(view.setFor)) : say.lead}
      chip="menu"
      problem={changes.problem ?? setting.problem ?? nudge.problem}
      actions={<RoundButton label={say.link.button} onPress={() => (view.link ? setSharing(true) : setNotice(say.link.notYours))} icon={(color) => <Share size={20} color={color} />} />}
      menu={[
        {
          icon: (color) => <CalendarX size={20} color={color} />,
          label: view.youCant ? say.cant.undo : say.cant.label,
          note: view.youCant ? undefined : say.cant.note,
          onPress: () => void changes.act('cant', { cant: !view.youCant }),
        },
      ]}
      footer={
        isSet && view.setFor ? (
          <Foot fine={say.set.fine(calendars)}>
            <Button label={say.set.open} variant="soft" size="lg" block onPress={() => open({ kind: 'event', id: view.eventId })} />
          </Foot>
        ) : best && board.canEdit ? (
          <Foot fine={say.fine(calendars, others)}>
            <Button label={say.setFor(formatWeekday(best.day))} size="lg" block loading={setting.busy} onPress={() => void setting.act('set', { day: best.day, timeZone: phoneTimeZone() })} />
          </Foot>
        ) : (
          <Foot fine={best ? say.fineViewer : say.fineNoDay} />
        )
      }>
      <Calendar days={view.days} onTap={(day) => void changes.act('tap', { day: day.day, free: !day.you })} />
      {view.youCant ? (
        <Txt variant="footnote" color="muted" center accessibilityLiveRegion="polite" style={{ marginTop: 8, marginHorizontal: layout.gutter }}>
          {say.cant.said}
        </Txt>
      ) : null}
      <View style={{ height: 16 }} />
      <NoteBox soft icon={(color) => (isSet ? <CalendarCheck size={20} color={color} /> : <Sparkle size={20} color={color} />)} title={isSet && view.setFor ? say.set.title(formatWeekday(view.setFor)) : best ? say.best(formatWeekday(best.day), best.free, best) : say.noDay.title} style={{ marginHorizontal: layout.barGutter }}>
        {isSet ? say.set.body : best ? say.who(best.names, waiting) : say.noDay.body}
      </NoteBox>

      {view.waitingFor.length ? (
        <>
          <GroupLabel style={{ marginHorizontal: layout.gutter }}>{say.stillToAnswer}</GroupLabel>
          {view.waitingFor.map((one) => {
            const name = one.person.name ?? '';
            return (
              <PersonRow
                key={one.person.memberId ?? name}
                name={one.you ? say.youName : name}
                avatarUrl={one.person.avatarUrl}
                line={one.you ? say.yourTurn : words.common.join([sentWhen(view.askedAt), one.opened ? say.opened : say.notOpened, one.nudgedAt ? say.nudged(timeAgo(one.nudgedAt)) : null])}
                trailing={
                  one.you || !board.canEdit ? null : (
                    <Button
                      label={say.nudge}
                      spoken={say.nudgeSpoken(name)}
                      variant="soft"
                      size="sm"
                      inline
                      loading={nudge.busy && nudged === one.person.memberId}
                      onPress={() => {
                        setNudged(one.person.memberId ?? null);
                        void nudge.act('nudge', { memberId: one.person.memberId });
                      }}
                    />
                  )
                }
              />
            );
          })}
        </>
      ) : null}

      {view.byLink.length ? (
        <>
          <GroupLabel style={{ marginHorizontal: layout.gutter }}>{say.byLink.title}</GroupLabel>
          {view.byLink.map((one) => (
            <PersonRow
              key={one.id}
              name={one.name}
              line={say.byLink.days(one.days)}
              trailing={board.canEdit ? <Button label={say.byLink.remove} spoken={say.byLink.removeSpoken(one.name)} variant="soft" size="sm" inline onPress={() => void changes.remove(one.id)} /> : null}
            />
          ))}
        </>
      ) : null}

      <LinkSheet board={board} visible={sharing} onClose={() => setSharing(false)} />
      <Notice text={notice} onClose={() => setNotice(null)} />
    </BoardFrame>
  );
}

/**
 * Whoever is still to answer has looked at it now: the API is told once, so the others see "opened, not
 * answered" beside their name. It asks for its own changes, so it shares no spinner with the page.
 */
function useSeen(board: Dates) {
  const { act } = useBoardChanges(board);
  const mine = board.view.waitingFor.find((one) => one.you);
  const unseen = !!mine && !mine.opened;
  const told = useRef(false);
  useEffect(() => {
    if (!unseen || told.current) return;
    told.current = true;
    void act('opened');
  }, [unseen, act]);
}

/**
 * The days offered, as whole weeks from a Monday. A day is darker the more people can do it, the best day
 * wears a ring, and a small dot stands under the days this person tapped. Tapping a day says "I can" or
 * takes it back; a day that has passed can't be tapped.
 */
function Calendar({ days, onTap }: { days: readonly FindDateDayResponse[]; onTap: (day: FindDateDayResponse) => void }) {
  const { colors } = useTheme();
  const most = mostOf(days);
  const pale = paleRange(most);
  const firstMonth = days[0] ? monthOf(days[0].day) : '';
  return (
    <View>
      <View style={{ marginTop: 12, marginHorizontal: 10 }}>
        <View style={{ flexDirection: 'row', paddingBottom: 6 }}>
          {words.dates.weekdayInitials.map((letter, index) => (
            <Txt key={index} variant="tiny" weight={800} color="muted" center accessible={false} style={{ flex: 1 }}>
              {letter}
            </Txt>
          ))}
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {weeksOf(days).map((cell) => (
            <DayCell key={cell.day} cell={cell} most={most} pale={monthOf(cell.day) !== firstMonth} onTap={onTap} />
          ))}
        </View>
      </View>
      {most > 0 ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 4 }}>
          {pale ? (
            <>
              <View style={{ width: 14, height: 14, borderRadius: radius.pill, backgroundColor: colors.accentSoft }} />
              <Txt variant="tiny" weight={600} color="muted">
                {say.key.some(pale.from, pale.to)}
              </Txt>
            </>
          ) : null}
          <View style={{ width: 14, height: 14, marginLeft: pale ? 10 : 0, borderRadius: radius.pill, backgroundColor: colors.accent }} />
          <Txt variant="tiny" weight={600} color="muted">
            {say.key.most(most)}
          </Txt>
        </View>
      ) : null}
    </View>
  );
}

type CellProps = { cell: Cell<FindDateDayResponse>; most: number; pale: boolean; onTap: (day: FindDateDayResponse) => void };

/** One day of the calendar. `pale` is a day of the month after the first: its number is lighter, as in a month's grid. */
function DayCell({ cell, most, pale, onTap }: CellProps) {
  const { colors } = useTheme();
  const day = cell.offered;
  const frame = { width: `${100 / 7}%`, minHeight: 40, alignItems: 'center', gap: 3 } as const;
  if (!day) return <View style={frame} />;
  const date = fromISODate(day.day);
  const heat = heatOf(day.free, most);
  const ground = heat === 3 ? colors.accent : heat === 2 ? mix(colors.accent, colors.accentSoft, 0.55) : heat === 1 ? colors.accentSoft : 'transparent';
  const ink = heat >= 2 ? colors.onAccent : pale ? colors.lineStrong : colors.text;
  return (
    <Tap
      accessibilityRole="checkbox"
      accessibilityLabel={say.day(words.dates.weekdayLong(date.getDay()), words.dates.dayLong(date.getDate(), date.getMonth()), day.free, day.best)}
      accessibilityState={{ checked: day.you, disabled: day.past }}
      // Said this way, a browser hears whether the day is ticked as well: the web takes no `accessibilityState`.
      aria-checked={day.you}
      disabled={day.past}
      onPress={() => onTap(day)}
      scaleTo={0.9}
      style={[frame, { opacity: day.past ? 0.35 : 1 }]}>
      <View style={{ width: 30, height: 30, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: ground }}>
        {day.best ? <View style={{ position: 'absolute', top: -4, left: -4, right: -4, bottom: -4, borderRadius: radius.pill, borderWidth: 2, borderColor: colors.text }} /> : null}
        <Txt variant="item" weight={heat === 3 ? 800 : 700} style={{ color: ink }}>
          {date.getDate()}
        </Txt>
      </View>
      {day.you ? <View style={{ width: 4, height: 4, borderRadius: radius.pill, backgroundColor: colors.text }} /> : null}
    </Tap>
  );
}

/**
 * The link for people without the app: copy it or hand it to the phone's share sheet, and replace it when it
 * went to the wrong place (the old one stops working at once).
 */
function LinkSheet({ board, visible, onClose }: { board: Dates; visible: boolean; onClose: () => void }) {
  const changes = useBoardChanges(board);
  const link = board.view.link;
  const [asking, setAsking] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const close = () => {
    setAsking(false);
    setSaid(null);
    changes.forget();
    onClose();
  };
  const share = async () => {
    if (!link) return;
    const how = await shareText(say.link.message(board.title, link));
    setSaid(how === 'copied' ? say.link.copied : how === 'neither' ? say.link.cantShare : null);
  };
  const replace = async () => {
    if (await changes.act('new_link')) {
      setAsking(false);
      setSaid(say.link.replaced);
    }
  };
  return (
    <Sheet visible={visible} onClose={close} title={say.link.title} subtitle={say.link.lead}>
      <View style={{ gap: 12, paddingTop: 6, paddingHorizontal: layout.rowGutter }}>
        {link ? <LinkBox url={link} icon={(color) => <LinkIcon size={16} color={color} />} copyLabel={say.link.copy} /> : null}
        {said || changes.problem ? (
          <Txt variant="caption" color={changes.problem ? 'danger' : 'muted'} accessibilityLiveRegion="polite">
            {changes.problem ?? said}
          </Txt>
        ) : null}
        <Button label={say.link.share} size="lg" block icon={(color) => <Share size={19} color={color} />} onPress={() => void share()} />
        {asking ? (
          <>
            <Txt variant="callout" weight={700}>
              {say.link.newAsk}
            </Txt>
            <Button label={say.link.newYes} variant="soft" size="lg" block loading={changes.busy} onPress={() => void replace()} />
          </>
        ) : (
          <Button label={say.link.new} variant="soft" size="lg" block onPress={() => setAsking(true)} />
        )}
      </View>
    </Sheet>
  );
}

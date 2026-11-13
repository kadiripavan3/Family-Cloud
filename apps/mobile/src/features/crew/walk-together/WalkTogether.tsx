import { ArrowLeft, Check, Flag, MapPin, Pencil, Plus, X } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { type LayoutChangeEvent, ScrollView, useWindowDimensions, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Rect } from 'react-native-svg';

import type { WalkTogetherSettings, WalkTogetherViewResponse } from '@/api/generated/homeport';
import { useCircles } from '@/features/circles/current';
import { useLeave } from '@/features/navigation/useLeave';
import { BoardMore, type MenuRow } from '@/features/templates/BoardFrame';
import type { Board, BoardScreenProps } from '@/features/templates/types';
import { useBoardChanges } from '@/features/templates/useBoard';
import { addDays, formatComingDay, formatWeekdayPast, today } from '@/lib/dates';
import { newClientId } from '@/lib/ids';
import { layout, radius, useTheme } from '@/theme';
import { Avatar } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { DayPicker } from '@/ui/DayPicker';
import { Field, FieldButton } from '@/ui/Field';
import { GlassBar } from '@/ui/GlassBar';
import { GroupLabel } from '@/ui/Heading';
import { Tap } from '@/ui/Motion';
import { RoundButton } from '@/ui/RoundButton';
import { Sheet } from '@/ui/Sheet';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

import { barOf, numberOf, readAmount, type Unit, unitOf } from './amounts';
import { cover, type Fit, fitRoute, onScreen, pathBetween, pointAt } from './route';

type Walk = Board<WalkTogetherViewResponse, WalkTogetherSettings>;
const say = words.crew.walk;

/** The drawing's land and its one green patch, in its own box. Only a picture: the API keeps no places on the earth. */
const LAND = [
  'M390 60C330 50 300 90 250 96C200 102 170 70 120 86C80 98 70 150 40 170C10 190 0 230 0 260V0H390Z',
  'M390 60V470C350 478 330 440 290 436C250 432 236 400 200 396C170 392 150 420 120 412C90 404 86 370 60 356C36 344 12 356 0 340V260C30 250 50 200 90 190C130 180 150 210 200 200C250 190 280 150 330 150C356 150 376 120 390 60Z',
];
const PARK = 'M230 250c30-14 66-4 72 20s-18 40-46 36-48-42-26-56Z';
/** How tall the sheet is before it has been measured: what it is with five people. */
const SHEET = 338;

/** An amount with its unit, as people read it: "1,240 km", "8,400 steps". */
const shown = (amount: number, unit: Unit) => (unit === 'steps' ? say.steps(numberOf(amount, unit)) : say.km(numberOf(amount, unit)));

/**
 * 19.9 A goal you walk together. The crew walks the distance from one place to another between them; each
 * person types in what they walked. The page is the drawing's map with the walk as one line across it: how
 * far they have come as a marker on the line, the places along the way where they lie, and under it this
 * week's distance for each person. No map is loaded and nothing is read from the phone: only numbers.
 */
export function WalkTogether({ board }: BoardScreenProps<WalkTogetherViewResponse, WalkTogetherSettings>) {
  const { colors, shadow } = useTheme();
  const insets = useSafeAreaInsets();
  const leave = useLeave();
  const view = board.view;
  const unit = unitOf(view.unit);
  const circle = useCircles().find((one) => one.id === board.circleId);
  const [adding, setAdding] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [sheet, setSheet] = useState(SHEET);
  const most = view.people.reduce((top, person) => Math.max(top, person.thisWeek), 0);
  // A long first name gets a wider column, so every bar still starts at the same place.
  const names = view.people.map((one) => (one.you ? say.you : (one.person.name ?? '')));
  const nameWidth = names.some((name) => name.length > 5) ? 72 : 44;
  const head = insets.top + 2;

  const menu: MenuRow[] = [
    { icon: (color) => <Pencil size={20} color={color} />, label: say.yours.title, onPress: () => setAdding(true) },
    ...(board.canEdit ? [{ icon: (color: string) => <MapPin size={20} color={color} />, label: say.stops.title, onPress: () => setPlacing(true) }] : []),
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.mapLand }}>
      <RouteMap view={view} headEnds={head + 54} sheet={sheet} />

      <GlassBar radius="sheet" style={{ position: 'absolute', top: head, left: 16, right: 16 }} contentStyle={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 6 }}>
        <RoundButton label={words.common.back} onPress={leave} icon={(color) => <ArrowLeft size={20} color={color} />} />
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Txt variant="callout" weight={800} accessibilityRole="header" numberOfLines={1}>
            {board.title}
          </Txt>
          <Txt variant="small" weight={500} color="muted" numberOfLines={1}>
            {words.common.join([circle?.name, say.together(shown(view.goal, unit))])}
          </Txt>
        </View>
        <BoardMore board={board} rows={menu} />
      </GlassBar>

      <View
        onLayout={(event: LayoutChangeEvent) => setSheet(event.nativeEvent.layout.height)}
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: 10, paddingBottom: Math.max(insets.bottom, 12) + 16, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, backgroundColor: colors.surface, boxShadow: shadow.sheet }}>
        <View style={{ alignSelf: 'center', width: 38, height: 5, marginBottom: 8, borderRadius: radius.pill, backgroundColor: colors.fill2 }} />
        <Txt variant="titleSmall" accessibilityRole="header" style={{ paddingTop: 8, paddingHorizontal: layout.gutter, paddingBottom: 4 }}>
          {say.thisWeek(shown(view.thisWeek, unit))}
        </Txt>
        <ScrollView style={{ maxHeight: 232 }} showsVerticalScrollIndicator={false}>
          {view.people.map((one, index) => (
            <View
              key={one.person.memberId ?? index}
              accessible
              accessibilityLabel={say.personSpoken(names[index] ?? '', shown(one.thisWeek, unit), shown(one.total, unit))}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 5, paddingHorizontal: layout.rowGutter }}>
              <Avatar uri={one.person.avatarUrl} name={one.person.name ?? ''} size={28} />
              <Txt variant="callout" weight={700} numberOfLines={1} style={{ width: nameWidth }}>
                {names[index]}
              </Txt>
              <View style={{ flex: 1, height: 6, borderRadius: radius.pill, overflow: 'hidden', backgroundColor: colors.fill2 }}>
                <View style={{ width: `${barOf(one.thisWeek, most) * 100}%`, height: 6, borderRadius: radius.pill, backgroundColor: colors.accent }} />
              </View>
              <Txt variant="footnote" weight={600} color="muted" numberOfLines={1} style={{ width: unit === 'steps' ? 74 : 46, textAlign: 'right' }}>
                {shown(one.thisWeek, unit)}
              </Txt>
            </View>
          ))}
        </ScrollView>
        <View style={{ paddingTop: 14, paddingHorizontal: layout.barGutter }}>
          <Button label={say.add.button} block icon={(color) => <Plus size={16} color={color} strokeWidth={2.4} />} onPress={() => setAdding(true)} />
        </View>
      </View>

      <AddSheet board={board} visible={adding} onClose={() => setAdding(false)} />
      <StopsSheet board={board} visible={placing} onClose={() => setPlacing(false)} />
    </View>
  );
}

/**
 * The map: the drawing's land and sea behind everything, the walk as a line (solid as far as the crew has
 * come, dotted from there), the start and the end as pins, the marker with the distance so far, and each
 * place along the way with its name where it lies on the line.
 */
function RouteMap({ view, headEnds, sheet }: { view: WalkTogetherViewResponse; headEnds: number; sheet: number }) {
  const { colors, shadow } = useTheme();
  const { width, height } = useWindowDimensions();
  const unit = unitOf(view.unit);
  const done = view.goal > 0 ? Math.min(Math.max(view.total / view.goal, 0), 1) : 0;
  const ground = cover(width, height);
  // The room the line has: under the head, above the sheet.
  const fit = fitRoute(width, height, { top: headEnds, bottom: height - sheet });
  const start = onScreen(pointAt(0), fit);
  const here = onScreen(pointAt(done), fit);
  const end = onScreen(pointAt(1), fit);
  const pin = { position: 'absolute', flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 7, paddingHorizontal: 11, borderRadius: radius.field, transform: [{ translateX: '-50%' }, { translateY: '-50%' }], boxShadow: shadow.float } as const;
  const label = { position: 'absolute', transform: [{ translateX: '-50%' }] } as const;

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={say.mapSpoken(view.from, view.to, shown(view.total, unit), shown(view.goal, unit), view.percent)} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' }}>
      <Svg width={width} height={height} style={{ position: 'absolute', top: 0, left: 0 }}>
        <Rect width={width} height={height} fill={colors.mapWater} />
        {LAND.map((shape) => (
          <Path key={shape} d={shape} fill={colors.mapLand} transform={placed(ground)} />
        ))}
        <Path d={PARK} fill={colors.mapPark} transform={placed(ground)} />
        <Path d={pathBetween(0, 1)} fill="none" stroke={colors.surface} strokeWidth={10 / fit.scale} strokeLinecap="round" strokeLinejoin="round" transform={placed(fit)} />
        {done < 1 ? <Path d={pathBetween(done, 1)} fill="none" stroke={colors.accent} strokeWidth={4 / fit.scale} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={[1 / fit.scale, 9 / fit.scale]} transform={placed(fit)} /> : null}
        {done > 0 ? <Path d={pathBetween(0, done)} fill="none" stroke={colors.accent} strokeWidth={5 / fit.scale} strokeLinecap="round" strokeLinejoin="round" transform={placed(fit)} /> : null}
      </Svg>

      {view.from ? (
        <Txt variant="tiny" weight={600} numberOfLines={1} style={[label, { left: start.x - 6, top: start.y - 36, color: colors.mapLabel }]}>
          {view.from}
        </Txt>
      ) : null}
      {view.to ? (
        <Txt variant="tiny" weight={600} numberOfLines={1} style={[label, { left: end.x + 22, top: end.y + 18, color: colors.mapLabel }]}>
          {view.to}
        </Txt>
      ) : null}
      {view.stops.map((stop) => {
        const at = onScreen(pointAt(view.goal > 0 ? stop.at / view.goal : 0), fit);
        return <View key={stop.id} style={{ position: 'absolute', left: at.x - 4, top: at.y - 4, width: 8, height: 8, borderRadius: radius.pill, borderWidth: 2, borderColor: stop.reached ? colors.accent : colors.mapLabel, backgroundColor: colors.surface }} />;
      })}
      {view.stops.map((stop) => {
        const at = onScreen(pointAt(view.goal > 0 ? stop.at / view.goal : 0), fit);
        return (
          <Txt key={stop.id} variant="tiny" weight={600} numberOfLines={1} style={{ position: 'absolute', left: at.x + 8, top: at.y - 22, color: colors.mapLabel }}>
            {stop.name}
          </Txt>
        );
      })}

      <Halo at={here} />
      <View style={[pin, { left: start.x, top: start.y, backgroundColor: colors.surface }]}>
        <Txt variant="caption" weight={800} numberOfLines={1}>
          {say.start}
        </Txt>
      </View>
      <View style={[pin, { left: end.x, top: end.y, backgroundColor: colors.accent }]}>
        {view.reached ? <Check size={12} color={colors.onAccent} strokeWidth={3} /> : <Flag size={12} color={colors.onAccent} />}
        <Txt variant="caption" weight={800} numberOfLines={1} style={{ color: colors.onAccent }}>
          {view.reached ? say.reached : (view.to ?? say.end)}
        </Txt>
      </View>
      {view.reached ? null : (
        <View style={[pin, { left: here.x, top: here.y, paddingVertical: 9, paddingHorizontal: 14, backgroundColor: colors.text }]}>
          <Txt variant="callout" weight={800} numberOfLines={1} style={{ color: colors.bg }}>
            {shown(view.total, unit)}
          </Txt>
        </View>
      )}
    </View>
  );
}

/** How a path of the drawing is laid onto the screen. */
const placed = (fit: Fit) => `translate(${fit.left} ${fit.top}) scale(${fit.scale})`;

/** The soft ring around where the crew is now. It breathes outwards, slowly; with Reduce Motion on it stays still. */
function Halo({ at }: { at: { x: number; y: number } }) {
  const { colors } = useTheme();
  const beat = useSharedValue(0.5);
  useEffect(() => {
    beat.set(withRepeat(withTiming(1, { duration: 2400 }), -1, false));
  }, [beat]);
  const breathing = useAnimatedStyle(() => ({ opacity: 0.4 * (1 - beat.get()) + 0.04, transform: [{ scale: 0.55 + 0.8 * beat.get() }] }));
  return <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: at.x - 32, top: at.y - 32, width: 64, height: 64, borderRadius: radius.pill, backgroundColor: colors.accent }, breathing]} />;
}

/**
 * "Add what you walked": a number and the day (today, or one of the last 31 days). Under it, this person's
 * own walks of the last month, each of which can be taken out again when a number was wrong.
 */
function AddSheet({ board, visible, onClose }: { board: Walk; visible: boolean; onClose: () => void }) {
  return (
    <Sheet visible={visible} onClose={onClose} title={say.add.title} subtitle={say.add.lead}>
      {visible ? <Adding board={board} onClose={onClose} /> : null}
    </Sheet>
  );
}

function Adding({ board, onClose }: { board: Walk; onClose: () => void }) {
  const { colors } = useTheme();
  const changes = useBoardChanges(board);
  const removing = useBoardChanges(board);
  const clientId = useRef(newClientId());
  const unit = unitOf(board.view.unit);
  const [typed, setTyped] = useState('');
  const [day, setDay] = useState(today());
  const [picking, setPicking] = useState(false);
  const [tried, setTried] = useState(false);
  const amount = readAmount(typed, unit);

  const add = async () => {
    setTried(true);
    if (amount === null) return;
    if (await changes.add('walk', { amount, day }, clientId.current)) onClose();
  };

  return (
    <View style={{ gap: 12, paddingTop: 6 }}>
      <View style={{ gap: 12, paddingHorizontal: layout.rowGutter }}>
        <Field
          label={unit === 'steps' ? say.add.steps : say.add.km}
          value={typed}
          onChangeText={setTyped}
          keyboardType={unit === 'steps' ? 'number-pad' : 'decimal-pad'}
          autoFocus
          placeholder={unit === 'steps' ? '8,400' : '4.5'}
          error={tried && amount === null ? (unit === 'steps' ? say.add.stepsProblem : say.add.kmProblem) : changes.problem}
        />
        <View style={{ flexDirection: 'row' }}>
          <FieldButton label={say.add.day} value={formatComingDay(day, today())} onPress={() => setPicking(true)} />
        </View>
        <Button label={say.add.save} size="lg" block loading={changes.busy} onPress={() => void add()} />
      </View>
      {board.view.yours.length ? (
        <View>
          <GroupLabel style={{ marginTop: 10, marginHorizontal: layout.gutter }}>{say.yours.title}</GroupLabel>
          {removing.problem ? (
            <Txt variant="caption" color="danger" accessibilityLiveRegion="polite" style={{ paddingHorizontal: layout.gutter, paddingBottom: 6 }}>
              {removing.problem}
            </Txt>
          ) : null}
          {board.view.yours.map((walk) => (
            <View key={walk.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44, paddingVertical: 6, paddingHorizontal: layout.gutter }}>
              <Txt variant="item" weight={600} style={{ flex: 1 }}>
                {shown(walk.amount, unit)}
              </Txt>
              <Txt variant="footnote" color="muted">
                {formatWeekdayPast(walk.day)}
              </Txt>
              <Tap accessibilityRole="button" accessibilityLabel={say.yours.remove(shown(walk.amount, unit), formatWeekdayPast(walk.day))} hitSlop={10} disabled={removing.busy} onPress={() => void removing.remove(walk.id)}>
                <X size={18} color={colors.muted} />
              </Tap>
            </View>
          ))}
        </View>
      ) : null}
      <DayPicker visible={picking} onClose={() => setPicking(false)} title={say.add.day} value={day} min={addDays(today(), -31)} max={today()} onChange={setDay} />
    </View>
  );
}

/** The places along the way: each with how far along it lies. Anyone who may change the board adds one or takes one out. */
function StopsSheet({ board, visible, onClose }: { board: Walk; visible: boolean; onClose: () => void }) {
  return (
    <Sheet visible={visible} onClose={onClose} title={say.stops.title} subtitle={say.stops.lead}>
      {visible ? <Placing board={board} /> : null}
    </Sheet>
  );
}

function Placing({ board }: { board: Walk }) {
  const { colors } = useTheme();
  const changes = useBoardChanges(board);
  const clientId = useRef(newClientId());
  const view = board.view;
  const unit = unitOf(view.unit);
  const [name, setName] = useState('');
  const [typed, setTyped] = useState('');
  const [tried, setTried] = useState(false);
  // A place lies anywhere along the way: further than one walk can be, so it is read as a plain number of the unit.
  const number = Number(typed.trim().replace(/[\s,]/g, ''));
  const at = typed.trim() !== '' && Number.isFinite(number) && number >= 0 ? Math.round(unit === 'steps' ? number : number * 1000) : null;
  const tooFar = at !== null && at > view.goal;

  const add = async () => {
    setTried(true);
    if (at === null || tooFar || !name.trim()) return;
    if (await changes.add('stop', { name: name.trim(), at }, clientId.current)) {
      clientId.current = newClientId();
      setName('');
      setTyped('');
      setTried(false);
    }
  };

  return (
    <View style={{ gap: 12, paddingTop: 4 }}>
      {view.stops.map((stop) => (
        <View key={stop.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44, paddingVertical: 6, paddingHorizontal: layout.gutter }}>
          <MapPin size={18} color={stop.reached ? colors.accentText : colors.muted} />
          <Txt variant="item" weight={600} numberOfLines={1} style={{ flex: 1 }}>
            {stop.name}
          </Txt>
          <Txt variant="footnote" color="muted">
            {say.stops.at(shown(stop.at, unit), stop.reached)}
          </Txt>
          <Tap accessibilityRole="button" accessibilityLabel={say.stops.remove(stop.name)} hitSlop={10} disabled={changes.busy} onPress={() => void changes.remove(stop.id)}>
            <X size={18} color={colors.muted} />
          </Tap>
        </View>
      ))}
      <View style={{ gap: 12, paddingHorizontal: layout.rowGutter }}>
        <Field label={say.stops.name} value={name} onChangeText={setName} maxLength={60} placeholder={say.stops.namePlaceholder} />
        <Field
          label={unit === 'steps' ? say.stops.atSteps : say.stops.atKm}
          value={typed}
          onChangeText={setTyped}
          keyboardType="decimal-pad"
          placeholder={unit === 'steps' ? '50,000' : '490'}
          error={tried && at === null ? say.stops.atProblem : tried && tooFar ? say.stops.tooFar(shown(view.goal, unit)) : changes.problem}
        />
        <Button label={say.stops.add} variant="soft" size="lg" block disabled={!name.trim()} loading={changes.busy} onPress={() => void add()} />
      </View>
    </View>
  );
}

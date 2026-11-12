import { ArrowLeft, ArrowRight, Minus, Plus, SquareCheck, Undo2, Users } from 'lucide-react-native';
import { type ReactNode, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';

import type { MealPlanDay, MealPlanMeal, MealPlanRecipe, MealPlanSettings, MealPlanView } from '@/api/generated/homeport';
import { useCircles } from '@/features/circles/current';
import { membersOf } from '@/features/circles/members';
import { useOpenThing } from '@/features/things/open';
import { addDays, formatRange, formatWeekdayLong, formatWeekdayShort } from '@/lib/dates';
import { newClientId } from '@/lib/ids';
import { layout, radius, useTheme } from '@/theme';
import { Avatar } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { CheckRow } from '@/ui/CheckRow';
import { Emoji } from '@/ui/Emoji';
import { Field } from '@/ui/Field';
import { GroupLabel } from '@/ui/Heading';
import { Tap } from '@/ui/Motion';
import { RowGroup } from '@/ui/Rows';
import { Sheet } from '@/ui/Sheet';
import { Toggle } from '@/ui/Toggle';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

import { BoardFrame, type MenuRow } from '../BoardFrame';
import { AddBar } from '../parts/Bars';
import { PersonChips } from '../parts/People';
import { BoardRow } from '../parts/Rows';
import type { Board, BoardScreenProps } from '../types';
import { useBoardChanges, useBoardPart } from '../useBoard';

type Plan = Board<MealPlanView, MealPlanSettings>;
const say = words.templates.mealPlan;

/**
 * 5.7 The weekly meal plan. Seven days with their dinners and who cooks; the recipes kept on the plan as
 * chips (tap one, then a day, to drop it there: the phone's stand-in for dragging); and the two rows that
 * make it do work: ingredients go to the shopping list, minus what was ticked as at home, and how many it
 * cooks for. A dinner opens its ingredients; another week is in More.
 */
export function MealPlan({ board: opened }: BoardScreenProps<MealPlanView, MealPlanSettings>) {
  const { colors } = useTheme();
  const open = useOpenThing();
  /** A day of the week that is showing, when it isn't this one. */
  const [show, setShow] = useState<string | undefined>(undefined);
  const { board, problem: partProblem } = useBoardPart(opened, show);
  const view = board.view;
  const changes = useBoardChanges(board);
  const dropping = useRef(newClientId());

  /** The recipe that was tapped and waits for a day. */
  const [recipe, setRecipe] = useState<MealPlanRecipe | null>(null);
  /** The day a dinner is being written for by hand. */
  const [adding, setAdding] = useState<string | null>(null);
  /** The dinner whose ingredients are open. */
  const [openMeal, setOpenMeal] = useState<string | null>(null);
  const meal = view.days.flatMap((day) => day.meals).find((one) => one.id !== null && one.id === openMeal) ?? null;

  const drop = async (day: string, chosen: MealPlanRecipe) => {
    if (await changes.add('meal', { day, recipeId: chosen.id }, dropping.current)) {
      dropping.current = newClientId();
      setRecipe(null);
    }
  };

  const thisWeek = opened.view.weekStart;
  const menu: MenuRow[] = [
    { icon: (color) => <ArrowRight size={20} color={color} />, label: say.menu.next, onPress: () => setShow(addDays(view.weekStart, 7)) },
    { icon: (color) => <ArrowLeft size={20} color={color} />, label: say.menu.previous, onPress: () => setShow(addDays(view.weekStart, -7)) },
    ...(view.weekStart === thisWeek ? [] : [{ icon: (color: string) => <Undo2 size={20} color={color} />, label: say.menu.thisWeek, onPress: () => setShow(undefined) }]),
  ];

  const groceries = view.groceries;
  return (
    <BoardFrame board={board} title={board.title} subtitle={formatRange(view.weekStart, view.weekEnd)} menu={menu} problem={changes.problem ?? partProblem}>
      {view.days.map((day) => (
        <DayRow
          key={day.day}
          day={day}
          waiting={recipe}
          canEdit={board.canEdit}
          onMeal={(one) => (one.id ? setOpenMeal(one.id) : undefined)}
          onSlot={() => (recipe ? void drop(day.day, recipe) : setAdding(day.day))}
        />
      ))}

      {view.recipes.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10, flexGrow: 0 }} contentContainerStyle={{ gap: 8, paddingHorizontal: layout.barGutter }}>
          {view.recipes.map((one) => {
            const on = recipe?.id === one.id;
            return (
              <Tap
                key={one.id}
                accessibilityRole="button"
                accessibilityLabel={say.recipe.spoken(one.name, on)}
                disabled={!board.canEdit}
                hitSlop={{ top: 6, bottom: 6 }}
                scaleTo={0.94}
                onPress={() => setRecipe(on ? null : one)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 12, borderRadius: radius.photo, backgroundColor: on ? colors.accent : colors.accentSoft }}>
                <Emoji char={one.emoji ?? '🍽️'} size={18} />
                <Txt variant="caption" weight={700} style={{ color: on ? colors.onAccent : colors.accentText }}>
                  {one.name}
                </Txt>
              </Tap>
            );
          })}
        </ScrollView>
      ) : null}
      {recipe ? (
        <Txt variant="footnote" color="muted" accessibilityLiveRegion="polite" style={{ marginTop: 8, marginHorizontal: layout.gutter }}>
          {say.recipe.hint(recipe.name)}
        </Txt>
      ) : null}

      <View style={{ height: 16 }} />
      <RowGroup>
        <BoardRow
          first
          leading={<SquareCheck size={22} color={colors.text} />}
          title={groceries.on ? say.groceries.on(groceries.going) : say.groceries.off(groceries.going)}
          line={groceries.on ? (groceries.atHome ? say.groceries.notAtHome(groceries.atHome) : say.groceries.noneAtHome) : say.groceries.offNote}
          onPress={groceries.listId ? () => open({ kind: 'checklist', id: groceries.listId }) : undefined}
          spoken={say.groceries.open}
          trailing={
            <View style={{ opacity: board.canEdit ? 1 : 0.45 }} pointerEvents={board.canEdit ? 'auto' : 'none'}>
              <Toggle label={say.groceries.toggle} value={groceries.on} onChange={(next) => void changes.set({ toGroceries: next })} />
            </View>
          }
        />
        <BoardRow
          leading={<Users size={22} color={colors.text} />}
          title={say.cookingFor.label}
          trailing={board.canEdit ? <Stepper value={view.cookingFor} min={1} max={30} onChange={(next) => void changes.set({ cookingFor: next })} /> : <Txt variant="item" weight={800}>{view.cookingFor}</Txt>}
        />
      </RowGroup>

      <AddMealSheet board={board} day={adding} onClose={() => setAdding(null)} />
      <MealSheet board={board} meal={meal} onClose={() => setOpenMeal(null)} />
    </BoardFrame>
  );
}

type DayProps = { day: MealPlanDay; waiting: MealPlanRecipe | null; canEdit: boolean; onMeal: (meal: MealPlanMeal) => void; onSlot: () => void };

/** One day: its short name (in the accent colour today), and its dinners, or the place to drop one. */
function DayRow({ day, waiting, canEdit, onMeal, onSlot }: DayProps) {
  const { colors, shadow } = useTheme();
  const weekday = formatWeekdayShort(day.day);
  // With a recipe waiting, every day can take it, also one that has a dinner already.
  const slot = day.meals.length === 0 || waiting !== null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 4, paddingHorizontal: layout.barGutter }}>
      <Txt variant="footnote" weight={800} style={{ width: 36, marginTop: 16, color: day.today ? colors.accentText : colors.muted }}>
        {weekday}
      </Txt>
      <View style={{ flex: 1, gap: 6 }}>
        {day.meals.map((meal, index) => {
          const line = say.mealLine({ tonight: meal.tonight, minutes: meal.minutes, note: meal.note, fromCalendar: meal.fromCalendar });
          return (
            <Tap
              key={meal.id ?? `calendar-${index}`}
              accessibilityRole="button"
              accessibilityLabel={words.common.spoken([formatWeekdayLong(day.day), meal.name, line, meal.cook ? say.meal.cooks(meal.cook.name ?? '') : null])}
              disabled={!meal.id}
              onPress={() => onMeal(meal)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingVertical: 6, paddingLeft: 12, paddingRight: 10, borderRadius: radius.field, backgroundColor: colors.surface, boxShadow: shadow.sm }}>
              <Emoji char={meal.emoji ?? (meal.fromCalendar ? '📅' : '🍽️')} size={29} />
              <View style={{ flex: 1 }}>
                <Txt variant="control" numberOfLines={1}>
                  {meal.name}
                </Txt>
                {line ? (
                  <Txt variant="small" weight={500} color="muted" numberOfLines={1}>
                    {line}
                  </Txt>
                ) : null}
              </View>
              {meal.cook ? <Avatar uri={meal.cook.avatarUrl} name={meal.cook.name ?? ''} size={26} /> : null}
            </Tap>
          );
        })}
        {slot ? (
          <Tap
            accessibilityRole="button"
            accessibilityLabel={words.common.spoken([formatWeekdayLong(day.day), waiting ? say.slotFor(waiting.name) : say.slot])}
            disabled={!canEdit}
            onPress={onSlot}
            style={{ alignItems: 'center', justifyContent: 'center', minHeight: 48, paddingVertical: 6, paddingHorizontal: 12, borderRadius: radius.field, borderWidth: 1.5, borderColor: waiting ? colors.accent : colors.fill2 }}>
            <Txt variant="caption" weight={700} color="muted" numberOfLines={1}>
              {waiting ? say.slotFor(waiting.name) : say.slot}
            </Txt>
          </Tap>
        ) : null}
      </View>
    </View>
  );
}

/** A number with a minus and a plus beside it, in one soft pill. */
function Stepper({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (next: number) => void }) {
  const { colors, shadow } = useTheme();
  const knob = (label: string, next: number, icon: ReactNode) => {
    const off = next < min || next > max;
    return (
      <Tap
        accessibilityRole="button"
        accessibilityLabel={label}
        disabled={off}
        hitSlop={9}
        scaleTo={0.9}
        onPress={() => onChange(next)}
        style={{ width: 26, height: 26, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg, boxShadow: shadow.knob, opacity: off ? 0.4 : 1 }}>
        {icon}
      </Tap>
    );
  };
  return (
    <View accessible accessibilityLabel={say.cookingFor.spoken(value)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 5, borderRadius: radius.field, backgroundColor: colors.fill }}>
      {knob(say.cookingFor.fewer, value - 1, <Minus size={14} color={colors.text} strokeWidth={2.6} />)}
      <Txt variant="item" weight={800}>
        {value}
      </Txt>
      {knob(say.cookingFor.more, value + 1, <Plus size={14} color={colors.text} strokeWidth={2.6} />)}
    </View>
  );
}

/** A dinner written by hand for one day: what it is, how long it takes, who cooks, what it needs. */
function AddMealSheet({ board, day, onClose }: { board: Plan; day: string | null; onClose: () => void }) {
  return (
    <Sheet visible={day !== null} onClose={onClose} title={day ? say.add.title(formatWeekdayLong(day)) : undefined}>
      {day ? <AddMeal key={day} board={board} day={day} onClose={onClose} /> : null}
    </Sheet>
  );
}

function AddMeal({ board, day, onClose }: { board: Plan; day: string; onClose: () => void }) {
  const circle = useCircles().find((one) => one.id === board.circleId);
  const people = circle ? membersOf(circle).filter((member) => member.kind !== 'pet') : [];
  const changes = useBoardChanges(board);
  const clientId = useRef(newClientId());
  const [name, setName] = useState('');
  const [minutes, setMinutes] = useState('');
  const [cook, setCook] = useState<string | null>(null);
  const [ingredients, setIngredients] = useState('');
  const [keep, setKeep] = useState(false);

  const save = async () => {
    const needs = ingredients.split('\n').map((line) => line.trim()).filter(Boolean);
    const took = Number.parseInt(minutes, 10);
    const fields = { name: name.trim(), minutes: Number.isFinite(took) ? took : undefined, ingredients: needs };
    if (!(await changes.add('meal', { ...fields, day, cookMemberId: cook ?? undefined }, clientId.current))) return;
    // Kept as a recipe too, it can be dropped onto any day of any week.
    if (keep) await changes.add('recipe', fields);
    onClose();
  };

  return (
    <View style={{ gap: 12, paddingTop: 6 }}>
      <View style={{ gap: 12, paddingHorizontal: layout.rowGutter }}>
        <Field label={say.add.name} value={name} onChangeText={setName} maxLength={120} autoFocus returnKeyType="next" error={changes.problem} />
        <Field label={say.add.minutes} value={minutes} onChangeText={(typed) => setMinutes(typed.replace(/[^0-9]/g, ''))} keyboardType="number-pad" maxLength={4} />
      </View>
      {people.length ? (
        <View>
          <GroupLabel style={{ marginTop: 4, marginHorizontal: layout.gutter }}>{say.add.cook}</GroupLabel>
          <PersonChips inset people={people} value={cook} onChange={(id) => setCook(id === cook ? null : id)} />
        </View>
      ) : null}
      <View style={{ gap: 12, paddingHorizontal: layout.rowGutter }}>
        <Field label={say.add.ingredients} value={ingredients} onChangeText={setIngredients} multiline note={say.add.ingredientsNote} />
        <CheckRow label={say.add.keep} checked={keep} onChange={setKeep} />
        <Button label={say.add.save} size="lg" block disabled={!name.trim()} loading={changes.busy} onPress={() => void save()} />
      </View>
    </View>
  );
}

/** A dinner, opened: who cooks, what it needs with a tick for what is at home already, and the way to take it off the plan. */
function MealSheet({ board, meal, onClose }: { board: Plan; meal: MealPlanMeal | null; onClose: () => void }) {
  const ticking = useBoardChanges(board);
  const adding = useBoardChanges(board);
  const removing = useBoardChanges(board);
  const mealId = meal?.id ?? null;
  if (!meal || !mealId) {
    return (
      <Sheet visible={false} onClose={onClose}>
        {null}
      </Sheet>
    );
  }
  const line = words.common.join([say.mealLine({ tonight: meal.tonight, minutes: meal.minutes, note: meal.note, fromCalendar: false }), meal.cook ? say.meal.cooks(meal.cook.name ?? '') : say.meal.nobodyCooks]);
  return (
    <Sheet
      visible
      onClose={onClose}
      title={meal.name}
      subtitle={line}
      footer={board.canEdit ? <AddBar placeholder={say.meal.addIngredient} busy={adding.busy} problem={adding.problem} maxLength={120} onSubmit={async (text) => (await adding.add('ingredient', { mealId, name: text })) !== null} /> : undefined}>
      <GroupLabel style={{ marginTop: 6, marginHorizontal: layout.gutter }}>{say.meal.ingredients}</GroupLabel>
      {meal.ingredients.length === 0 ? (
        <Txt variant="callout" color="muted" style={{ paddingHorizontal: layout.gutter }}>
          {say.meal.noIngredients}
        </Txt>
      ) : (
        <View style={{ gap: 14, paddingHorizontal: layout.gutter, paddingTop: 4 }}>
          {meal.ingredients.map((ingredient) => (
            <View key={ingredient.id} style={{ opacity: board.canEdit ? 1 : 0.6 }} pointerEvents={board.canEdit ? 'auto' : 'none'}>
              <CheckRow
                label={ingredient.name}
                checked={ingredient.atHome}
                onChange={(next) => void ticking.change(ingredient.id, { atHome: next })}
                note={
                  ingredient.atHome ? (
                    <Txt variant="footnote" color="muted">
                      {say.meal.atHome}
                    </Txt>
                  ) : undefined
                }
              />
            </View>
          ))}
        </View>
      )}
      {ticking.problem || removing.problem ? (
        <Txt variant="caption" color="danger" accessibilityLiveRegion="polite" style={{ paddingTop: 10, paddingHorizontal: layout.gutter }}>
          {ticking.problem ?? removing.problem}
        </Txt>
      ) : null}
      <Txt variant="footnote" color="muted" style={{ paddingTop: 14, paddingHorizontal: layout.gutter }}>
        {say.meal.atHomeNote}
      </Txt>
      {board.canEdit ? (
        <View style={{ paddingHorizontal: layout.rowGutter, paddingTop: 14, paddingBottom: 12 }}>
          <Button label={say.meal.remove} variant="soft" block loading={removing.busy} onPress={() => void removing.remove(mealId).then((gone) => (gone ? onClose() : undefined))} />
        </View>
      ) : null}
    </Sheet>
  );
}

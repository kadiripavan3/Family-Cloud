package app.homeport.api.board.templates;

import app.homeport.api.board.BoardRules;
import app.homeport.api.board.BoardStore;
import app.homeport.api.board.EntryDraft;
import app.homeport.api.board.EntryRow;
import app.homeport.api.board.Fields;
import app.homeport.api.board.Scene;
import app.homeport.api.board.Template;
import app.homeport.api.board.Words;
import app.homeport.api.common.ApiProblem;
import app.homeport.api.common.Keyset;
import app.homeport.api.home.TodaySource.TodayItem;
import app.homeport.api.list.ChecklistService;
import app.homeport.api.list.ChecklistService.ChecklistResponse;
import app.homeport.api.list.ChecklistService.ItemResponse;
import app.homeport.api.list.ChecklistService.NewItem;
import app.homeport.api.thing.Audience;
import app.homeport.api.thing.ThingKind;
import app.homeport.api.thing.ThingService.PersonBrief;
import app.homeport.api.thing.ThingStore;
import app.homeport.api.thing.ThingStore.ThingRow;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Component;

/**
 * The weekly meal plan: a week of meals, each with a cook and its ingredients, and the plan writes the
 * shopping list.
 *
 * <p><b>The shopping list.</b> Every ingredient that isn't ticked "at home" becomes one line on the circle's
 * shopping checklist, through the checklist service, so it is an ordinary line anyone can tick in the shop.
 * Each ingredient is written once (the line is made with an id worked out from the ingredient, so doing it
 * again adds nothing). When a meal goes, or an ingredient is ticked "at home", its line is taken off again,
 * but only while it is still unticked: what someone already bought stays bought. Only this week's meals and
 * later ones are looked at; last week's lines are left alone.
 *
 * <p>The list is the one named in the settings. Without one, the plan looks for a checklist called
 * "Groceries" or "Shopping" that the person may change; when there is none, it makes "Groceries" for the
 * person who made the plan, shared as the plan is. A person who may not change the list can still plan
 * meals; the lines are written the next time someone who may changes the plan.
 *
 * <p>Nothing here is secret: everyone who sees the plan sees all of it.
 */
@Component
class MealPlan implements BoardRules {

    static final String MEAL = "meal";
    static final String INGREDIENT = "ingredient";
    static final String RECIPE = "recipe";
    private static final int MAX_INGREDIENTS = 40;

    // ---------- what is stored ----------

    record MealPlanSettings(
            @Schema(description = "How many people the meals are for")
            int cookingFor,

            @Schema(description = "True while ingredients go to the shopping list")
            boolean toGroceries,

            @Schema(nullable = true, description = "The checklist the plan writes to")
            UUID groceriesListId) {}

    record Meal(String name, String emoji, Integer minutes, String note) {}

    /** @param itemId the line on the shopping list this ingredient was written as, while there is one */
    record Ingredient(String name, UUID itemId) {}

    record Recipe(String name, String emoji, Integer minutes, String note, List<String> ingredients) {
        Recipe {
            ingredients = ingredients == null ? List.of() : List.copyOf(ingredients);
        }
    }

    // ---------- what a person sees ----------

    record MealPlanView(
            @Schema(description = "The Monday of the week shown")
            LocalDate weekStart,

            LocalDate weekEnd,

            @Schema(description = "Seven days, Monday first")
            List<MealPlanDay> days,

            @Schema(description = "Recipes kept on the plan, to drop onto a day. Fifty at most.")
            List<MealPlanRecipe> recipes,

            MealPlanGroceries groceries,
            int cookingFor) {}

    record MealPlanDay(LocalDate day, boolean today, List<MealPlanMeal> meals) {}

    record MealPlanMeal(
            @Schema(nullable = true, description = "Null for a dinner that comes from the calendar")
            UUID id,

            String name,
            @Schema(nullable = true) String emoji,
            @Schema(nullable = true) Integer minutes,
            @Schema(nullable = true) String note,
            @Schema(nullable = true) PersonBrief cook,

            @Schema(description = "True for a meal on the viewer's today")
            boolean tonight,

            @Schema(description = "True for a dinner that comes from the calendar, not from the plan")
            boolean fromCalendar,

            List<MealPlanIngredient> ingredients) {}

    record MealPlanIngredient(
            UUID id,
            String name,
            boolean atHome,

            @Schema(description = "True while it has a line on the shopping list")
            boolean onList) {}

    record MealPlanRecipe(
            UUID id,
            String name,
            @Schema(nullable = true) String emoji,
            @Schema(nullable = true) Integer minutes,
            @Schema(nullable = true) String note,
            List<String> ingredients) {}

    record MealPlanGroceries(
            @Schema(nullable = true, description = "The checklist the plan writes to, once there is one")
            UUID listId,

            @Schema(description = "True while ingredients go to the shopping list")
            boolean on,

            @Schema(description = "How many of the week's ingredients are needed: what goes to the list while it is on")
            int going,

            @Schema(description = "How many were ticked as at home")
            int atHome) {}

    private final ChecklistService lists;
    private final ThingStore things;
    private final BoardStore boards;
    private final ObjectProvider<CalendarDinners> calendars;

    MealPlan(ChecklistService lists, ThingStore things, BoardStore boards, ObjectProvider<CalendarDinners> calendars) {
        this.lists = lists;
        this.things = things;
        this.boards = boards;
        this.calendars = calendars;
    }

    @Override
    public Template template() {
        return Template.MEAL_PLAN;
    }

    @Override
    public Class<?> settingsType() {
        return MealPlanSettings.class;
    }

    @Override
    public Class<?> viewType() {
        return MealPlanView.class;
    }

    @Override
    public List<String> guide() {
        return List.of(
                "settings: cookingFor (1 to 30), toGroceries (true or false), groceriesListId (a checklist you may change)",
                "entry meal: day (date), name, emoji, minutes, note, cookMemberId, ingredients (a list of names, when"
                        + " adding), recipeId (when adding: copies a kept recipe onto the day)",
                "entry ingredient: mealId (when adding), name, atHome (true or false)",
                "entry recipe: name, emoji, minutes, note, ingredients (a list of names)",
                "show: any day of the week to show, as a date. Left out: this week.");
    }

    static LocalDate monday(LocalDate day) {
        return day.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
    }

    // ---------- settings ----------

    @Override
    public Object settings(Scene scene, Fields sent) {
        MealPlanSettings now = scene.isNew()
                ? new MealPlanSettings(Math.max(1, scene.humans().size()), true, null)
                : scene.settings(MealPlanSettings.class);
        UUID list = sent.id("groceriesListId", now.groceriesListId());
        if (list != null && !list.equals(now.groceriesListId())) {
            ChecklistResponse chosen = reach(list, scene.me().userId());
            if (chosen == null || !chosen.canEdit() || !chosen.circleId().equals(scene.circleId())) {
                throw ApiProblem.badRequest("not_your_list", "Choose a list in this circle that you can change.");
            }
        }
        MealPlanSettings kept = new MealPlanSettings(
                sent.count("cookingFor", 1, 30, now.cookingFor()), sent.flag("toGroceries", now.toGroceries()), list);
        if (!scene.isNew()) {
            scene.saveSettings(kept);
            writeShoppingList(scene);
        }
        return scene.isNew() ? kept : scene.settings(MealPlanSettings.class);
    }

    // ---------- what a person sees ----------

    @Override
    public Object view(Scene scene, String show) {
        LocalDate monday = monday(shown(scene, show));
        LocalDate sunday = monday.plusDays(6);
        MealPlanSettings settings = scene.settings(MealPlanSettings.class);
        Map<UUID, List<EntryRow>> ingredients = scene.entries(INGREDIENT).stream()
                .filter(i -> i.parentId() != null)
                .collect(Collectors.groupingBy(EntryRow::parentId));
        List<EntryRow> meals = scene.entries(MEAL).stream()
                .filter(m ->
                        m.day() != null && !m.day().isBefore(monday) && !m.day().isAfter(sunday))
                .toList();
        List<CalendarDinners.Dinner> dinners = new ArrayList<>();
        if (scene.me() != null) {
            calendars
                    .orderedStream()
                    .forEach(c -> dinners.addAll(
                            c.between(scene.circleId(), scene.me().userId(), monday, sunday)));
        }
        List<MealPlanDay> days = new ArrayList<>();
        int going = 0;
        int atHome = 0;
        for (LocalDate day = monday; !day.isAfter(sunday); day = day.plusDays(1)) {
            LocalDate on = day;
            boolean today = on.equals(scene.today());
            List<MealPlanMeal> shown = new ArrayList<>();
            for (EntryRow row : meals.stream().filter(m -> m.day().equals(on)).toList()) {
                Meal meal = row.as(Meal.class);
                List<MealPlanIngredient> its = ingredients.getOrDefault(row.id(), List.of()).stream()
                        .map(i -> {
                            Ingredient ingredient = i.as(Ingredient.class);
                            return new MealPlanIngredient(
                                    i.id(), ingredient.name(), i.done(), ingredient.itemId() != null);
                        })
                        .toList();
                atHome += (int) its.stream().filter(MealPlanIngredient::atHome).count();
                going += (int) its.stream().filter(i -> !i.atHome()).count();
                shown.add(new MealPlanMeal(
                        row.id(),
                        meal.name(),
                        meal.emoji(),
                        meal.minutes(),
                        meal.note(),
                        scene.brief(row.forId()),
                        today,
                        false,
                        its));
            }
            dinners.stream()
                    .filter(d -> d.day().equals(on))
                    .forEach(d -> shown.add(
                            new MealPlanMeal(null, d.title(), null, null, null, null, today, true, List.of())));
            days.add(new MealPlanDay(on, today, shown));
        }
        return new MealPlanView(
                monday,
                sunday,
                days,
                scene.entries(RECIPE).stream()
                        .limit(50)
                        .map(r -> {
                            Recipe recipe = r.as(Recipe.class);
                            return new MealPlanRecipe(
                                    r.id(),
                                    recipe.name(),
                                    recipe.emoji(),
                                    recipe.minutes(),
                                    recipe.note(),
                                    recipe.ingredients());
                        })
                        .toList(),
                new MealPlanGroceries(settings.groceriesListId(), settings.toGroceries(), going, atHome),
                settings.cookingFor());
    }

    /** The day whose week is shown: the one asked for, or today. */
    private static LocalDate shown(Scene scene, String show) {
        if (show == null) {
            return scene.today();
        }
        try {
            return LocalDate.parse(show);
        } catch (RuntimeException notADay) {
            throw ApiProblem.badRequest("invalid_show", "Choose a week by one of its days.");
        }
    }

    @Override
    public String findable(Scene scene, EntryRow entry) {
        return switch (entry.kind()) {
            case MEAL -> {
                Meal meal = entry.as(Meal.class);
                yield meal.name() + (meal.note() == null ? "" : " · " + meal.note());
            }
            case INGREDIENT -> entry.as(Ingredient.class).name();
            case RECIPE -> {
                Recipe recipe = entry.as(Recipe.class);
                yield recipe.name() + " · " + String.join(", ", recipe.ingredients());
            }
            default -> null;
        };
    }

    // ---------- changing it ----------

    @Override
    public UUID add(Scene scene, String kind, Fields sent, UUID clientId) {
        UUID id = switch (kind) {
            case MEAL -> addMeal(scene, sent, clientId);
            case INGREDIENT -> {
                EntryRow meal = scene.need(sent.id("mealId"));
                if (!meal.is(MEAL)) {
                    throw Scene.entryGone();
                }
                if (scene.under(meal.id()).size() >= MAX_INGREDIENTS) {
                    throw ApiProblem.conflict(
                            "too_many", "That's a lot of ingredients for one meal. Forty is the most.");
                }
                yield scene.add(
                        EntryDraft.of(INGREDIENT)
                                .under(meal.id())
                                .by(scene.myId())
                                .doc(new Ingredient(sent.need("name", 120, "Write what the meal needs."), null))
                                .done(Boolean.TRUE.equals(sent.flag("atHome")) ? scene.now() : null, scene.myId()),
                        clientId);
            }
            case RECIPE ->
                scene.add(
                        EntryDraft.of(RECIPE)
                                .by(scene.myId())
                                .doc(recipe(sent, new Recipe(null, null, null, null, null))),
                        clientId);
            default -> throw BoardRules.unknownKind();
        };
        writeShoppingList(scene);
        return id;
    }

    private UUID addMeal(Scene scene, Fields sent, UUID clientId) {
        LocalDate day = sent.day("day");
        if (day == null) {
            throw ApiProblem.badRequest("missing_day", "Choose the day for this meal.");
        }
        Recipe from = new Recipe(null, null, null, null, null);
        UUID recipeId = sent.id("recipeId");
        if (recipeId != null) {
            EntryRow recipe = scene.need(recipeId);
            if (!recipe.is(RECIPE)) {
                throw Scene.entryGone();
            }
            from = recipe.as(Recipe.class);
        }
        List<String> ingredients = sent.texts("ingredients", MAX_INGREDIENTS, 120);
        UUID id = scene.add(
                EntryDraft.of(MEAL)
                        .by(scene.myId())
                        .forMember(scene.inCircle(sent.id("cookMemberId")))
                        .day(day)
                        .position(scene.positionOn(day))
                        .doc(meal(sent, new Meal(from.name(), from.emoji(), from.minutes(), from.note()))),
                clientId);
        int n = 0;
        for (String name : ingredients == null ? from.ingredients() : ingredients) {
            scene.add(
                    EntryDraft.of(INGREDIENT).under(id).by(scene.myId()).doc(new Ingredient(name, null)),
                    Scene.derivedId(clientId, "ingredient " + n++));
        }
        return id;
    }

    private static Meal meal(Fields sent, Meal now) {
        String name = sent.text("name", 120, now.name());
        if (name == null) {
            throw ApiProblem.badRequest("missing_name", "Write what the meal is.");
        }
        Long minutes = sent.whole(
                "minutes", 0, 1440, now.minutes() == null ? null : now.minutes().longValue());
        return new Meal(
                name,
                sent.text("emoji", 16, now.emoji()),
                minutes == null ? null : minutes.intValue(),
                sent.text("note", 200, now.note()));
    }

    private static Recipe recipe(Fields sent, Recipe now) {
        String name = sent.text("name", 120, now.name());
        if (name == null) {
            throw ApiProblem.badRequest("missing_name", "Give the recipe a name.");
        }
        Long minutes = sent.whole(
                "minutes", 0, 1440, now.minutes() == null ? null : now.minutes().longValue());
        List<String> ingredients = sent.texts("ingredients", MAX_INGREDIENTS, 120);
        return new Recipe(
                name,
                sent.text("emoji", 16, now.emoji()),
                minutes == null ? null : minutes.intValue(),
                sent.text("note", 200, now.note()),
                ingredients == null ? now.ingredients() : ingredients);
    }

    @Override
    public void change(Scene scene, EntryRow entry, Fields sent) {
        switch (entry.kind()) {
            case MEAL -> {
                LocalDate day = sent.day("day", entry.day());
                if (day == null) {
                    throw ApiProblem.badRequest("missing_day", "Choose the day for this meal.");
                }
                scene.save(
                        entry,
                        EntryDraft.from(entry)
                                .day(day)
                                .position(day.equals(entry.day()) ? entry.position() : scene.positionOn(day))
                                .forMember(scene.inCircle(sent.id("cookMemberId", entry.forId())))
                                .doc(meal(sent, entry.as(Meal.class))));
            }
            case INGREDIENT -> {
                Ingredient now = entry.as(Ingredient.class);
                boolean atHome = sent.flag("atHome", entry.done());
                scene.save(
                        entry,
                        EntryDraft.from(entry)
                                .doc(new Ingredient(sent.text("name", 120, now.name()), now.itemId()))
                                .done(
                                        atHome ? (entry.done() ? entry.doneAt() : scene.now()) : null,
                                        atHome ? scene.myId() : null));
            }
            case RECIPE -> scene.save(entry, EntryDraft.from(entry).doc(recipe(sent, entry.as(Recipe.class))));
            default -> throw BoardRules.unknownKind();
        }
        writeShoppingList(scene);
    }

    @Override
    public void remove(Scene scene, EntryRow entry) {
        // What this meal or ingredient put on the shopping list comes off again, unless someone already ticked it.
        List<EntryRow> going =
                entry.is(MEAL) ? scene.under(entry.id()) : entry.is(INGREDIENT) ? List.of(entry) : List.of();
        takeOffTheList(scene, going);
        scene.remove(entry.id());
    }

    // ---------- the shopping list ----------

    /**
     * Makes the shopping list agree with the plan, for this week's meals and later ones: a line for every
     * ingredient that is needed and has none, and no line (while it is unticked) for one that is at home or
     * while the switch is off.
     */
    private void writeShoppingList(Scene scene) {
        if (scene.me() == null) {
            return;
        }
        MealPlanSettings settings = scene.settings(MealPlanSettings.class);
        LocalDate from = monday(scene.today());
        Map<UUID, EntryRow> meals = scene.entries(MEAL).stream()
                .filter(m -> m.day() != null && !m.day().isBefore(from))
                .collect(Collectors.toMap(EntryRow::id, Function.identity()));
        List<EntryRow> ingredients = scene.entries(INGREDIENT).stream()
                .filter(i -> meals.containsKey(i.parentId()))
                .toList();
        List<EntryRow> toWrite = ingredients.stream()
                .filter(i -> settings.toGroceries()
                        && !i.done()
                        && i.as(Ingredient.class).itemId() == null)
                .toList();
        List<EntryRow> toTakeOff = ingredients.stream()
                .filter(i -> (!settings.toGroceries() || i.done())
                        && i.as(Ingredient.class).itemId() != null)
                .toList();
        takeOffTheList(scene, toTakeOff);
        if (toWrite.isEmpty()) {
            return;
        }
        ChecklistResponse list = shoppingList(scene, true);
        if (list == null) {
            return;
        }
        UUID user = scene.me().userId();
        int room = 500 - list.items().size();
        for (EntryRow ingredient : toWrite) {
            if (room-- <= 0) {
                return; // the list is full; what is left is written when there is room again
            }
            EntryRow meal = meals.get(ingredient.parentId());
            String name = ingredient.as(Ingredient.class).name();
            ItemResponse line = lists.add(
                    list.id(),
                    user,
                    new NewItem(
                            name,
                            "For " + meal.as(Meal.class).name() + ", " + Words.weekday(meal.day()),
                            null,
                            null,
                            null),
                    Scene.derivedId(ingredient.id(), "on the shopping list"));
            scene.save(ingredient, EntryDraft.from(ingredient).doc(new Ingredient(name, line.id())));
        }
    }

    /** Takes these ingredients' lines off the shopping list, each only while nobody has ticked it. */
    private void takeOffTheList(Scene scene, List<EntryRow> ingredients) {
        List<EntryRow> written = ingredients.stream()
                .filter(i -> i.as(Ingredient.class).itemId() != null)
                .toList();
        if (written.isEmpty() || scene.me() == null) {
            return;
        }
        ChecklistResponse list = shoppingList(scene, false);
        if (list == null) {
            return;
        }
        Set<UUID> unticked = list.items().stream()
                .filter(line -> !line.done())
                .map(ItemResponse::id)
                .collect(Collectors.toSet());
        for (EntryRow ingredient : written) {
            Ingredient now = ingredient.as(Ingredient.class);
            if (unticked.contains(now.itemId())) {
                lists.remove(now.itemId(), scene.me().userId());
            }
            scene.save(ingredient, EntryDraft.from(ingredient).doc(new Ingredient(now.name(), null)));
        }
    }

    /**
     * The checklist the plan writes to, when this person may change it; null when they may not. With no list
     * chosen (or when the chosen one was deleted) it is looked for by name, and made when asked to.
     */
    private ChecklistResponse shoppingList(Scene scene, boolean makeOne) {
        MealPlanSettings settings = scene.settings(MealPlanSettings.class);
        UUID user = scene.me().userId();
        if (settings.groceriesListId() != null) {
            ChecklistResponse chosen = reach(settings.groceriesListId(), user);
            if (chosen != null) {
                return chosen.canEdit() ? chosen : null;
            }
            if (boards.thingExists(settings.groceriesListId())) {
                return null; // it is there, but not shared with this person
            }
        }
        UUID found = null;
        for (String name : List.of("Groceries", "Shopping")) {
            found = things.list(scene.circleId(), user, ThingKind.CHECKLIST, null, name, Keyset.first(10)).stream()
                    .filter(ThingRow::canEdit)
                    .min(Comparator.comparing(ThingRow::createdAt))
                    .map(ThingRow::id)
                    .orElse(found);
            if (found != null) {
                break;
            }
        }
        if (found == null && makeOne && scene.mine()) {
            // Only for whoever made the plan, so nobody ends up with a private shopping list of the plan's. It is
            // shared like the plan is; "some people" can't be copied from here, so then it starts as their own.
            Audience like = scene.audience() == Audience.SOME ? Audience.ME : scene.audience();
            found = lists.create(
                            user,
                            scene.circleId(),
                            "Groceries",
                            like,
                            List.of(),
                            Scene.derivedId(scene.boardId(), "shopping list"))
                    .id();
        }
        if (found == null) {
            return null;
        }
        scene.saveSettings(new MealPlanSettings(settings.cookingFor(), settings.toGroceries(), found));
        return reach(found, user);
    }

    /** A checklist as this person sees it, or null when it isn't there for them. */
    private ChecklistResponse reach(UUID listId, UUID user) {
        try {
            return lists.get(listId, user);
        } catch (ApiProblem notThere) {
            return null;
        }
    }

    // ---------- what it brings to the rest ----------

    private List<EntryRow> mealsOn(Scene scene, LocalDate day) {
        return scene.entries(MEAL).stream().filter(m -> day.equals(m.day())).toList();
    }

    @Override
    public String glance(Scene scene) {
        List<EntryRow> tonight = mealsOn(scene, scene.today());
        if (!tonight.isEmpty()) {
            return "Tonight: " + tonight.get(0).as(Meal.class).name();
        }
        LocalDate monday = monday(scene.today());
        long week = scene.entries(MEAL).stream()
                .filter(m ->
                        m.day() != null && !m.day().isBefore(monday) && m.day().isBefore(monday.plusDays(7)))
                .count();
        return week == 0 ? "Nothing planned this week" : Words.count(week, "dinner") + " this week";
    }

    @Override
    public List<TodayItem> today(Scene scene) {
        return mealsOn(scene, scene.today()).stream()
                .map(row -> {
                    Meal meal = row.as(Meal.class);
                    String who = row.forId() == null ? "Dinner tonight" : scene.firstName(row.forId()) + " is cooking";
                    return new TodayItem(
                            scene.boardId(),
                            ThingKind.BOARD,
                            meal.name(),
                            meal.minutes() == null ? who : who + " · " + meal.minutes() + " min",
                            null,
                            null,
                            1440,
                            scene.avatars(row.forId()));
                })
                .toList();
    }

    @Override
    public String guest(Scene scene) {
        LocalDate monday = monday(scene.today());
        String week = scene.entries(MEAL).stream()
                .filter(m ->
                        m.day() != null && !m.day().isBefore(monday) && m.day().isBefore(monday.plusDays(7)))
                .sorted(Comparator.comparing(EntryRow::day))
                .map(m -> Words.weekday(m.day()) + ": " + m.as(Meal.class).name()
                        + (m.forId() == null ? "" : " (" + scene.firstName(m.forId()) + " cooks)"))
                .collect(Collectors.joining("\n"));
        return week.isEmpty() ? "Nothing is planned this week." : week;
    }
}

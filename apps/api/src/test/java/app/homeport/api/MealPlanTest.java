package app.homeport.api;

import static org.assertj.core.api.Assertions.assertThat;

import com.jayway.jsonpath.JsonPath;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.temporal.TemporalAdjusters;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;

/** The weekly meal plan: a week of meals, and a shopping list the plan writes and tidies by itself. */
class MealPlanTest extends BoardTest {

    private static final LocalDate TODAY = LocalDate.now(ZoneOffset.UTC);

    private List<String> lines(String token, String list) throws Exception {
        return JsonPath.read(fetch("/v1/checklists/" + list, token), "$.items[*].text");
    }

    private String ingredient(String token, String plan, String name) throws Exception {
        return JsonPath.<List<String>>read(
                        view(token, plan), "$.view.days[*].meals[*].ingredients[?(@.name == '" + name + "')].id")
                .get(0);
    }

    @Test
    void thePlanWritesTheShoppingListOnceAndTakesBackWhatIsNoLongerNeededUnlessItWasBought() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String circle = circle(nora, "couple", "Nora and Alex");
        String alexId = join(nora, circle, alex);
        String plan = board(nora, circle, "meal_plan", null, "{\"cookingFor\":2}");

        // A meal with three ingredients: three lines on a list called Groceries, made because there was none.
        String added = add(
                nora,
                plan,
                "meal",
                "{\"day\":\"%s\",\"name\":\"Tacos\",\"emoji\":\"🌮\",\"minutes\":30,\"cookMemberId\":\"%s\",\"ingredients\":[\"Tortillas\",\"Black beans\",\"Cheddar\"]}"
                        .formatted(TODAY, alexId),
                201);
        String tacos = JsonPath.read(added, "$.entryId");
        String list = JsonPath.read(added, "$.board.settings.groceriesListId");
        assertThat(JsonPath.<String>read(fetch("/v1/checklists/" + list, alex), "$.title"))
                .isEqualTo("Groceries");
        assertThat(lines(alex, list)).containsExactly("Tortillas", "Black beans", "Cheddar");
        assertThat(JsonPath.<String>read(fetch("/v1/checklists/" + list, alex), "$.items[0].note"))
                .startsWith("For Tacos, ");
        assertThat(JsonPath.<Integer>read(added, "$.board.view.groceries.going"))
                .isEqualTo(3);
        assertThat(JsonPath.<Integer>read(added, "$.board.view.cookingFor")).isEqualTo(2);
        assertThat(JsonPath.<List<Boolean>>read(added, "$.board.view.days[*].meals[*].ingredients[*].onList"))
                .containsExactly(true, true, true);

        // Changing the meal, or anything else on the plan, writes nothing a second time.
        change(alex, tacos, "{\"note\":\"Alex's turn\"}", 200);
        add(nora, plan, "recipe", "{\"name\":\"Big salad\",\"ingredients\":[\"Lettuce\",\"Feta\"]}");
        assertThat(lines(nora, list)).containsExactly("Tortillas", "Black beans", "Cheddar");

        // "We have beans at home": its line goes, and comes back when that turns out to be wrong.
        String beans = ingredient(nora, plan, "Black beans");
        String athome = change(nora, beans, "{\"atHome\":true}", 200);
        assertThat(lines(nora, list)).containsExactly("Tortillas", "Cheddar");
        assertThat(JsonPath.<Integer>read(athome, "$.view.groceries.going")).isEqualTo(2);
        assertThat(JsonPath.<Integer>read(athome, "$.view.groceries.atHome")).isEqualTo(1);
        change(nora, beans, "{\"atHome\":false}", 200);
        assertThat(lines(nora, list)).containsExactlyInAnyOrder("Tortillas", "Cheddar", "Black beans");

        // One more ingredient on its own, then Alex buys the tortillas.
        add(alex, plan, "ingredient", "{\"mealId\":\"%s\",\"name\":\"Limes\"}".formatted(tacos));
        assertThat(lines(nora, list)).contains("Limes");
        String tortillas = JsonPath.<List<String>>read(
                        fetch("/v1/checklists/" + list, alex), "$.items[?(@.text == 'Tortillas')].id")
                .get(0);
        send(HttpMethod.PATCH, "/v1/checklist-items/" + tortillas, alex, "{\"done\":true}", 200);

        // The meal goes: what nobody bought comes off the list, what was bought stays.
        send(HttpMethod.DELETE, "/v1/board-entries/" + tacos, nora, null, 204);
        assertThat(lines(nora, list)).containsExactly("Tortillas");
        assertThat(JsonPath.<List<Object>>read(view(nora, plan), "$.view.days[*].meals[*]"))
                .isEmpty();
    }

    @Test
    void theSwitchTakesTheLinesOffAndPutsThemBackAndARecipeDropsOntoADay() throws Exception {
        String nora = person("Nora");
        String circle = circle(nora, "solo", "Just me");
        String plan = board(nora, circle, "meal_plan", null, null);
        String recipe = add(
                nora,
                plan,
                "recipe",
                "{\"name\":\"Lentil soup\",\"emoji\":\"🍲\",\"minutes\":40,\"ingredients\":[\"Red lentils\",\"Carrots\"]}");

        // A recipe dropped onto tomorrow brings its name, its time and its ingredients.
        LocalDate day = TODAY.plusDays(1);
        String dropped = add(nora, plan, "meal", "{\"day\":\"%s\",\"recipeId\":\"%s\"}".formatted(day, recipe), 201);
        String list = JsonPath.read(dropped, "$.board.settings.groceriesListId");
        String shown = fetch("/v1/boards/" + plan + "?show=" + day, nora);
        assertThat(JsonPath.<List<String>>read(shown, "$.view.days[*].meals[*].name"))
                .containsExactly("Lentil soup");
        assertThat(JsonPath.<List<Integer>>read(shown, "$.view.days[*].meals[*].minutes"))
                .containsExactly(40);
        assertThat(lines(nora, list)).containsExactly("Red lentils", "Carrots");
        assertThat(JsonPath.<List<String>>read(shown, "$.view.recipes[*].name")).containsExactly("Lentil soup");

        // Off: the unticked lines go. On again: they are back. Each still only once.
        String off = send(HttpMethod.PATCH, "/v1/boards/" + plan, nora, "{\"settings\":{\"toGroceries\":false}}", 200);
        assertThat(JsonPath.<Boolean>read(off, "$.view.groceries.on")).isFalse();
        assertThat(lines(nora, list)).isEmpty();
        send(
                HttpMethod.PATCH,
                "/v1/boards/" + plan,
                nora,
                "{\"settings\":{\"toGroceries\":true,\"cookingFor\":6}}",
                200);
        assertThat(lines(nora, list)).containsExactlyInAnyOrder("Red lentils", "Carrots");
        assertThat(JsonPath.<Integer>read(view(nora, plan), "$.settings.cookingFor"))
                .isEqualTo(6);

        // A list of her own choosing has to be one she can change, in this circle.
        String elsewhere = JsonPath.read(
                send(
                        HttpMethod.POST,
                        "/v1/checklists",
                        nora,
                        "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"title\":\"Other\"}"
                                .formatted(id(), circle(nora, "crew", "Crew")),
                        201),
                "$.id");
        assertThat(send(
                        HttpMethod.PATCH,
                        "/v1/boards/" + plan,
                        nora,
                        "{\"settings\":{\"groceriesListId\":\"%s\"}}".formatted(elsewhere),
                        400))
                .contains("Choose a list in this circle that you can change");
        send(HttpMethod.PATCH, "/v1/boards/" + plan, nora, "{\"settings\":{\"cookingFor\":0}}", 400);
    }

    @Test
    void someoneWhoMayNotChangeTheShoppingListCanStillPlanAndTheLinesFollowLater() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String circle = circle(nora, "family", "The Linds");
        String alexId = join(nora, circle, alex);
        // In a family both start as hers alone; she shares the plan with Alex, but not her shopping list.
        String plan = board(nora, circle, "meal_plan", null, null);
        String list = JsonPath.read(
                send(
                        HttpMethod.POST,
                        "/v1/checklists",
                        nora,
                        "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"title\":\"Groceries\"}".formatted(id(), circle),
                        201),
                "$.id");
        shareWith(nora, plan, alexId, "edit");

        String byAlex = add(
                alex,
                plan,
                "meal",
                "{\"day\":\"%s\",\"name\":\"Pizza\",\"ingredients\":[\"Dough\"]}".formatted(TODAY),
                201);
        assertThat(JsonPath.<List<Boolean>>read(byAlex, "$.board.view.days[*].meals[*].ingredients[*].onList"))
                .containsExactly(false);
        assertThat(lines(nora, list)).isEmpty();
        // No second list was made behind her back.
        assertThat(JsonPath.<Integer>read(fetch("/v1/circles/" + circle + "/checklists", nora), "$.items.length()"))
                .isEqualTo(1);

        // The next time she touches the plan, the existing list called Groceries is found and written.
        add(nora, plan, "meal", "{\"day\":\"%s\",\"name\":\"Soup\",\"ingredients\":[\"Leeks\"]}".formatted(TODAY));
        assertThat(lines(nora, list)).containsExactlyInAnyOrder("Dough", "Leeks");
    }

    @Test
    void theWeekRunsFromMondayTonightIsOnTodayAndAMemberFromElsewhereCantCook() throws Exception {
        String nora = person("Nora");
        String kai = person("Kai");
        String circle = circle(nora, "solo", "Just me");
        String plan = board(nora, circle, "meal_plan", null, null);
        LocalDate monday = TODAY.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
        add(
                nora,
                plan,
                "meal",
                "{\"day\":\"%s\",\"name\":\"Tomato pasta\",\"minutes\":25,\"cookMemberId\":\"%s\"}"
                        .formatted(TODAY, memberOf(nora, circle)));
        add(nora, plan, "meal", "{\"day\":\"%s\",\"name\":\"Next week's roast\"}".formatted(monday.plusDays(8)));

        String week = view(nora, plan);
        assertThat(JsonPath.<String>read(week, "$.view.weekStart")).isEqualTo(monday.toString());
        assertThat(JsonPath.<String>read(week, "$.view.weekEnd"))
                .isEqualTo(monday.plusDays(6).toString());
        assertThat(JsonPath.<Integer>read(week, "$.view.days.length()")).isEqualTo(7);
        assertThat(JsonPath.<List<String>>read(week, "$.view.days[?(@.today == true)].meals[*].name"))
                .containsExactly("Tomato pasta");
        assertThat(JsonPath.<List<Boolean>>read(week, "$.view.days[*].meals[*].tonight"))
                .containsExactly(true);
        assertThat(week).doesNotContain("Next week's roast");
        assertThat(fetch("/v1/boards/" + plan + "?show=" + monday.plusDays(10), nora))
                .contains("Next week's roast");

        // Tonight's dinner is on Today, with its cook; the glance says it; search finds a meal by its name.
        String today = fetch("/v1/circles/" + circle + "/today?day=" + TODAY, nora);
        assertThat(JsonPath.<List<String>>read(today, "$.items[*].title")).containsExactly("Tomato pasta");
        assertThat(JsonPath.<List<String>>read(today, "$.items[*].note")).containsExactly("Nora is cooking · 25 min");
        assertThat(JsonPath.<String>read(fetch("/v1/things/" + plan, nora), "$.glance"))
                .isEqualTo("Tonight: Tomato pasta");
        assertThat(JsonPath.<List<String>>read(
                        fetch("/v1/circles/" + circle + "/search?q=roast", nora), "$.hits[*].snippet"))
                .containsExactly("Next week's roast");

        // A cook has to be someone of this circle; a meal needs a day and a name.
        String elsewhere = memberOf(kai, circle(kai, "solo", "Kai alone"));
        add(
                nora,
                plan,
                "meal",
                "{\"day\":\"%s\",\"name\":\"X\",\"cookMemberId\":\"%s\"}".formatted(TODAY, elsewhere),
                400);
        assertThat(add(nora, plan, "meal", "{\"name\":\"No day\"}", 400)).contains("Choose the day for this meal");
        assertThat(add(nora, plan, "meal", "{\"day\":\"%s\"}".formatted(TODAY), 400))
                .contains("Write what the meal is");
    }
}

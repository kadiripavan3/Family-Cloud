package app.homeport.api;

import static org.assertj.core.api.Assertions.assertThat;

import com.jayway.jsonpath.JsonPath;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;

/** The gallery: every template for every circle, its own kind's first, and what starting one makes. */
class TemplateGalleryTest extends BoardTest {

    private String gallery(String token, String kind) throws Exception {
        return fetch("/v1/circles/" + circle(token, kind, "A " + kind) + "/templates", token);
    }

    private String start(String token, String circle, String template, String body, int expected) throws Exception {
        return send(
                HttpMethod.POST, "/v1/circles/" + circle + "/templates/" + template + "/start", token, body, expected);
    }

    @Test
    void theNumbersOnTheScreensAreTrueOfWhatIsServed() throws Exception {
        String nora = person("Nora");

        // "53 ready to use", "All 53": templates and keepsakes, the same for every kind of circle.
        String family = gallery(nora, "family");
        assertThat(JsonPath.<Integer>read(family, "$.total")).isEqualTo(53);
        assertThat(JsonPath.<Integer>read(family, "$.templates.length()")).isEqualTo(67);
        assertThat(JsonPath.<List<Integer>>read(family, "$.groups[*].count")).containsExactly(36, 17, 14);
        assertThat(JsonPath.<List<String>>read(family, "$.groups[*].group"))
                .containsExactly("templates", "keepsakes", "fair_and_fun");
        assertThat(JsonPath.<List<String>>read(family, "$.topics")).containsExactly("home", "kids", "food");
        // The keepsakes and the fair-and-fun ones the requirements name for a family: eight and seven.
        assertThat(JsonPath.<List<Integer>>read(family, "$.groups[*].yours")).containsExactly(12, 8, 7);

        // "16 templates for couples", "For a flat · 15", "17, from Secret Santa to splitting costs".
        String couple = gallery(nora, "couple");
        assertThat(JsonPath.<Integer>read(couple, "$.yours")).isEqualTo(16);
        assertThat(JsonPath.<Integer>read(couple, "$.total")).isEqualTo(53);
        assertThat(JsonPath.<Integer>read(gallery(nora, "flat"), "$.yours")).isEqualTo(15);
        String crew = gallery(nora, "crew");
        assertThat(JsonPath.<Integer>read(crew, "$.yours")).isEqualTo(17);
        assertThat(JsonPath.<List<String>>read(crew, "$.topics")).containsExactly("trips", "money");

        // What "yours" counts is what is marked as yours among templates and keepsakes.
        assertThat(JsonPath.<List<Object>>read(couple, "$.templates[?(@.yours == true && @.group != 'fair_and_fun')]"))
                .hasSize(16);
    }

    @Test
    void aCircleIsShownItsOwnKindsTemplatesFirstInTheOrderOfItsScreenAndThenAllTheRest() throws Exception {
        String nora = person("Nora");

        assertThat(JsonPath.<List<String>>read(gallery(nora, "family"), "$.templates[0:8].name"))
                .containsExactly(
                        "Weekly meal plan",
                        "Chore wheel",
                        "Packing list",
                        "House manual",
                        "Babysitter notes",
                        "Birthday planner",
                        "Time capsule",
                        "School year");
        String couple = gallery(nora, "couple");
        assertThat(JsonPath.<List<String>>read(couple, "$.templates[0:8].name"))
                .containsExactly(
                        "Date ideas",
                        "Who pays what",
                        "Moving in together",
                        "The wedding",
                        "They mentioned it",
                        "Names",
                        "A weekend away",
                        "Someday");
        assertThat(JsonPath.<List<String>>read(gallery(nora, "flat"), "$.templates[0:8].name"))
                .containsExactly(
                        "Cleaning rota",
                        "Bills by nights",
                        "Move-in photos",
                        "Repair log",
                        "House rules",
                        "Is the sofa free?",
                        "House party",
                        "Moving out");
        assertThat(JsonPath.<List<String>>read(gallery(nora, "crew"), "$.templates[0:8].name"))
                .containsExactly(
                        "When can everyone?",
                        "Secret Santa",
                        "Where next?",
                        "Who brings what",
                        "Split the costs",
                        "A present from all of us",
                        "Games night",
                        "Book club");

        // A couple's own come first, and a family's chore wheel is still there, further down, under All.
        List<Boolean> yours = JsonPath.read(couple, "$.templates[*].yours");
        assertThat(yours.indexOf(false)).isEqualTo(yours.lastIndexOf(true) + 1);
        assertThat(JsonPath.<List<Boolean>>read(couple, "$.templates[?(@.template == 'chore_wheel')].yours"))
                .containsExactly(false);

        // The ten that are built can be started; the other live ones say they are coming.
        assertThat(JsonPath.<List<String>>read(couple, "$.templates[?(@.live == true && @.ready == true)].template"))
                .containsExactlyInAnyOrder(
                        "meal_plan",
                        "chore_wheel",
                        "time_capsule",
                        "open_when",
                        "birthday_interview",
                        "said",
                        "same_spot",
                        "stories",
                        "good_jar",
                        "doorframe");
        assertThat(JsonPath.<List<String>>read(couple, "$.templates[?(@.template == 'both_yes')].note"))
                .containsExactly("Coming with the next update");
        assertThat(JsonPath.<List<Object>>read(couple, "$.templates[?(@.live == false && @.ready == false)]"))
                .isEmpty();
        assertThat(JsonPath.<List<String>>read(couple, "$.templates[?(@.template == 'house_manual')].makes[*]"))
                .containsExactly("Page · House manual", "Checklist · When we go away");
    }

    @Test
    void startingAPlainTemplateMakesItsPagesAndChecklistsOnce() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String circle = circle(nora, "family", "The Linds");
        join(nora, circle, alex);
        String body = "{\"clientId\":\"%s\",\"audience\":\"circle\"}".formatted(id());

        String started = start(nora, circle, "birthday_planner", body, 201);
        String again = start(nora, circle, "birthday_planner", body, 201);

        assertThat(JsonPath.<List<String>>read(started, "$.made[*].title"))
                .containsExactly("Birthday plan", "Party prep", "Gift ideas");
        assertThat(JsonPath.<List<String>>read(started, "$.made[*].kind"))
                .containsExactly("page", "checklist", "checklist");
        assertThat(JsonPath.<List<String>>read(again, "$.made[*].id"))
                .isEqualTo(JsonPath.<List<String>>read(started, "$.made[*].id"));
        assertThat(JsonPath.<Object>read(started, "$.board")).isNull();
        assertThat(JsonPath.<Integer>read(fetch("/v1/circles/" + circle + "/checklists", nora), "$.items.length()"))
                .isEqualTo(2);

        // The page has its words; the list has its lines under their headings, each once.
        String plan = fetch("/v1/pages/" + JsonPath.<String>read(started, "$.made[0].id"), alex);
        assertThat(plan).contains("Guests").contains("hide it from the birthday person");
        String prep = fetch("/v1/checklists/" + JsonPath.<String>read(started, "$.made[1].id"), alex);
        assertThat(JsonPath.<Integer>read(prep, "$.items.length()")).isEqualTo(11);
        assertThat(JsonPath.<String>read(prep, "$.items[0].section")).isEqualTo("Three weeks before");
        assertThat(JsonPath.<String>read(prep, "$.items[10].text")).isEqualTo("Write down who gave what");
        assertThat(JsonPath.<String>read(started, "$.made[1].glance")).isEqualTo("0 of 11 done");

        // The gift ideas start as hers alone, although she asked for the rest to be shared.
        assertThat(JsonPath.<String>read(started, "$.made[2].chip.audience")).isEqualTo("me");
        assertThat(statusOf("/v1/checklists/" + JsonPath.<String>read(started, "$.made[2].id"), alex))
                .isEqualTo(404);
    }

    @Test
    void startingATemplateThatDoesWorkMakesItsBoardAndOneThatIsComingSaysSo() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String stranger = person("Stranger");
        String circle = circle(nora, "couple", "Nora and Alex");
        join(nora, circle, alex);

        String started =
                start(nora, circle, "good_jar", "{\"clientId\":\"%s\",\"title\":\"Our jar\"}".formatted(id()), 201);
        assertThat(JsonPath.<String>read(started, "$.board.template")).isEqualTo("good_jar");
        assertThat(JsonPath.<String>read(started, "$.board.title")).isEqualTo("Our jar");
        assertThat(JsonPath.<String>read(started, "$.made[0].kind")).isEqualTo("board");
        assertThat(JsonPath.<String>read(started, "$.made[0].glance")).startsWith("0 good things · opens 31 Dec");
        // Between the two of them a thing starts shared.
        assertThat(view(alex, JsonPath.read(started, "$.board.id"))).contains("Our jar");

        assertThat(start(nora, circle, "mystery_date", "{\"clientId\":\"%s\"}".formatted(id()), 409))
                .contains("“Mystery date” is coming with the next update");
        start(nora, circle, "teleporter", "{\"clientId\":\"%s\"}".formatted(id()), 400);
        start(stranger, circle, "good_jar", "{\"clientId\":\"%s\"}".formatted(id()), 404);
        // Settings that the template needs are asked for in its own words.
        assertThat(start(nora, circle, "open_when", "{\"clientId\":\"%s\"}".formatted(id()), 400))
                .contains("Choose who the letters are for");
    }
}

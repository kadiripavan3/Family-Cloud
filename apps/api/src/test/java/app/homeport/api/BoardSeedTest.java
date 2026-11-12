package app.homeport.api;

import static org.assertj.core.api.Assertions.assertThat;

import app.homeport.api.seed.SeedWorld;
import app.homeport.api.seed.Seeder;
import com.jayway.jsonpath.JsonPath;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.Comparator;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * The sample data: someone who opens the app as nora@example.com finds the ten templates in The Linds as the
 * screens draw them, with their numbers. It also runs every template's rules once on a full board.
 */
@SpringBootTest(properties = "homeport.seed.enabled=true")
class BoardSeedTest extends ApiTest {

    private static final LocalDate TODAY = LocalDate.now(ZoneOffset.UTC);

    @Autowired
    private List<Seeder> seeders;

    @Autowired
    private SeedWorld world;

    @Autowired
    private TransactionTemplate transaction;

    /**
     * The sample data is added when the API starts on an empty database. When the tests before this one left
     * something behind, it wasn't; then it is added here, once, the same way.
     */
    @Override
    @BeforeEach
    void emptyDatabase() {
        boolean seeded = jdbc.sql("select exists (select 1 from circles where join_code like 'linds-sample-%')")
                .query(Boolean.class)
                .single();
        if (!seeded) {
            super.emptyDatabase();
            transaction.executeWithoutResult(status -> {
                jdbc.sql("set local statement_timeout = 0").update();
                seeders.stream().sorted(Comparator.comparingInt(Seeder::order)).forEach(s -> s.seed(world));
            });
        }
    }

    private String boardOf(String token, String circle, String template) throws Exception {
        String boards = fetch("/v1/circles/" + circle + "/boards?template=" + template, token);
        assertThat(JsonPath.<Integer>read(boards, "$.items.length()"))
                .as(template)
                .isEqualTo(1);
        return fetch("/v1/boards/" + JsonPath.<String>read(boards, "$.items[0].id"), token);
    }

    @Test
    void theLindsHaveTheTenTemplatesAsTheScreensDrawThem() throws Exception {
        String nora = signIn("nora@example.com");
        String alex = signIn("alex@example.com");
        String circle = JsonPath.<List<String>>read(fetch("/v1/circles", nora), "$[?(@.name == 'The Linds')].id")
                .get(0);
        assertThat(JsonPath.<Integer>read(fetch("/v1/circles/" + circle + "/boards", nora), "$.items.length()"))
                .isEqualTo(10);

        // 5.7 This week's meals: 29 ingredients, six at home, 23 written to Groceries.
        String meals = boardOf(nora, circle, "meal_plan");
        assertThat(JsonPath.<List<String>>read(meals, "$.view.days[*].meals[*].name"))
                .containsExactly("Tomato pasta", "Lentil soup", "Tacos", "Pizza night", "Dinner at Grandma Astrid's");
        assertThat(JsonPath.<List<String>>read(meals, "$.view.days[*].meals[*].cook.name"))
                .containsExactly("Alex", "Nora", "Alex", "Mia");
        assertThat(JsonPath.<Integer>read(meals, "$.view.groceries.going")).isEqualTo(23);
        assertThat(JsonPath.<Integer>read(meals, "$.view.groceries.atHome")).isEqualTo(6);
        assertThat(JsonPath.<Integer>read(meals, "$.view.cookingFor")).isEqualTo(4);
        assertThat(JsonPath.<List<String>>read(meals, "$.view.recipes[*].name"))
                .containsExactly("Baked salmon", "Chicken curry", "Big salad");
        String groceries = fetch("/v1/checklists/" + JsonPath.<String>read(meals, "$.view.groceries.listId"), alex);
        assertThat(JsonPath.<String>read(groceries, "$.title")).isEqualTo("Groceries");
        assertThat(JsonPath.<Integer>read(groceries, "$.left")).isEqualTo(23);

        // 5.8 The wheel as it stands this week, and the stars so far.
        String wheel = boardOf(alex, circle, "chore_wheel");
        assertThat(JsonPath.<List<String>>read(wheel, "$.view.jobs[*].name"))
                .containsExactly("Bins and recycling", "Laundry", "Set the table", "Feed Biscuit");
        assertThat(JsonPath.<List<String>>read(wheel, "$.view.jobs[*].who.name"))
                .containsExactly("Nora", "Alex", "Mia", "Leo");
        assertThat(JsonPath.<List<Integer>>read(wheel, "$.view.people[2:4].stars"))
                .containsExactly(34, 21);
        assertThat(JsonPath.<Boolean>read(wheel, "$.view.jobs[3].doneToday")).isTrue();
        assertThat(JsonPath.<Boolean>read(wheel, "$.view.jobs[0].complete")).isFalse();
        assertThat(JsonPath.<String>read(wheel, "$.view.stars.into")).isEqualTo("Mia's skates fund");

        // 5.9 The capsule: four things sealed inside, hidden from Mia, opening on her 18th birthday.
        String capsule = boardOf(nora, circle, "time_capsule");
        assertThat(JsonPath.<String>read(capsule, "$.title")).isEqualTo("For Mia, on her 18th birthday");
        assertThat(JsonPath.<List<String>>read(capsule, "$.chip.hiddenFrom")).containsExactly("Mia");
        assertThat(JsonPath.<List<String>>read(capsule, "$.view.items[*].title"))
                .containsExactly(
                        "A letter from Nora",
                        "A voice message from Alex",
                        "Grandma Astrid's cookie recipe",
                        "12 photos from this year");
        assertThat(JsonPath.<List<Boolean>>read(capsule, "$.view.items[*].sealed"))
                .containsOnly(true);
        assertThat(JsonPath.<Integer>read(capsule, "$.view.items[0].pages")).isEqualTo(2);
        assertThat(JsonPath.<Integer>read(capsule, "$.view.items[1].seconds")).isEqualTo(134);
        assertThat(JsonPath.<Integer>read(capsule, "$.view.items[3].photos")).isEqualTo(12);
        // From the day she was born to her eighteenth birthday: a little over half way.
        assertThat(JsonPath.<Integer>read(capsule, "$.view.progress")).isBetween(50, 56);
        assertThat(JsonPath.<String>read(capsule, "$.view.opensOn")).endsWith("-12-04");
        assertThat(capsule).doesNotContain("Bring the horse");

        // 15.1 Five letters for Mia, one opened nine days ago at 21:40. They are Nora's: Alex wasn't shown them.
        String letters = boardOf(nora, circle, "open_when");
        assertThat(JsonPath.<String>read(letters, "$.view.forPerson.name")).isEqualTo("Mia");
        assertThat(JsonPath.<List<String>>read(letters, "$.view.letters[*].when"))
                .containsExactly(
                        "you can't sleep",
                        "you've had a bad day",
                        "it's your first day at big school",
                        "you win, or you lose",
                        "I'm away and you miss me");
        assertThat(JsonPath.<List<Boolean>>read(letters, "$.view.letters[*].opened"))
                .containsExactly(false, true, false, false, false);
        assertThat(JsonPath.<String>read(letters, "$.view.letters[1].openedAt"))
                .isEqualTo(TODAY.minusDays(9) + "T21:40:00Z");
        assertThat(JsonPath.<Boolean>read(letters, "$.view.letters[2].hasVoice"))
                .isTrue();
        assertThat(JsonPath.<String>read(letters, "$.view.letters[4].forwardOn"))
                .isEqualTo("journey");
        assertThat(fetch("/v1/circles/" + circle + "/boards?template=open_when", alex))
                .doesNotContain("Open when");

        // 15.2 The interview: ten questions, three years of answers, shared with Alex.
        String interview = boardOf(alex, circle, "birthday_interview");
        assertThat(JsonPath.<Integer>read(interview, "$.view.questions.length()"))
                .isEqualTo(10);
        assertThat(JsonPath.<List<String>>read(interview, "$.view.questions[0].answers[*].text"))
                .containsExactly("A vet", "A vet with a horse", "A marine biologist. With a horse.");
        assertThat(JsonPath.<List<Integer>>read(interview, "$.view.questions[0].answers[*].age"))
                .containsExactly(7, 8, 9);
        assertThat(JsonPath.<Integer>read(interview, "$.view.next.age")).isEqualTo(10);

        // 15.3 Eighty-six quotes, by Leo and Mia; the newest was last night, with a recording.
        String said = boardOf(nora, circle, "said");
        assertThat(JsonPath.<Integer>read(said, "$.view.total")).isEqualTo(86);
        assertThat(JsonPath.<List<String>>read(said, "$.view.people[*].person.name"))
                .containsExactlyInAnyOrder("Leo", "Mia");
        assertThat(JsonPath.<String>read(said, "$.view.latest[0].text"))
                .isEqualTo("I'm not tired. My eyes are just heavy.");
        assertThat(JsonPath.<String>read(said, "$.view.latest[0].day"))
                .isEqualTo(TODAY.minusDays(1).toString());
        assertThat(JsonPath.<Integer>read(said, "$.view.latest[0].voice.seconds"))
                .isEqualTo(6);
        assertThat(JsonPath.<List<String>>read(
                        fetch(
                                "/v1/boards/" + JsonPath.<String>read(said, "$.id") + "/entries?q=following our car",
                                nora),
                        "$.items[*].age"))
                .containsExactly("4 years and 9 months");

        // 15.4 Three first days of school; last year's is the one to line up with.
        String spot = boardOf(nora, circle, "same_spot");
        assertThat(JsonPath.<String>read(spot, "$.title")).isEqualTo("First day of school");
        assertThat(JsonPath.<List<Integer>>read(spot, "$.view.years[*].year"))
                .containsExactly(TODAY.getYear() - 3, TODAY.getYear() - 2, TODAY.getYear() - 1);
        assertThat(JsonPath.<Integer>read(spot, "$.view.last.year")).isEqualTo(TODAY.getYear() - 1);
        assertThat(JsonPath.<Boolean>read(spot, "$.view.takenThisYear")).isFalse();

        // 15.5 Astrid: fourteen told, this week's answered yesterday, Mia's question waiting for Sunday.
        String stories = boardOf(nora, circle, "stories");
        assertThat(JsonPath.<Integer>read(stories, "$.view.told")).isEqualTo(14);
        assertThat(JsonPath.<String>read(stories, "$.view.initials")).isEqualTo("AL");
        assertThat(JsonPath.<String>read(stories, "$.view.thisWeek.text")).isEqualTo("What was your very first job?");
        assertThat(JsonPath.<Integer>read(stories, "$.view.thisWeek.recording.seconds"))
                .isEqualTo(192);
        assertThat(JsonPath.<String>read(stories, "$.view.thisWeek.answeredAt"))
                .startsWith(TODAY.minusDays(1).toString());
        assertThat(JsonPath.<String>read(stories, "$.view.toldBefore[0].text")).isEqualTo("How did you meet Grandpa?");
        assertThat(JsonPath.<Integer>read(stories, "$.view.toldBefore[0].photos.length()"))
                .isEqualTo(3);
        assertThat(JsonPath.<Integer>read(stories, "$.view.toldBefore.length()"))
                .isEqualTo(13);
        assertThat(JsonPath.<List<String>>read(stories, "$.view.waiting[*].text"))
                .containsExactly("Were you ever in trouble at school?");
        assertThat(JsonPath.<String>read(stories, "$.view.waiting[0].askedBy.name"))
                .isEqualTo("Mia");
        assertThat(LocalDate.parse(JsonPath.<String>read(stories, "$.view.waiting[0].goesOut"))
                        .getDayOfWeek())
                .isEqualTo(java.time.DayOfWeek.SUNDAY);

        // 15.6 The jar: 143 good things, the newest two as drawn, and Alex can't read what Nora put in for Leo.
        String jar = boardOf(alex, circle, "good_jar");
        assertThat(JsonPath.<Integer>read(jar, "$.view.count")).isEqualTo(143);
        assertThat(JsonPath.<String>read(jar, "$.view.latest[0].who.name")).isEqualTo("Leo");
        assertThat(JsonPath.<String>read(jar, "$.view.latest[0].what")).isEqualTo("drawing");
        assertThat(JsonPath.<String>read(jar, "$.view.latest[1].place")).isEqualTo("Reine");
        if (TODAY.isBefore(LocalDate.of(TODAY.getYear(), 12, 30))) {
            assertThat(JsonPath.<Boolean>read(jar, "$.view.latest[0].sealed")).isTrue();
            assertThat(JsonPath.<Boolean>read(jar, "$.view.latest[1].sealed")).isFalse();
        }

        // 15.7 The doorframe, with the comparisons a child cares about.
        String door = boardOf(nora, circle, "doorframe");
        assertThat(JsonPath.<List<Integer>>read(door, "$.view.children[*].heightMm"))
                .containsExactly(1380, 1190);
        assertThat(JsonPath.<List<String>>read(door, "$.view.children[*].landmark"))
                .containsExactly("Up to Grandma Astrid's shoulder", "Tall enough for the big slide");
        // The drawings' today is in November. In the weeks after Mia's birthday in December there is no mark
        // since it yet, and the doorframe truthfully says something else.
        if (TODAY.getMonthValue() > 1 && TODAY.isBefore(LocalDate.of(TODAY.getYear(), 12, 4))) {
            assertThat(JsonPath.<List<String>>read(door, "$.view.children[0].lines"))
                    .containsExactly("6 cm since the last birthday", "Up to Grandma Astrid's shoulder");
            assertThat(JsonPath.<List<String>>read(door, "$.view.children[1].lines"))
                    .containsExactly("7 cm this year, the most yet", "Tall enough for the big slide");
        }
        assertThat(JsonPath.<List<String>>read(door, "$.view.comparisons"))
                .containsExactly("Mia was Leo's height in the spring of " + (TODAY.getYear() - 3) + ".");

        // Today and the glances come from the same boards.
        assertThat(fetch("/v1/circles/" + circle + "/today?day=" + TODAY, nora))
                .contains("Astrid answered, by talking")
                .contains("Bins and recycling");
        assertThat(JsonPath.<List<String>>read(fetch("/v1/circles/" + circle + "/boards", nora), "$.items[*].glance"))
                .contains(
                        "143 good things · opens 31 Dec",
                        "86 quotes · latest from Leo",
                        "14 told · one question a week",
                        "Mia 138 cm · Leo 119 cm",
                        "5 letters · 1 opened");
    }
}

package app.homeport.api;

import static org.assertj.core.api.Assertions.assertThat;

import app.homeport.api.seed.SeedWorld;
import app.homeport.api.seed.Seeder;
import com.jayway.jsonpath.JsonPath;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.Month;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.format.TextStyle;
import java.time.temporal.TemporalAdjusters;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * The sample data of the fair-and-fun and the couple's templates: someone who opens the app as
 * nora@example.com (or as alex@) finds the seven boards in The Linds and the six in Nora and Alex as their
 * screens draw them, and a couple's Today made of them. What depends on the day of the week or the time of
 * year is checked on the days it holds.
 */
@SpringBootTest(properties = "homeport.seed.enabled=true")
class FunSeedTest extends ApiTest {

    private static final LocalDate TODAY = LocalDate.now(ZoneOffset.UTC);
    private static final LocalDate MONDAY = TODAY.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));

    /** Today's cards without the ones the link with Journey puts there: what the circle's own templates bring. */
    private static final String THE_TEMPLATES_CARDS =
            "$.cards[?(@.look nin ['goodnight', 'journey_away', 'journey_on_this_day'])]";

    @Autowired
    private List<Seeder> seeders;

    @Autowired
    private SeedWorld world;

    @Autowired
    private TransactionTemplate transaction;

    /** The sample data is added when the API starts on an empty database; when it isn't there any more, here. */
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

    private String circleOf(String token, String name) throws Exception {
        return JsonPath.<List<String>>read(fetch("/v1/circles", token), "$[?(@.name == '" + name + "')].id")
                .get(0);
    }

    private String idOf(String token, String circle, String template) throws Exception {
        String boards = fetch("/v1/circles/" + circle + "/boards?template=" + template, token);
        assertThat(JsonPath.<Integer>read(boards, "$.items.length()"))
                .as(template)
                .isEqualTo(1);
        return JsonPath.read(boards, "$.items[0].id");
    }

    private String boardOf(String token, String circle, String template) throws Exception {
        return fetch("/v1/boards/" + idOf(token, circle, template), token);
    }

    @Test
    void theLindsHaveTheSevenFairAndFunBoardsAsTheirScreensDrawThem() throws Exception {
        String nora = signIn("nora@example.com");
        String alex = signIn("alex@example.com");
        String circle = circleOf(nora, "The Linds");

        // 16.1 Whose turn? Film night is tonight and Leo chooses; 61 turns kept since March.
        String turns = boardOf(nora, circle, "whose_turn");
        assertThat(JsonPath.<List<String>>read(turns, "$.view.things[*].name"))
                .containsExactly(
                        "Film night",
                        "The front seat",
                        "Pizza toppings",
                        "First in the bath",
                        "The early walk with Biscuit");
        assertThat(JsonPath.<List<String>>read(turns, "$.view.things[*].next.name"))
                .containsExactly("Leo", "Mia", "Leo", "Mia", "Alex");
        assertThat(JsonPath.<List<Boolean>>read(turns, "$.view.things[*].tonight"))
                .containsExactly(true, false, false, false, false);
        assertThat(JsonPath.<String>read(turns, "$.view.things[0].does")).isEqualTo("chooses the film");
        assertThat(JsonPath.<String>read(turns, "$.view.things[0].line"))
                .startsWith("Mia chose ")
                .endsWith(". Frozen, again.");
        if (TODAY.getDayOfWeek().getValue() <= DayOfWeek.FRIDAY.getValue()) {
            assertThat(JsonPath.<String>read(turns, "$.view.things[0].line"))
                    .isEqualTo("Mia chose last Friday. Frozen, again.");
        }
        assertThat(JsonPath.<List<String>>read(turns, "$.view.things[1:4].line"))
                .containsExactly("Leo had it on the way to school", "Mia went for olives last time", "Every evening");
        assertThat(JsonPath.<String>read(turns, "$.view.things[4].line"))
                .isEqualTo("You did " + TODAY.minusDays(2).getDayOfWeek().getDisplayName(TextStyle.FULL, Locale.ENGLISH)
                        + " and " + TODAY.minusDays(1).getDayOfWeek().getDisplayName(TextStyle.FULL, Locale.ENGLISH));
        assertThat(JsonPath.<Integer>read(turns, "$.view.turns")).isEqualTo(61);
        assertThat(LocalDate.parse(JsonPath.<String>read(turns, "$.view.since")).getMonth())
                .isEqualTo(Month.MARCH);

        // 16.2 Mia's piggy bank: €23.40 in three jars, 5% a month, the skates fund at 68%.
        String bank = boardOf(alex, circle, "piggy_bank");
        assertThat(JsonPath.<String>read(bank, "$.title")).isEqualTo("Mia's piggy bank");
        assertThat(JsonPath.<Integer>read(bank, "$.view.totalCents")).isEqualTo(2340);
        assertThat(JsonPath.<List<Integer>>read(bank, "$.view.jars[*].cents")).containsExactly(840, 1200, 300);
        assertThat(JsonPath.<List<Integer>>read(bank, "$.view.jars[*].fill")).containsExactly(42, 68, 20);
        assertThat(JsonPath.<Integer>read(bank, "$.view.interestPercent")).isEqualTo(5);
        assertThat(JsonPath.<Integer>read(bank, "$.view.lastInterest.cents")).isEqualTo(60);
        assertThat(JsonPath.<String>read(bank, "$.view.lastInterest.day"))
                .isEqualTo(TODAY.withDayOfMonth(1).toString());
        assertThat(JsonPath.<String>read(bank, "$.view.fund.name")).isEqualTo("Skates fund");
        assertThat(JsonPath.<Integer>read(bank, "$.view.fund.percent")).isEqualTo(68);
        assertThat(JsonPath.<Integer>read(bank, "$.view.fund.starsToGo")).isEqualTo(16);
        assertThat(JsonPath.<List<String>>read(bank, "$.view.lately[*].title"))
                .containsExactly("10 stars from the chore wheel", "From Grandma Astrid", "Stickers");
        assertThat(JsonPath.<List<Integer>>read(bank, "$.view.lately[*].cents")).containsExactly(200, 500, -350);
        assertThat(JsonPath.<String>read(bank, "$.view.lately[0].day"))
                .isEqualTo(TODAY.with(TemporalAdjusters.previousOrSame(DayOfWeek.SUNDAY))
                        .toString());

        // 16.3 Secret missions: hers is for Mia; last week's four were revealed on Sunday.
        String missions = idOf(nora, circle, "secret_missions");
        String hers = fetch("/v1/boards/" + missions + "?show=" + MONDAY.minusDays(7), nora);
        assertThat(JsonPath.<String>read(hers, "$.view.yours[0].text"))
                .isEqualTo("Do one of Mia's jobs before she notices.");
        assertThat(JsonPath.<String>read(hers, "$.view.yours[0].target.name")).isEqualTo("Mia");
        assertThat(JsonPath.<Integer>read(hers, "$.view.people")).isEqualTo(4);
        assertThat(JsonPath.<List<String>>read(hers, "$.view.revealed[*].doer.name"))
                .containsExactly("Alex", "Mia", "Leo", "Nora");
        assertThat(JsonPath.<List<String>>read(hers, "$.view.revealed[*].target.name"))
                .containsExactly("Nora", "Leo", "Alex", "Biscuit");
        assertThat(JsonPath.<List<String>>read(hers, "$.view.revealed[*].did"))
                .containsExactly(
                        "made your coffee three mornings running",
                        "let him win at cards, twice",
                        "hid a drawing in Dad's bag",
                        "one very long walk");
        assertThat(JsonPath.<List<String>>read(hers, "$.view.revealed[*].reply"))
                .containsExactly(
                        "You guessed by Wednesday",
                        "Leo had no idea",
                        "Found in Reine, on day 3",
                        "Biscuit can't read, but knew");
        assertThat(JsonPath.<List<Boolean>>read(hers, "$.view.revealed[*].liked"))
                .containsExactly(true, false, false, false);
        assertThat(JsonPath.<Object>read(hers, "$.view.revealed[2].photo")).isNotNull();
        // Mia's mission this week is for Nora: Alex reads it to her, and Nora isn't sent it.
        assertThat(hers).doesNotContain("only Mum will find it");
        assertThat(fetch("/v1/boards/" + missions, alex)).contains("Leave a note where only Mum will find it.");

        // 16.4 The Saturday jar: 31 ideas, and the picnic Mia put in back in June came out.
        String jar = boardOf(nora, circle, "saturday_jar");
        assertThat(JsonPath.<Integer>read(jar, "$.view.count")).isEqualTo(31);
        assertThat(JsonPath.<String>read(jar, "$.view.pulled.text")).isEqualTo("A picnic by the pond in Tivoli");
        assertThat(JsonPath.<String>read(jar, "$.view.pulled.by.name")).isEqualTo("Mia");
        assertThat(JsonPath.<Integer>read(jar, "$.view.pulled.minutes")).isEqualTo(120);
        assertThat(JsonPath.<Integer>read(jar, "$.view.pulled.cents")).isZero();
        assertThat(LocalDate.parse(JsonPath.<String>read(jar, "$.view.pulled.addedOn"))
                        .getMonth())
                .isEqualTo(Month.JUNE);
        assertThat(JsonPath.<Object>read(jar, "$.view.weather")).isNull(); // "Dry until 4" needs a weather source
        String fits = fetch("/v1/boards/" + JsonPath.<String>read(jar, "$.id") + "/entries?filter=fits&limit=3", nora);
        assertThat(JsonPath.<List<String>>read(fits, "$.items[*].text"))
                .containsExactly("Build a den in the living room", "The big slides at the pool", "Pancakes for dinner");
        assertThat(JsonPath.<List<String>>read(fits, "$.items[*].by.name")).containsExactly("Leo", "Alex", "Mia");

        // 16.5 Sleeps until…: twelve sleeps and a chain of fourteen with two links gone.
        String sleeps = boardOf(nora, circle, "sleeps");
        List<String> counting = JsonPath.read(sleeps, "$.view..title");
        assertThat(counting)
                .containsExactlyInAnyOrder("Grandma Astrid comes", "Mia's birthday", "Christmas morning", "Norway");
        // In the last weeks of the year the birthday or Christmas is nearer than Grandma, and comes first.
        if (TODAY.getMonthValue() > 1 && TODAY.isBefore(LocalDate.of(TODAY.getYear(), 11, 22))) {
            assertThat(JsonPath.<String>read(sleeps, "$.view.first.title")).isEqualTo("Grandma Astrid comes");
            assertThat(JsonPath.<Integer>read(sleeps, "$.view.first.sleeps")).isEqualTo(12);
            assertThat(JsonPath.<Integer>read(sleeps, "$.view.first.links")).isEqualTo(14);
            assertThat(JsonPath.<Integer>read(sleeps, "$.view.first.off")).isEqualTo(2);
            assertThat(JsonPath.<String>read(sleeps, "$.view.first.tearer.name"))
                    .isEqualTo("Leo");
            assertThat(JsonPath.<List<String>>read(sleeps, "$.view.others[*].title"))
                    .containsExactly("Mia's birthday", "Christmas morning", "Norway");
            assertThat(JsonPath.<Integer>read(sleeps, "$.view.others[2].sleeps"))
                    .isEqualTo(143);
            assertThat(JsonPath.<String>read(sleeps, "$.view.others[2].note")).isEqualTo("from the trip");
            assertThat(JsonPath.<String>read(sleeps, "$.view.others[0].day")).endsWith("-12-04");
        }

        // 16.6 Where is it? "where's the tent", then the other things put away.
        String where = idOf(nora, circle, "where_is_it");
        String asked = fetch("/v1/boards/" + where + "?show=where's the tent", nora);
        assertThat(JsonPath.<String>read(asked, "$.view.found.place")).isEqualTo("Attic, blue crate 3");
        assertThat(JsonPath.<String>read(asked, "$.view.found.note")).isEqualTo("Tent, pegs and both mats.");
        assertThat(JsonPath.<String>read(asked, "$.view.found.putBy.name")).isEqualTo("Alex");
        assertThat(JsonPath.<String>read(asked, "$.view.found.putOn")).endsWith("-09-14");
        assertThat(JsonPath.<String>read(asked, "$.view.found.photo.url")).contains("hallway");
        assertThat(JsonPath.<List<String>>read(asked, "$.view.items[*].name"))
                .containsExactly("Spare car key", "Christmas lights", "Leo's swimming bag", "The passports");
        assertThat(JsonPath.<List<String>>read(asked, "$.view.items[*].place"))
                .containsExactly(
                        "With Marta next door",
                        "Cellar, top shelf, on the left",
                        "Hall cupboard, bottom shelf",
                        "Bedroom, grey folder");
        // The key and the passports are kept to the two grown-ups; the rest is everyone's.
        assertThat(JsonPath.<List<String>>read(asked, "$.view.items[0].only[*].name"))
                .containsExactly("Nora", "Alex");
        assertThat(JsonPath.<List<String>>read(asked, "$.view.items[3].only[*].name"))
                .containsExactly("Nora", "Alex");
        assertThat(JsonPath.<List<Object>>read(asked, "$.view.items[1:3].only[*]"))
                .isEmpty();
        assertThat(JsonPath.<String>read(asked, "$.view.items[2].seen")).isEqualTo("on the hall hook");
        assertThat(JsonPath.<String>read(asked, "$.view.items[2].seenBy.name")).isEqualTo("Mia");
        assertThat(JsonPath.<String>read(asked, "$.view.items[2].seenAt")).isNotNull();
        assertThat(JsonPath.<List<String>>read(
                        fetch("/v1/circles/" + circle + "/search?q=where's the tent", alex),
                        "$.hits[?(@.thing.id == '" + where + "')].snippet"))
                .containsExactly("Attic, blue crate 3 · Tent, pegs and both mats.");

        // 16.7 Habit charts: Leo's two rows, Mia's nine days in a row, and the grown-ups'.
        String charts = boardOf(nora, circle, "habit_charts");
        assertThat(JsonPath.<List<String>>read(charts, "$.view.charts[*].title"))
                .containsExactly(
                        "Bed made, bag packed",
                        "Reading, 20 minutes",
                        "Phones off the table at dinner",
                        "One evening a week with no screens");
        assertThat(JsonPath.<List<String>>read(charts, "$.view.charts[*].who"))
                .containsExactly("Leo", "Mia", "Everyone", "You and Alex");
        assertThat(JsonPath.<List<Integer>>read(charts, "$.view.charts[*].stars"))
                .containsExactly(21, 34, null, null);
        int soFar = TODAY.getDayOfWeek().getValue();
        assertThat(JsonPath.<String>read(charts, "$.view.charts[0].line"))
                .isEqualTo((2 * soFar - 1) + " of " + (2 * soFar) + " so far this week");
        assertThat(JsonPath.<List<String>>read(charts, "$.view.charts[0].rows[*].icon"))
                .containsExactly("sun", "moon");
        assertThat(JsonPath.<List<String>>read(charts, "$.view.charts[1:4].line"))
                .containsExactly("9 days in a row", "4 dinners running", "Thursdays");
        assertThat(JsonPath.<List<Boolean>>read(charts, "$.view.charts[*].doneToday"))
                .containsExactly(false, false, true, false);

        // None of it is put on the family's Today. What stands above the day's list there is the link with
        // Journey's own, as "Journey, at home" draws it: a goodnight, who is away, a day from a kept journey.
        String familyDay = fetch("/v1/circles/" + circle + "/today?day=" + TODAY, nora);
        assertThat(JsonPath.<List<String>>read(familyDay, "$.cards[*].kind")).doesNotContain("board");
        assertThat(JsonPath.<List<String>>read(familyDay, "$.cards[*].look"))
                .isSubsetOf("goodnight", "journey_away", "journey_on_this_day");
        assertThat(JsonPath.<List<String>>read(fetch("/v1/circles/" + circle + "/boards", nora), "$.items[*].glance"))
                .contains(
                        "Tonight: Leo chooses the film",
                        "€23.40 · €12.00 in Save",
                        "31 ideas in the jar",
                        "5 things put away");
    }

    @Test
    void noraAndAlexHaveTheSixCoupleBoardsAndEachSeesTheirOwnSideOfThem() throws Exception {
        String nora = signIn("nora@example.com");
        String alex = signIn("alex@example.com");
        String circle = circleOf(nora, "Nora and Alex");
        assertThat(JsonPath.<Integer>read(fetch("/v1/circles/" + circle + "/boards", nora), "$.items.length()"))
                .isEqualTo(6);

        // 17.3 Our story: 4,503 days so far, four moments.
        String story = boardOf(nora, circle, "our_story");
        assertThat(JsonPath.<Integer>read(story, "$.view.days")).isEqualTo(4503);
        assertThat(JsonPath.<List<String>>read(story, "$.view.moments[*].title"))
                .containsExactly("We met", "Mallorca by kayak", "The keys to Trubarjeva", "Three of us");
        assertThat(JsonPath.<List<String>>read(story, "$.view.moments[*].label"))
                .containsExactly("Piran", "First trip", "First flat", "Mia");
        assertThat(JsonPath.<List<String>>read(story, "$.view.moments[*].precision"))
                .containsExactly("day", "month", "month", "day");
        assertThat(JsonPath.<List<Boolean>>read(story, "$.view.moments[*].star"))
                .containsExactly(true, false, false, true);
        assertThat(JsonPath.<String>read(story, "$.view.moments[0].photos[0].url"))
                .contains("bench");
        assertThat(JsonPath.<String>read(story, "$.view.moments[1].from")).isEqualTo("journey");
        assertThat(JsonPath.<String>read(story, "$.view.moments[3].day")).endsWith("-12-04");

        // 17.4 Tucked notes: hers is tucked away for Alex; his for her is nowhere for her. 37 found so far.
        String hers = boardOf(nora, circle, "tucked_notes");
        assertThat(JsonPath.<List<String>>read(hers, "$.view.tucked[*].text"))
                .containsExactly("Your coffee this morning was the best part of my day.");
        assertThat(LocalDate.parse(JsonPath.<String>read(hers, "$.view.tucked[0].before"))
                        .getDayOfWeek())
                .isEqualTo(DayOfWeek.SUNDAY);
        assertThat(JsonPath.<Integer>read(hers, "$.view.found")).isEqualTo(37);
        assertThat(JsonPath.<List<String>>read(hers, "$.view.foundLately[0:2].text"))
                .containsExactly(
                        "I folded your washing. You're welcome. I love you.", "Look in the left pocket of your coat.");
        assertThat(JsonPath.<String>read(hers, "$.view.foundLately[0].foundAt")).contains("T22:14");
        assertThat(JsonPath.<String>read(hers, "$.view.foundLately[1].turnsUp")).isEqualTo("lands");
        assertThat(hers).doesNotContain("glove box");
        String his = boardOf(alex, circle, "tucked_notes");
        assertThat(JsonPath.<List<String>>read(his, "$.view.tucked[*].text"))
                .containsExactly("Check the glove box before you drive on Friday.");
        assertThat(his).doesNotContain("Your coffee this morning");
        assertThat(JsonPath.<Integer>read(his, "$.view.found")).isEqualTo(37);

        // 17.5 The anniversary questions: year twelve is open; year thirteen is his sealed, hers half written.
        String questions = boardOf(nora, circle, "anniversary");
        assertThat(JsonPath.<List<Integer>>read(questions, "$.view.years")).containsExactly(12);
        assertThat(JsonPath.<String>read(questions, "$.view.shown.day"))
                .isEqualTo(TODAY.minusDays(4503).plusYears(12).toString());
        assertThat(JsonPath.<List<String>>read(questions, "$.view.shown.questions[0:3].text"))
                .containsExactly(
                        "The best day of this year?", "What should we do more of?", "What did I not thank you for?");
        assertThat(JsonPath.<List<String>>read(questions, "$.view.shown.questions[0].answers[*].text"))
                .containsExactly("The canoe at Bled, when Mia steered.", "Bled. Obviously Bled.");
        assertThat(JsonPath.<String>read(questions, "$.view.shown.questions[0].same"))
                .isEqualTo("Bled");
        assertThat(JsonPath.<List<String>>read(questions, "$.view.shown.questions[2].answers[*].text"))
                .containsExactly("Every school run in January.", "Remembering my mother's birthday. Every year.");
        assertThat(JsonPath.<Integer>read(questions, "$.view.next.year")).isEqualTo(13);
        assertThat(JsonPath.<Integer>read(questions, "$.view.next.answered")).isEqualTo(2);
        assertThat(JsonPath.<List<Boolean>>read(questions, "$.view.next.others[*].done"))
                .containsExactly(true);
        assertThat(questions).doesNotContain("sledge stuck");
        assertThat(boardOf(alex, circle, "anniversary"))
                .contains("sledge stuck")
                .doesNotContain("nobody had gloves");

        // 17.6 Mystery date: Friday is hers to plan; he gets a time and a hint.
        String plan = boardOf(nora, circle, "mystery_date");
        assertThat(JsonPath.<String>read(plan, "$.title")).isEqualTo("Date night");
        assertThat(JsonPath.<String>read(plan, "$.view.next.title")).isEqualTo("Night sledging on Krvavec");
        assertThat(LocalDate.parse(JsonPath.<String>read(plan, "$.view.next.day"))
                        .getDayOfWeek())
                .isEqualTo(DayOfWeek.FRIDAY);
        assertThat(JsonPath.<List<String>>read(plan, "$.view.next.plan[*].title"))
                .containsExactly(
                        "Night sledging on Krvavec", "€46, from the fun pot", "Ines has the children until 23:30");
        assertThat(JsonPath.<List<Boolean>>read(plan, "$.view.next.plan[*].ready"))
                .containsExactly(false, false, true);
        assertThat(JsonPath.<List<String>>read(plan, "$.view.past[0:2].title"))
                .containsExactly("A cooking class", "Open-air cinema");
        assertThat(JsonPath.<List<String>>read(plan, "$.view.past[0:2].planner.name"))
                .containsExactly("Alex", "Nora");
        if (TODAY.getMonthValue() >= 10) { // eight months back are all in this year
            assertThat(JsonPath.<Integer>read(plan, "$.view.thisYear")).isEqualTo(9);
        }
        String guest = boardOf(alex, circle, "mystery_date");
        assertThat(JsonPath.<String>read(guest, "$.view.next.time")).isEqualTo("20:00");
        assertThat(JsonPath.<String>read(guest, "$.view.next.hint")).isEqualTo("Wear something warm.");
        assertThat(JsonPath.<Object>read(guest, "$.view.next.title")).isNull();
        assertThat(JsonPath.<List<Object>>read(guest, "$.view.next.plan")).isEmpty();
        assertThat(guest)
                .doesNotContain("Krvavec")
                .doesNotContain("thick gloves")
                .doesNotContain("Ines");

        // 17.7 Both said yes: the sixth of eight dinners, Thai as the match, and the other decks.
        String yes = boardOf(nora, circle, "both_yes");
        assertThat(JsonPath.<List<String>>read(yes, "$.view.decks[*].label"))
                .containsExactly("Dinner", "Film", "Holiday", "Names");
        assertThat(JsonPath.<List<String>>read(yes, "$.view.decks[1:4].name"))
                .containsExactly("Friday's film", "Summer " + (TODAY.getYear() + 1), "Names");
        assertThat(JsonPath.<List<Integer>>read(yes, "$.view.decks[*].ideas")).containsExactly(8, 10, 6, 228);
        assertThat(JsonPath.<List<Integer>>read(yes, "$.view.decks[*].seen")).containsExactly(5, 3, 2, 214);
        assertThat(JsonPath.<List<Integer>>read(yes, "$.view.decks[*].matches")).containsExactly(1, 0, 0, 6);
        assertThat(JsonPath.<List<Boolean>>read(yes, "$.view.decks[*].locked"))
                .containsExactly(false, false, false, true);
        assertThat(JsonPath.<List<String>>read(yes, "$.view.decks[2].finished[*].name"))
                .containsExactly("Alex"); // "Alex has finished. You haven't."
        assertThat(JsonPath.<String>read(yes, "$.view.deck.card.text")).isEqualTo("Tacos from the place on Trubarjeva");
        assertThat(JsonPath.<Integer>read(yes, "$.view.deck.number")).isEqualTo(6);
        assertThat(JsonPath.<Integer>read(yes, "$.view.deck.of")).isEqualTo(8);
        assertThat(JsonPath.<List<String>>read(yes, "$.view.deck.matches[*].text"))
                .containsExactly("Thai");

        // 17.8 The fair share: last month, 31 hours and 22, and the one swap.
        String share = boardOf(nora, circle, "fair_share");
        assertThat(JsonPath.<String>read(share, "$.title")).isEqualTo("Fair share");
        assertThat(JsonPath.<String>read(share, "$.view.monthName"))
                .isEqualTo(TODAY.minusMonths(1).getMonth().getDisplayName(TextStyle.FULL, Locale.ENGLISH));
        assertThat(JsonPath.<List<Integer>>read(share, "$.view.people[*].hours"))
                .containsExactly(31, 22);
        assertThat(JsonPath.<List<Integer>>read(share, "$.view.people[*].percent"))
                .containsExactly(58, 42);
        assertThat(JsonPath.<List<String>>read(share, "$.view.people[0].jobs[*].name"))
                .containsExactly("Meals", "School things", "Laundry", "Doctor, dentist", "Birthdays");
        assertThat(JsonPath.<List<String>>read(share, "$.view.people[1].jobs[*].name"))
                .containsExactly("Bedtimes", "Bins, repairs", "The car", "Bills", "Biscuit");
        assertThat(JsonPath.<String>read(share, "$.view.swap.line"))
                .isEqualTo("Alex takes the school things; you take the car.");
    }

    @Test
    void aCouplesTodayIsWhatItsScreenDrawsAndItsGalleryIsACouples() throws Exception {
        String nora = signIn("nora@example.com");
        String alex = signIn("alex@example.com");
        String circle = circleOf(nora, "Nora and Alex");
        String lastMonth = TODAY.minusMonths(1).getMonth().getDisplayName(TextStyle.FULL, Locale.ENGLISH);
        LocalDate there = LocalDate.now(ZoneId.of("Europe/Ljubljana")); // the day the sample calendar counts from

        // 17.1 Today, for two. The day's list: the run, the note that is tucked away for her, what he owes her.
        String hers = fetch("/v1/circles/" + circle + "/today?day=" + there, nora);
        assertThat(JsonPath.<List<String>>read(hers, "$.items[*].title"))
                .containsExactly("Run together", "A note is tucked away for you", "Alex owes you for " + lastMonth);
        assertThat(JsonPath.<List<String>>read(hers, "$.items[*].lead")).containsExactly("7:00", null, "€42");
        // Two people who share a life settle up, whichever of them owes: the line's button says so for both.
        assertThat(JsonPath.<String>read(hers, "$.items[2].action.label")).isEqualTo("Settle");
        assertThat(JsonPath.<String>read(hers, "$.items[2].action.act")).isEqualTo("settle");
        assertThat(JsonPath.<List<String>>read(hers, "$.items[*].note"))
                .containsExactly("Week 3 of couch to 5K", "From Alex. It turns up when it turns up.", "Alex €42");
        assertThat(JsonPath.<Integer>read(hers, "$.items[0].avatarUrls.length()"))
                .isEqualTo(2);
        // Above it, the cards a couple's own templates bring: the date she plans, then "The two of you".
        List<Map<String, Object>> cards = JsonPath.read(hers, THE_TEMPLATES_CARDS);
        assertThat(cards)
                .extracting(card -> card.get("look"))
                .containsExactly("mystery_date", "our_story", "both_yes", "checklist");
        assertThat((String) cards.get(0).get("title")).endsWith(" is yours to plan");
        assertThat(cards.get(0).get("line")).isEqualTo("All Alex knows: “20:00, wear something warm”");
        assertThat(cards.subList(1, 4))
                .extracting(card -> card.get("title"))
                .containsExactly("Our story", "Both said yes", "Someday");
        assertThat(cards.subList(1, 4))
                .extracting(card -> card.get("figure"))
                .containsExactly("4,503 days", "A match", null);
        assertThat(cards.get(1).get("line")).isEqualTo("Since a wedding in Piran");
        LocalDate dinner = TODAY.with(TemporalAdjusters.nextOrSame(DayOfWeek.SATURDAY));
        assertThat(cards.get(2).get("line")).isEqualTo(dinner.equals(there) ? "Thai, tonight" : "Thai, on Saturday");
        assertThat(cards.get(3).get("line")).isEqualTo("14 of 60 done");
        assertThat((String) cards.get(1).get("imageUrl")).contains("bench");
        assertThat((String) cards.get(2).get("imageUrl")).contains("heart-hands");
        if (there.getDayOfWeek() != DayOfWeek.FRIDAY) {
            assertThat(cards.get(0).get("title")).isEqualTo("Friday is yours to plan");
        }
        // Alex is in this circle too, and away in the sample data of the link with Journey: she is told so here as
        // in the family, by the same rule. That is the one card here no template of theirs made.
        assertThat(JsonPath.<List<String>>read(hers, "$.cards[*].look"))
                .containsExactlyInAnyOrder("mystery_date", "our_story", "both_yes", "checklist", "journey_away");
        assertThat(JsonPath.<List<String>>read(hers, "$.cards[?(@.look == 'journey_away')].title"))
                .containsExactly("Alex is on a journey");
        // His: the same day in his words. What is hidden from him isn't in it, and nobody tells him he is away.
        String his = fetch("/v1/circles/" + circle + "/today?day=" + there, alex);
        assertThat(JsonPath.<List<String>>read(his, "$.items[*].title"))
                .containsExactly("Run together", "A note is tucked away for you", "You owe Nora for " + lastMonth);
        assertThat(JsonPath.<String>read(his, "$.items[2].action.label")).isEqualTo("Settle");
        assertThat(JsonPath.<List<String>>read(his, "$.cards[*].look"))
                .containsExactly("mystery_date", "our_story", "both_yes", "checklist");
        assertThat(JsonPath.<String>read(his, "$.cards[0].line"))
                .isEqualTo("Nora is planning. 20:00. Wear something warm.");
        assertThat(his).doesNotContain("Krvavec").doesNotContain("Your coffee this morning");
        assertThat(hers).doesNotContain("glove box");

        // The Someday list didn't jump to the top of what changed last in their Notes.
        String notes = fetch("/v1/circles/" + circle + "/notes", nora);
        assertThat(JsonPath.<List<String>>read(notes, "$.pinned[*].title")).containsExactly("Someday");
        assertThat(JsonPath.<Integer>read(notes, "$.pinned[0].done")).isEqualTo(14);
        assertThat(JsonPath.<Integer>read(notes, "$.pinned[0].left")).isEqualTo(46);
        assertThat(jdbc.sql(
                                "select updated_at < now() - interval '1 day' from things where kind = 'checklist' and title = 'Someday' and circle_id = cast(:circle as uuid)")
                        .param("circle", circle)
                        .query(Boolean.class)
                        .single())
                .isTrue();

        // 17.2 Templates for two: sixteen of its own, in the drawing's order, with a couple's chips.
        String gallery = fetch("/v1/circles/" + circle + "/templates", nora);
        assertThat(JsonPath.<Integer>read(gallery, "$.yours")).isEqualTo(16);
        assertThat(JsonPath.<Integer>read(gallery, "$.total")).isEqualTo(53);
        assertThat(JsonPath.<List<String>>read(gallery, "$.topics")).containsExactly("home", "money", "trips");
        assertThat(JsonPath.<List<String>>read(gallery, "$.templates[0:8].name"))
                .containsExactly(
                        "Date ideas",
                        "Who pays what",
                        "Moving in together",
                        "The wedding",
                        "They mentioned it",
                        "Names",
                        "A weekend away",
                        "Someday");
        assertThat(JsonPath.<List<String>>read(gallery, "$.templates[0:8].line"))
                .containsExactly(
                        "Shake for one that fits tonight",
                        "Rent, food, fun: split your way",
                        "What's whose, what to buy, who to tell",
                        "Guests, budget and the seating plan",
                        "Gift ideas, hidden from them",
                        "You only see the ones you both like",
                        "Two days, one bag each",
                        "Places and things, ticked off together");
        assertThat(JsonPath.<List<Boolean>>read(gallery, "$.templates[0:8].live"))
                .containsExactly(true, true, false, false, false, true, false, false);
        // Its three keepsakes and its three rituals can all be started.
        assertThat(
                        JsonPath.<List<String>>read(
                                gallery,
                                "$.templates[?(@.yours == true && @.ready == true && @.group != 'templates' && @.live == true)].template"))
                .contains("our_story", "tucked_notes", "anniversary", "mystery_date", "both_yes", "fair_share");
    }
}

package app.homeport.api;

import static org.assertj.core.api.Assertions.assertThat;

import app.homeport.api.seed.SeedWorld;
import app.homeport.api.seed.Seeder;
import com.jayway.jsonpath.JsonPath;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.format.TextStyle;
import java.time.temporal.TemporalAdjusters;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * The sample data: the flat on Trubarjeva (seen on Kai's phone) and Lisbon crew (seen on Nora's) are as their
 * screens draw them, with their numbers, and each one's Today shows what its drawing shows.
 */
@SpringBootTest(properties = "homeport.seed.enabled=true")
class KindsSeedTest extends ApiTest {

    private static final LocalDate TODAY = LocalDate.now(ZoneOffset.UTC);
    private static final LocalDate MONDAY = TODAY.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));

    @Autowired
    private List<Seeder> seeders;

    @Autowired
    private SeedWorld world;

    @Autowired
    private TransactionTemplate transaction;

    /** The sample data is added when the API starts on an empty database; when it wasn't, it is added here. */
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

    private String boardId(String token, String circle, String template) throws Exception {
        String boards = fetch("/v1/circles/" + circle + "/boards?template=" + template, token);
        assertThat(JsonPath.<Integer>read(boards, "$.items.length()"))
                .as(template)
                .isEqualTo(1);
        return JsonPath.read(boards, "$.items[0].id");
    }

    private String boardOf(String token, String circle, String template) throws Exception {
        return fetch("/v1/boards/" + boardId(token, circle, template), token);
    }

    private static String words(LocalDate day) {
        return day.getDayOfWeek().getDisplayName(TextStyle.SHORT, Locale.ENGLISH) + " " + day.getDayOfMonth() + " "
                + day.getMonth().getDisplayName(TextStyle.SHORT, Locale.ENGLISH);
    }

    @Test
    void theFlatIsAsItsScreensDrawItOnKaisPhone() throws Exception {
        String kai = signIn("kai@example.com");
        String lena = signIn("lena@example.com");
        String flat = circleOf(kai, "Trubarjeva 9");
        assertThat(JsonPath.<Integer>read(fetch("/v1/circles/" + flat + "/boards", kai), "$.items.length()"))
                .isEqualTo(6);

        // 18.1 Today: the bins and whose turn, the kitty, Lena's sister, the electricity, the boiler.
        String today = fetch("/v1/circles/" + flat + "/today?day=" + TODAY, kai);
        assertThat(JsonPath.<List<String>>read(today, "$.items[*].title"))
                .containsExactlyInAnyOrder(
                        "Bins out", "My sister's staying, Friday to Sunday", "The boiler: no answer from the landlord");
        assertThat(JsonPath.<List<String>>read(today, "$.items[?(@.title == 'Bins out')].note"))
                .containsExactly("Tonight · Lena");
        assertThat(JsonPath.<List<String>>read(
                        today, "$.items[?(@.title == 'The boiler: no answer from the landlord')].note"))
                .singleElement()
                .asString()
                .startsWith("Since ");
        String sister = JsonPath.<List<String>>read(today, "$.items[?(@.kind == 'board')].note")
                .get(0);
        assertThat(sister).startsWith("Lena").endsWith("everyone said fine");
        assertThat(JsonPath.<List<String>>read(today, "$.cards[*].title"))
                .containsExactly(
                        "The kitty is down to €6.40",
                        "Six people over on Saturday, done by midnight",
                        "Your share of the electricity");
        assertThat(JsonPath.<String>read(today, "$.cards[0].line"))
                .isEqualTo("Running low: loo roll · Lena's turn to shop");
        assertThat(JsonPath.<String>read(today, "$.cards[1].action")).isEqualTo("Answer");
        assertThat(JsonPath.<String>read(today, "$.cards[2].figure")).isEqualTo("€61");
        assertThat(JsonPath.<String>read(today, "$.cards[2].line")).isEqualTo("€159, split by nights at home");
        assertThat(JsonPath.<String>read(today, "$.cards[2].action")).isEqualTo("Pay");

        // 18.3 The kitty: €10 left over, €20 paid in, €14.70 and €8.90 spent. Lena hasn't paid in; it's her turn.
        String kitty = boardOf(kai, flat, "kitty");
        assertThat(JsonPath.<Integer>read(kitty, "$.view.balanceCents")).isEqualTo(640);
        assertThat(JsonPath.<Integer>read(kitty, "$.view.leftOverCents")).isEqualTo(1000);
        assertThat(JsonPath.<Integer>read(kitty, "$.view.paidInCents")).isEqualTo(2000);
        assertThat(JsonPath.<Integer>read(kitty, "$.view.eachCents")).isEqualTo(1000);
        assertThat(JsonPath.<List<String>>read(kitty, "$.view.paidIn[*].name")).containsExactly("Kai", "Lea");
        assertThat(JsonPath.<List<String>>read(kitty, "$.view.notPaidIn[*].name"))
                .containsExactly("Lena");
        assertThat(JsonPath.<List<String>>read(kitty, "$.view.items[*].name"))
                .containsExactly("Loo roll", "Bin bags", "Oil", "Dish soap", "Coffee");
        assertThat(JsonPath.<List<Boolean>>read(kitty, "$.view.items[*].low"))
                .containsExactly(true, false, false, false, false);
        assertThat(JsonPath.<String>read(kitty, "$.view.shopper.name")).isEqualTo("Lena");
        assertThat(JsonPath.<List<String>>read(kitty, "$.view.lines[?(@.kind == 'out')].title"))
                .containsExactly("Loo roll, bin bags", "Olive oil, salt, sponges");
        assertThat(JsonPath.<List<Integer>>read(kitty, "$.view.lines[?(@.kind == 'out')].cents"))
                .containsExactly(-890, -1470);
        assertThat(JsonPath.<List<String>>read(kitty, "$.view.lines[?(@.kind == 'out')].receipt.kind"))
                .containsExactly("photo");
        assertThat(JsonPath.<String>read(kitty, "$.chip.audience")).isEqualTo("circle");

        // 18.4 How we split: the rent as agreed on 1 September, and last month's electricity by nights at home.
        String split = boardOf(kai, flat, "fairer_split");
        assertThat(JsonPath.<List<String>>read(split, "$.view.splits[*].name"))
                .containsExactly("Rent", "The kitty", "Electricity");
        assertThat(JsonPath.<List<Integer>>read(split, "$.view.splits[0].agreed.shares[*].cents"))
                .containsExactly(37200, 31000, 26800);
        assertThat(JsonPath.<List<Integer>>read(split, "$.view.splits[0].agreed.shares[*].measure"))
                .containsExactly(18, 14, 11);
        assertThat(JsonPath.<String>read(split, "$.view.splits[0].agreed.shares[0].note"))
                .isEqualTo("the big room");
        assertThat(JsonPath.<Integer>read(split, "$.view.splits[0].agreed.totalCents"))
                .isEqualTo(95000);
        assertThat(JsonPath.<String>read(split, "$.view.splits[0].agreed.agreedOn"))
                .endsWith("-09-01");
        assertThat(JsonPath.<Integer>read(split, "$.view.splits[0].agreed.agreedBy.length()"))
                .isEqualTo(3);
        assertThat(JsonPath.<List<Object>>read(split, "$.view.splits[*].proposed"))
                .containsOnly((Object) null);
        assertThat(JsonPath.<List<Integer>>read(split, "$.view.splits[2].agreed.shares[*].cents"))
                .containsExactly(6079, 7015, 2806);
        assertThat(JsonPath.<List<Integer>>read(split, "$.view.splits[2].agreed.shares[*].measure"))
                .containsExactly(26, 30, 12);
        assertThat(JsonPath.<String>read(split, "$.view.splits[2].title"))
                .isEqualTo(
                        TODAY.withDayOfMonth(1).minusDays(1).getMonth().getDisplayName(TextStyle.FULL, Locale.ENGLISH)
                                + "'s electricity");
        assertThat(JsonPath.<String>read(split, "$.view.splits[2].payer.name")).isEqualTo("Lea");

        // 18.5 Heads-up: Lea's Saturday waits for Kai; everyone said fine to Lena's sister; Kai is away seven nights.
        String headsUp = boardOf(kai, flat, "heads_up");
        assertThat(JsonPath.<List<String>>read(headsUp, "$.view.notices[*].from.name"))
                .containsExactly("Lea", "Lena", "Kai");
        assertThat(JsonPath.<List<Boolean>>read(headsUp, "$.view.notices[*].needsYou"))
                .containsExactly(true, false, false);
        assertThat(JsonPath.<List<String>>read(headsUp, "$.view.notices[0].replies[*].who.name"))
                .containsExactly("Lena");
        assertThat(JsonPath.<Boolean>read(headsUp, "$.view.notices[1].everyoneFine"))
                .isTrue();
        assertThat(JsonPath.<String>read(headsUp, "$.view.notices[1].detail")).isEqualTo("on the sofa");
        assertThat(JsonPath.<Integer>read(headsUp, "$.view.notices[2].nightsAway"))
                .isEqualTo(7);
        assertThat(JsonPath.<String>read(headsUp, "$.view.notices[2].text")).startsWith("I'm away ");
        assertThat(JsonPath.<String>read(headsUp, "$.view.notices[2].replies[0].text"))
                .isEqualTo("will water the plants");
        assertThat(JsonPath.<String>read(headsUp, "$.view.standing")).isEqualTo("Quiet after 23:00 on weeknights");
        assertThat(JsonPath.<Integer>read(headsUp, "$.view.earlier")).isEqualTo(3);

        // 18.6 Heard in the kitchen: 112 lines, Lea's the most.
        String heard = boardOf(kai, flat, "heard");
        assertThat(JsonPath.<Integer>read(heard, "$.view.total")).isEqualTo(112);
        assertThat(JsonPath.<List<String>>read(heard, "$.view.people[*].person.name"))
                .containsExactly("Lea", "Lena", "Kai");
        assertThat(JsonPath.<List<Integer>>read(heard, "$.view.people[*].count"))
                .containsExactly(44, 38, 30);
        assertThat(JsonPath.<List<String>>read(heard, "$.view.latest[0:3].text"))
                .containsExactly(
                        "I'm not hungover. I'm buffering.",
                        "That's not mould. That's character.",
                        "Whose turn is it to have opinions about the heating?");
        assertThat(JsonPath.<String>read(heard, "$.view.latest[0].writtenAt")).endsWith("T11:40:00Z");
        assertThat(JsonPath.<String>read(heard, "$.view.latest[1].about")).isEqualTo("about the bathroom ceiling");
        assertThat(JsonPath.<Integer>read(heard, "$.view.latest.length()")).isEqualTo(30);

        // 18.7 The guest book: 23 guests and 61 nights since the year before last. Nothing is waiting.
        String book = boardOf(kai, flat, "guest_book");
        assertThat(JsonPath.<Integer>read(book, "$.view.guests")).isEqualTo(23);
        assertThat(JsonPath.<Integer>read(book, "$.view.nights")).isEqualTo(61);
        assertThat(JsonPath.<Integer>read(book, "$.view.since")).isEqualTo(TODAY.getYear() - 2);
        assertThat(JsonPath.<String>read(book, "$.view.link")).contains("/book/");
        assertThat(JsonPath.<List<Object>>read(book, "$.view.waiting")).isEmpty();
        assertThat(JsonPath.<List<String>>read(book, "$.view.latest[0:3].name")).containsExactly("Tom", "Maja", "Ana");
        assertThat(JsonPath.<List<String>>read(book, "$.view.latest[0:3].about"))
                .containsExactly("from Leeds", "Lena's sister", "who used to live here");
        assertThat(JsonPath.<String>read(book, "$.view.latest[0].text"))
                .isEqualTo("Came for a weekend, stayed for the pancakes.");
        assertThat(JsonPath.<Integer>read(book, "$.view.latest[0].nights")).isEqualTo(3);
        assertThat(JsonPath.<String>read(book, "$.view.latest[0].photo.url")).contains("breakfast");

        // 18.8 The roll: three here now, Ana and two people before.
        String roll = boardOf(kai, flat, "lived_here");
        assertThat(JsonPath.<String>read(roll, "$.title")).isEqualTo("Trubarjeva 9, flat 3");
        int year = TODAY.getYear();
        assertThat(JsonPath.<List<String>>read(roll, "$.view.hereNow[*].name")).containsExactly("Lena", "Lea", "Kai");
        assertThat(JsonPath.<List<Integer>>read(roll, "$.view.hereNow[*].fromYear"))
                .containsExactly(year, year - 2, year - 3);
        assertThat(JsonPath.<Boolean>read(roll, "$.view.hereNow[2].you")).isTrue();
        assertThat(JsonPath.<List<String>>read(roll, "$.view.before[*].name"))
                .containsExactly("Ana", "Two people before you");
        assertThat(JsonPath.<List<Integer>>read(roll, "$.view.before[*].untilYear"))
                .containsExactly(year - 1, year - 3);
        assertThat(JsonPath.<Integer>read(roll, "$.view.before[1].count")).isEqualTo(2);
        assertThat(JsonPath.<List<String>>read(roll, "$.view.handedOn[*].thing.title"))
                .containsExactly("House rules", "Bin days", "Who to call");

        // Lena's Today is her own: she owes the kitty, and her share of the electricity is €28.
        String lenas = fetch("/v1/circles/" + flat + "/today?day=" + TODAY, lena);
        assertThat(JsonPath.<String>read(lenas, "$.cards[0].action")).isEqualTo("Pay in");
        assertThat(JsonPath.<List<String>>read(lenas, "$.cards[?(@.look == 'fairer_split')].figure"))
                .containsExactly("€28");
        // Lea's Saturday she has answered; Kai's week away still waits for her.
        assertThat(JsonPath.<List<String>>read(lenas, "$.cards[?(@.look == 'heads_up')].title"))
                .singleElement()
                .asString()
                .startsWith("I'm away ");
    }

    @Test
    void theCrewIsAsItsScreensDrawItOnNorasPhone() throws Exception {
        String nora = signIn("nora@example.com");
        String crew = circleOf(nora, "Lisbon crew");
        assertThat(JsonPath.<Integer>read(fetch("/v1/circles/" + crew + "/boards", nora), "$.items.length()"))
                .isEqualTo(7);
        LocalDate dinner = MONDAY.plusDays(19);

        // 19.1 Today: the dinner's best day, what she is owed, Secret Santa, the walk; and what is new.
        String today = fetch("/v1/circles/" + crew + "/today?day=" + TODAY, nora);
        assertThat(JsonPath.<List<String>>read(today, "$.cards[*].title"))
                .containsExactly(
                        words(dinner) + " works for four of you", "Secret Santa has been drawn", "Walk to Lisbon");
        assertThat(JsonPath.<String>read(today, "$.cards[0].line")).isEqualTo("Reunion dinner · waiting for Kai");
        assertThat(JsonPath.<String>read(today, "$.cards[1].line"))
                .isEqualTo("You know yours. Nobody knows who has you.");
        assertThat(JsonPath.<String>read(today, "$.cards[2].figure")).isEqualTo("59%");
        assertThat(JsonPath.<String>read(today, "$.cards[2].line"))
                .isEqualTo("1,240 of 2,100 km · you added 31 this week");
        assertThat(JsonPath.<List<String>>read(today, "$.items[*].title"))
                .containsExactly("You're owed for Lisbon weekend");
        assertThat(JsonPath.<String>read(today, "$.items[0].lead")).isEqualTo("€64");
        assertThat(JsonPath.<List<String>>read(today, "$.fresh[?(@.title == 'Where next?')].note"))
                .containsExactly("Porto it is");
        assertThat(JsonPath.<List<String>>read(today, "$.fresh[?(@.title == 'Where next?')].pill"))
                .containsExactly("3 votes");
        assertThat(JsonPath.<List<String>>read(today, "$.fresh[?(@.title == 'New word')].note"))
                .containsExactly("“doing a Kai”");

        // 19.3 The reunion dinner: three weeks from next Monday; the second Saturday works for the four who answered.
        String dates = boardOf(nora, crew, "find_date");
        assertThat(JsonPath.<String>read(dates, "$.title")).isEqualTo("Reunion dinner");
        assertThat(JsonPath.<String>read(dates, "$.view.from"))
                .isEqualTo(MONDAY.plusDays(7).toString());
        assertThat(JsonPath.<List<Integer>>read(dates, "$.view.days[*].free"))
                .containsExactly(0, 0, 1, 0, 3, 3, 2, 0, 0, 1, 2, 3, 4, 3, 0, 0, 1, 0, 3, 3, 2);
        assertThat(JsonPath.<String>read(dates, "$.view.best.day")).isEqualTo(dinner.toString());
        assertThat(JsonPath.<Boolean>read(dates, "$.view.best.allWhoAnswered")).isTrue();
        assertThat(JsonPath.<List<String>>read(dates, "$.view.best.names"))
                .containsExactly("Lea", "Lena", "Ana", "you");
        assertThat(JsonPath.<List<String>>read(dates, "$.view.waitingFor[*].person.name"))
                .containsExactly("Kai");
        assertThat(JsonPath.<Boolean>read(dates, "$.view.waitingFor[0].opened")).isTrue();
        assertThat(JsonPath.<String>read(dates, "$.view.askedAt")).startsWith(MONDAY.toString());

        // 19.4 Secret Santa: Nora has Lena, and reads Lena's wishes. Nobody is told more than their own.
        String santa = boardOf(nora, crew, "secret_santa");
        assertThat(JsonPath.<String>read(santa, "$.view.yours.person.name")).isEqualTo("Lena");
        assertThat(JsonPath.<List<String>>read(santa, "$.view.yours.wishes"))
                .containsExactly("A plant that is hard to kill", "Anything from the ceramics stall");
        assertThat(JsonPath.<List<String>>read(santa, "$.view.myWishes[*].text"))
                .containsExactly("Good walking socks", "A roll of 35 mm film");
        assertThat(JsonPath.<Integer>read(santa, "$.view.names.length()")).isEqualTo(5);
        assertThat(JsonPath.<String>read(santa, "$.view.drawnOn"))
                .isEqualTo(TODAY.withDayOfMonth(1).toString());
        assertThat(JsonPath.<Integer>read(santa, "$.view.budgetCents")).isEqualTo(2500);
        assertThat(JsonPath.<List<String>>read(santa, "$.view.apart[*].why")).containsExactly("They're a couple");
        assertThat(JsonPath.<String>read(santa, "$.view.swapAt")).isEqualTo("the reunion dinner");
        assertThat(JsonPath.<String>read(santa, "$.view.swapOn")).isEqualTo(dinner.toString());
        assertThat(JsonPath.<String>read(santa, "$.view.swapThing.title")).isEqualTo("Reunion dinner");
        assertThat(santa)
                .doesNotContain("travel mug")
                .doesNotContain("Olive oil")
                .doesNotContain("Surprise me");
        Map<String, String> drew = new HashMap<>();
        for (String name : List.of("lea", "nora", "kai", "lena", "ana")) {
            String theirs = boardOf(signIn(name + "@example.com"), crew, "secret_santa");
            drew.put(name, JsonPath.read(theirs, "$.view.yours.person.name"));
            assertThat(JsonPath.<Integer>read(theirs, "$.view.yours.wishes.length()"))
                    .isBetween(1, 2);
        }
        assertThat(drew.values()).containsExactlyInAnyOrder("Lea", "Nora", "Kai", "Lena", "Ana");
        assertThat(drew.get("lea")).isNotEqualTo("Kai");
        assertThat(drew.get("kai")).isNotEqualTo("Lea");

        // 19.5 Where next: five of five voted, so it is closed. Porto three, the others one each.
        String where = boardOf(nora, crew, "where_next");
        assertThat(JsonPath.<String>read(where, "$.view.when")).isEqualTo("Spring " + (TODAY.getYear() + 1));
        assertThat(JsonPath.<Boolean>read(where, "$.view.closed")).isTrue();
        assertThat(JsonPath.<Integer>read(where, "$.view.voted")).isEqualTo(5);
        assertThat(JsonPath.<List<String>>read(where, "$.view.ideas[*].name"))
                .containsExactly("Porto", "The Soča valley, by bike", "Sicily");
        assertThat(JsonPath.<List<Integer>>read(where, "$.view.ideas[*].votes")).containsExactly(3, 1, 1);
        assertThat(JsonPath.<List<Integer>>read(where, "$.view.ideas[*].percent"))
                .containsExactly(60, 20, 20);
        assertThat(JsonPath.<List<Integer>>read(where, "$.view.ideas[*].costCents"))
                .containsExactly(31000, 18000, 52000);
        assertThat(JsonPath.<List<Integer>>read(where, "$.view.ideas[*].days")).containsExactly(4, 3, 6);
        assertThat(JsonPath.<Boolean>read(where, "$.view.ideas[0].yours")).isTrue();
        assertThat(JsonPath.<List<String>>read(where, "$.view.ideas[0].voters[*].name"))
                .containsExactlyInAnyOrder("Nora", "Lea", "Ana");

        // 19.6 The dictionary: 31 words, the newest first.
        String dictionary = boardOf(nora, crew, "dictionary");
        assertThat(JsonPath.<Integer>read(dictionary, "$.view.total")).isEqualTo(31);
        assertThat(JsonPath.<List<String>>read(dictionary, "$.view.words[0:3].word"))
                .containsExactly("doing a Kai", "the Ramiro incident", "second breakfast");
        assertThat(JsonPath.<List<String>>read(dictionary, "$.view.words[0:3].coinedBy.name"))
                .containsExactly("Lea", "Ana", "Nora");
        assertThat(JsonPath.<String>read(dictionary, "$.view.words[0].origin")).isEqualTo("Lisbon airport");
        assertThat(LocalDate.parse(JsonPath.<String>read(dictionary, "$.view.words[0].firstRecorded"))
                        .getDayOfWeek())
                .isEqualTo(DayOfWeek.SUNDAY);
        assertThat(JsonPath.<String>read(dictionary, "$.view.words[1].seeAlso")).isEqualTo("just one more plate");
        assertThat(JsonPath.<Boolean>read(dictionary, "$.view.words[2].you")).isTrue();

        // 19.7 Predictions: Lea and Lena have written all four, Ana two, Kai none, Nora three: the one about Kai is
        // missing.
        String predictions = boardOf(nora, crew, "predictions");
        assertThat(JsonPath.<String>read(predictions, "$.title")).isEqualTo("Predictions for " + (TODAY.getYear() + 5));
        assertThat(JsonPath.<String>read(predictions, "$.view.opensOn")).isEqualTo((TODAY.getYear() + 5) + "-10-04");
        assertThat(JsonPath.<List<String>>read(predictions, "$.view.writers[*].person.name"))
                .containsExactly("Lea", "Nora", "Kai", "Lena", "Ana");
        assertThat(JsonPath.<List<Integer>>read(predictions, "$.view.writers[*].written"))
                .containsExactly(4, 3, 0, 4, 2);
        assertThat(JsonPath.<List<String>>read(predictions, "$.view.writers[1].stillAbout[*].name"))
                .containsExactly("Kai");
        assertThat(JsonPath.<Integer>read(predictions, "$.view.items.length()")).isEqualTo(13);
        // Sealed means sealed, also for what she wrote herself.
        assertThat(JsonPath.<List<Object>>read(predictions, "$.view.items[*].text"))
                .containsOnly((Object) null);
        assertThat(predictions).doesNotContain("laminated plan").doesNotContain("bookshop");

        // 19.8 The awards: three decided, two still voting, three earlier years on the shelf.
        String awards = boardOf(nora, crew, "awards");
        assertThat(JsonPath.<String>read(awards, "$.title")).isEqualTo("The " + TODAY.getYear() + " awards");
        assertThat(JsonPath.<List<String>>read(awards, "$.view.awards[*].name"))
                .containsExactly(
                        "Most likely to miss the flight",
                        "Find of the year",
                        "Photo of the year",
                        "Worst idea that worked",
                        "Best thing anyone cooked");
        assertThat(JsonPath.<List<Integer>>read(awards, "$.view.awards[*].voted"))
                .containsExactly(5, 5, 5, 3, 2);
        assertThat(JsonPath.<List<Integer>>read(awards, "$.view.years"))
                .containsExactly(TODAY.getYear() - 1, TODAY.getYear() - 2, TODAY.getYear() - 3);
        if (TODAY.isBefore(LocalDate.of(TODAY.getYear(), 12, 31))) {
            assertThat(JsonPath.<List<Boolean>>read(awards, "$.view.awards[*].decided"))
                    .containsExactly(true, true, true, false, false);
            assertThat(JsonPath.<List<Boolean>>read(awards, "$.view.awards[*].youVoted"))
                    .containsExactly(true, true, true, false, false);
            assertThat(JsonPath.<List<Object>>read(awards, "$.view.awards[3].nominees[*].votes"))
                    .containsOnly((Object) null);
        }
        assertThat(JsonPath.<String>read(awards, "$.view.awards[0].nominees[0].person.name"))
                .isEqualTo("Kai");
        assertThat(JsonPath.<Integer>read(awards, "$.view.awards[0].nominees[0].votes"))
                .isEqualTo(4);
        assertThat(JsonPath.<Integer>read(awards, "$.view.awards[0].totalVotes"))
                .isEqualTo(5);
        assertThat(JsonPath.<Boolean>read(awards, "$.view.awards[0].nominees[0].ownVoteIncluded"))
                .isTrue();
        assertThat(JsonPath.<String>read(awards, "$.view.awards[1].nominees[0].what"))
                .isEqualTo("the tiled bar in Alfama");
        assertThat(JsonPath.<String>read(awards, "$.view.awards[2].nominees[0].person.name"))
                .isEqualTo("Ana");
        assertThat(JsonPath.<String>read(awards, "$.view.awards[2].nominees[0].photo.url"))
                .contains("market");
        String lastYear = fetch("/v1/boards/" + boardId(nora, crew, "awards") + "?show=" + (TODAY.getYear() - 1), nora);
        assertThat(JsonPath.<List<String>>read(lastYear, "$.view.awards[*].name"))
                .containsExactly("Best wrong turn", "Most improved packer");
        assertThat(JsonPath.<List<Boolean>>read(lastYear, "$.view.awards[*].decided"))
                .containsOnly(true);

        // 19.9 The walk: 1,240 of 2,100 km, 152 this week.
        String walk = boardOf(nora, crew, "walk_together");
        assertThat(JsonPath.<Integer>read(walk, "$.view.total")).isEqualTo(1_240_000);
        assertThat(JsonPath.<Integer>read(walk, "$.view.goal")).isEqualTo(2_100_000);
        assertThat(JsonPath.<Integer>read(walk, "$.view.percent")).isEqualTo(59);
        assertThat(JsonPath.<Integer>read(walk, "$.view.thisWeek")).isEqualTo(152_000);
        assertThat(JsonPath.<List<String>>read(walk, "$.view.people[*].person.name"))
                .containsExactly("Lea", "Lena", "Nora", "Ana", "Kai");
        assertThat(JsonPath.<List<Integer>>read(walk, "$.view.people[*].thisWeek"))
                .containsExactly(44_000, 38_000, 31_000, 27_000, 12_000);
        assertThat(JsonPath.<Boolean>read(walk, "$.view.people[2].you")).isTrue();
        assertThat(JsonPath.<List<String>>read(walk, "$.view.stops[*].name"))
                .containsExactly("Milan", "Lyon", "Madrid");
        assertThat(JsonPath.<List<Boolean>>read(walk, "$.view.stops[*].reached"))
                .containsExactly(true, true, false);
    }
}

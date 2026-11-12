package app.homeport.api.seed;

import static org.assertj.core.api.Assertions.assertThat;

import app.homeport.api.ApiTest;
import app.homeport.api.auth.LocalUsers;
import app.homeport.api.media.MediaSizes;
import app.homeport.api.media.MediaStore;
import com.jayway.jsonpath.JsonPath;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.TemporalAdjusters;
import java.util.Comparator;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.TestPropertySource;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * The sample data of Plan and Jot: after it is added, Nora sees what the screens draw, counted from the
 * day it was added. The people and circles are added first, as when the API starts in local mode.
 */
@TestPropertySource(properties = "homeport.seed.enabled=true")
class PlanSampleDataTest extends ApiTest {

    @Autowired
    List<Seeder> seeders;

    @Autowired
    LocalUsers users;

    @Autowired
    MediaStore media;

    @Autowired
    MediaSizes sizes;

    @Autowired
    TransactionTemplate transaction;

    @Test
    void noraSeesTheLindsWeekTheirGoalsAndWhatSheJotted() throws Exception {
        // A world of its own: the one the API made when it started remembers people the test has emptied away.
        SeedWorld world = new SeedWorld(users, media, sizes, jdbc, "../../design/hub/img");
        transaction.executeWithoutResult(status -> seeders.stream()
                .filter(seeder -> seeder.order() == 0
                        || List.of("PlanSeed", "JotSeed")
                                .contains(seeder.getClass().getSimpleName()))
                .sorted(Comparator.comparingInt(Seeder::order))
                .forEach(seeder -> seeder.seed(world)));
        String nora = signIn("nora@example.com");
        String linds = world.circle("linds").toString();
        LocalDate today = LocalDate.now(ZoneId.of("Europe/Ljubljana"));
        LocalDate saturday = today.with(TemporalAdjusters.next(DayOfWeek.SATURDAY));

        // Today: the dentist at 15:30 with Alex taking her, and the bins tonight on Nora's turn.
        String home = fetch("/v1/circles/" + linds + "/today?day=" + today, nora);
        assertThat(JsonPath.<List<String>>read(home, "$.items[?(@.title == 'Dentist · Mia')].lead"))
                .containsExactly("15:30");
        assertThat(JsonPath.<List<String>>read(home, "$.items[?(@.title == 'Dentist · Mia')].note"))
                .containsExactly("Alex is taking her");
        assertThat(JsonPath.<List<Integer>>read(home, "$.items[?(@.title == 'Dentist · Mia')].avatarUrls.length()"))
                .containsExactly(2);
        assertThat(JsonPath.<List<String>>read(home, "$.items[?(@.title == 'Take the bins out')].note"))
                .containsExactly("Tonight · your turn");
        assertThat(JsonPath.<List<Boolean>>read(home, "$.items[?(@.title == 'Feed Biscuit')].done"))
                .containsExactly(true);
        assertThat(JsonPath.<List<String>>read(home, "$.items[?(@.title == 'Feed Biscuit')].note"))
                .containsExactly("Leo · Done at 7:40 · 1 star");

        // Plan: the day's list, and Saturday with the haircut and the dinner.
        String plan = fetch("/v1/circles/" + linds + "/plan?day=" + today + "&days=1", nora);
        assertThat(JsonPath.<List<String>>read(plan, "$.days[0].entries[?(@.title == 'Dentist · Mia')].note"))
                .containsExactly("Trubarjeva 12");
        assertThat(JsonPath.<List<String>>read(plan, "$.days[0].entries[?(@.title == 'Dentist · Mia')].leadEnd"))
                .containsExactly("16:15");
        assertThat(JsonPath.<List<String>>read(plan, "$.days[0].entries[?(@.title == 'Take the bins out')].note"))
                .containsExactly("Tue and Fri · your turn, then Alex");
        String onSaturday = fetch("/v1/circles/" + linds + "/plan?day=" + saturday + "&days=1", nora);
        assertThat(JsonPath.<List<String>>read(onSaturday, "$.days[0].entries[?(@.kind == 'event')].title"))
                .containsExactly("Haircut · Leo", "Dinner at Grandma Astrid's");
        assertThat(JsonPath.<List<String>>read(onSaturday, "$.days[0].entries[?(@.kind == 'event')].note"))
                .containsExactly("Reminds you an hour before", "Everyone · bring the cookies");
        LocalDate thursday = today.with(TemporalAdjusters.nextOrSame(DayOfWeek.THURSDAY));
        assertThat(JsonPath.<List<String>>read(
                        fetch("/v1/circles/" + linds + "/plan?day=" + thursday + "&days=1", nora),
                        "$.days[0].entries[?(@.title == 'Swimming · Mia')].note"))
                .containsExactly("Thursdays");

        // The party: on a Saturday, hidden from Mia, nine going and two who haven't answered, with what it needs.
        String found = fetch("/v1/circles/" + linds + "/search?q=birthday party", nora);
        String party = fetch("/v1/events/" + JsonPath.<String>read(found, "$.hits[0].thing.id"), nora);
        assertThat(LocalDate.parse(JsonPath.<String>read(party, "$.day")).getDayOfWeek())
                .isEqualTo(DayOfWeek.SATURDAY);
        assertThat(JsonPath.<String>read(party, "$.time")).isEqualTo("14:00");
        assertThat(JsonPath.<String>read(party, "$.endTime")).isEqualTo("17:00");
        assertThat(JsonPath.<String>read(party, "$.place")).isEqualTo("At home");
        assertThat(JsonPath.<List<String>>read(party, "$.chip.hiddenFrom")).containsExactly("Mia");
        assertThat(JsonPath.<Integer>read(party, "$.going")).isEqualTo(9);
        assertThat(JsonPath.<Integer>read(party, "$.unanswered")).isEqualTo(2);
        assertThat(JsonPath.<String>read(party, "$.myAnswer")).isEqualTo("going");
        assertThat(JsonPath.<List<String>>read(party, "$.links[*].title")).containsExactly("Party prep", "Gift ideas");
        assertThat(JsonPath.<String>read(party, "$.links[0].glance")).isEqualTo("4 of 9 done");

        // Reminders: three of hers on the screen and the jotted plumber, and what she asked of Alex and Leo.
        String reminders = fetch("/v1/circles/" + linds + "/reminders?day=" + today, nora);
        assertThat(JsonPath.<List<String>>read(reminders, "$.yours[0].reminders[*].note"))
                .contains("19:00 · Tue and Fri · takes turns");
        assertThat(JsonPath.<List<String>>read(reminders, "$.yours[*].reminders[*].title"))
                .containsExactlyInAnyOrder("Take the bins out", "Sign Mia's school trip form", "Call the plumber");
        assertThat(JsonPath.<List<String>>read(
                        reminders, "$.yours[*].reminders[?(@.title == \"Sign Mia's school trip form\")].note"))
                .containsExactly("Trip form attached · due "
                        + (today.getDayOfWeek() == DayOfWeek.THURSDAY ? "tomorrow" : "Friday"));
        assertThat(JsonPath.<List<String>>read(reminders, "$.asked[?(@.title == 'Book the car service')].note"))
                .containsExactly("Asked on Monday · not done yet");
        assertThat(JsonPath.<List<String>>read(reminders, "$.asked[?(@.title == 'Feed Biscuit')].note"))
                .containsExactly("Done at 7:40 · 1 star");
        // ...and under Done, where what was ticked is kept.
        assertThat(JsonPath.<List<String>>read(
                        fetch("/v1/circles/" + linds + "/reminders/done", nora), "$.items[*].title"))
                .contains("Feed Biscuit");
        assertThat(JsonPath.<List<String>>read(reminders, "$.places[*].note"))
                .containsExactly("When you're near the post office", "When Alex is near the shop · Groceries attached");
        assertThat(JsonPath.<String>read(
                        fetch("/v1/circles/" + linds + "/search?q=passport", nora), "$.hits[0].thing.glance"))
                .as("next year's day says its year")
                .isEqualTo("2 Jan " + (today.getYear() + 1) + " · Alex");

        // Goals: the five rings, Norway first, and its own screen.
        String goals = fetch("/v1/circles/" + linds + "/goals?day=" + today, nora);
        assertThat(JsonPath.<List<Integer>>read(goals, "$[*].percent")).containsExactly(70, 65, 40, 72, 68);
        assertThat(JsonPath.<List<String>>read(goals, "$[1:].line"))
                .containsExactly("13 of 20 · together", "Day 12 of 30 in Journey", "€4,100 to go", "34 of 50 stars");
        assertThat(JsonPath.<String>read(goals, "$[0].line")).startsWith("€5,600 of €8,000 · on track for ");
        assertThat(JsonPath.<String>read(goals, "$[0].cheer")).isEqualTo("All four chip in");
        String norway = fetch("/v1/goals/" + JsonPath.<String>read(goals, "$[0].id") + "?day=" + today, nora);
        assertThat(JsonPath.<String>read(norway, "$.pace.paceLine")).isEqualTo("On track: €120 a week gets there");
        assertThat(JsonPath.<String>read(norway, "$.pace.toGoLine")).isEqualTo("€2,400 to go");
        assertThat(JsonPath.<String>read(norway, "$.pace.timeLine")).isEqualTo("20 weeks left");
        assertThat(JsonPath.<List<String>>read(norway, "$.recent[*].line"))
                .startsWith("Alex added €150", "Mia added €5");
        assertThat(JsonPath.<String>read(norway, "$.source.line")).isEqualTo("Reads “Saved” in Norway budget");
        assertThat(JsonPath.<String>read(norway, "$.coverUrl")).isNotNull();

        // Jot: what was filed, the code that is held back, the widgets and the switches.
        String jots = fetch("/v1/circles/" + linds + "/jots?day=" + today + "&limit=7", nora);
        assertThat(JsonPath.<List<String>>read(jots, "$.items[*].title"))
                .containsExactlyInAnyOrder(
                        "Gate code 4471",
                        "The car service",
                        "Eggs",
                        "Call the plumber",
                        "Mia needs €5 for the class photo",
                        "Bread",
                        "Milk");
        assertThat(JsonPath.<List<String>>read(jots, "$.items[?(@.title == 'Call the plumber')].where"))
                .containsExactly("Reminder · tomorrow 9:00");
        assertThat(JsonPath.<List<String>>read(jots, "$.items[?(@.title == 'Gate code 4471')].became"))
                .containsExactly("code");
        assertThat(JsonPath.<List<String>>read(jots, "$.items[?(@.title == 'The car service')].where")
                        .get(0))
                .startsWith("Asked Alex · ");
        String widgets = fetch("/v1/circles/" + linds + "/widgets?day=" + today, nora);
        assertThat(JsonPath.<List<String>>read(widgets, "$.chips")).startsWith("Milk", "Eggs", "Bread", "Coffee");
        assertThat(JsonPath.<Integer>read(widgets, "$.shopping.left")).isEqualTo(7);
        assertThat(JsonPath.<List<String>>read(widgets, "$.shopping.lines[*].text"))
                .startsWith("Bananas", "Strawberries");
        assertThat(JsonPath.<String>read(widgets, "$.inUse.by.name")).isEqualTo("Alex");
        String ways = fetch("/v1/circles/" + linds + "/jot-ways", nora);
        assertThat(JsonPath.<Boolean>read(ways, "$.pinnedNote")).isTrue();
        assertThat(JsonPath.<String>read(ways, "$.buyList.title")).isEqualTo("Groceries");

        // "Type it": the haircut reads as on the screen, with where he went last time.
        String reading = send(
                org.springframework.http.HttpMethod.POST,
                "/v1/circles/" + linds + "/read",
                nora,
                "{\"text\":\"Haircut for Leo Saturday at 10, remind me an hour before\",\"day\":\"%s\"}"
                        .formatted(today),
                200);
        assertThat(JsonPath.<String>read(reading, "$.items[0].place.words")).isEqualTo("Barber Miha");
        assertThat(JsonPath.<String>read(reading, "$.items[0].personLabel")).isEqualTo("For Leo");
    }
}

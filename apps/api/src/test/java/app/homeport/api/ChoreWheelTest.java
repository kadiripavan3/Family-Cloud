package app.homeport.api;

import static org.assertj.core.api.Assertions.assertThat;

import com.jayway.jsonpath.JsonPath;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.temporal.IsoFields;
import java.time.temporal.TemporalAdjusters;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;

/** The chore wheel: jobs that change hands every Monday, ticks that earn stars, a count per person. */
class ChoreWheelTest extends BoardTest {

    private static final LocalDate TODAY = LocalDate.now(ZoneOffset.UTC);
    private static final LocalDate MONDAY = TODAY.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));

    private String job(String token, String wheel, String name, int times) throws Exception {
        return add(token, wheel, "job", "{\"name\":\"%s\",\"timesAWeek\":%d}".formatted(name, times));
    }

    private List<String> whose(String view) {
        return JsonPath.read(view, "$.view.jobs[*].who.name");
    }

    private List<Integer> stars(String view) {
        return JsonPath.read(view, "$.view.people[*].stars");
    }

    @Test
    void jobsTurnEveryMondayTicksEarnStarsAndStarsStayWithWhoeverEarnedThem() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String circle = circle(nora, "family", "The Linds");
        String noraId = memberOf(nora, circle);
        String alexId = join(nora, circle, alex);
        String mia = addMember(nora, circle, "Mia", "child");
        String leo = addMember(nora, circle, "Leo", "child");
        String wheel = board(
                nora,
                circle,
                "chore_wheel",
                "circle",
                "{\"people\":[\"%s\",\"%s\",\"%s\",\"%s\"],\"stars\":{\"stars\":10,\"cents\":200,\"into\":\"Mia's skates fund\"}}"
                        .formatted(noraId, alexId, mia, leo));
        job(nora, wheel, "Bins", 2);
        job(nora, wheel, "Laundry", 2);
        String table = job(nora, wheel, "Set the table", 7);
        String biscuit = job(nora, wheel, "Feed Biscuit", 1);

        // The starting week: the first job is the first person's, and so on round the wheel.
        String start = view(nora, wheel);
        assertThat(whose(start)).containsExactly("Nora", "Alex", "Mia", "Leo");
        assertThat(JsonPath.<List<String>>read(start, "$.view.jobs[*].next.name"))
                .containsExactly("Alex", "Mia", "Leo", "Nora");
        assertThat(JsonPath.<Integer>read(start, "$.view.week"))
                .isEqualTo(MONDAY.get(IsoFields.WEEK_OF_WEEK_BASED_YEAR));
        assertThat(JsonPath.<String>read(start, "$.view.weekStart")).isEqualTo(MONDAY.toString());
        assertThat(JsonPath.<String>read(start, "$.view.stars.into")).isEqualTo("Mia's skates fund");
        assertThat(JsonPath.<String>read(start, "$.view.stars.currency")).isEqualTo("EUR");

        // A tick is a star for whoever's job it is, pressed on a parent's phone. Twice is once.
        act(nora, wheel, "tick", "{\"jobId\":\"%s\"}".formatted(table), 200);
        String ticked = act(alex, wheel, "tick", "{\"jobId\":\"%s\"}".formatted(table), 200);
        assertThat(stars(ticked)).containsExactly(0, 0, 1, 0);
        assertThat(JsonPath.<List<Boolean>>read(ticked, "$.view.jobs[*].doneToday"))
                .containsExactly(false, false, true, false);
        assertThat(JsonPath.<List<Integer>>read(ticked, "$.view.jobs[*].doneThisWeek"))
                .containsExactly(0, 0, 1, 0);
        assertThat(JsonPath.<List<Boolean>>read(ticked, "$.view.jobs[*].complete"))
                .containsExactly(false, false, false, false);

        // A job that is done once a week is finished after one tick, and takes no more this week.
        String fed = act(nora, wheel, "tick", "{\"jobId\":\"%s\"}".formatted(biscuit), 200);
        assertThat(JsonPath.<Integer>read(fed, "$.view.done")).isEqualTo(1);
        assertThat(stars(fed)).containsExactly(0, 0, 1, 1);
        assertThat(JsonPath.<String>read(fetch("/v1/things/" + wheel, nora), "$.glance"))
                .isEqualTo("Week " + MONDAY.get(IsoFields.WEEK_OF_WEEK_BASED_YEAR) + " · 1 of 4 done");

        // Taking a tick back takes its star back.
        String untick = act(nora, wheel, "tick", "{\"jobId\":\"%s\",\"done\":false}".formatted(biscuit), 200);
        assertThat(stars(untick)).containsExactly(0, 0, 1, 0);

        // A week passes (the wheel was started a week earlier): every job has moved on one person,
        // and Mia's star from "her" week is still Mia's.
        setSetting(wheel, "startsOn", MONDAY.minusWeeks(1).toString());
        jdbc.sql("update board_entries set day = day - 7, client_id = null where kind = 'tick'")
                .update();
        String turned = view(nora, wheel);
        assertThat(whose(turned)).containsExactly("Alex", "Mia", "Leo", "Nora");
        assertThat(stars(turned)).containsExactly(0, 0, 1, 0);
        assertThat(JsonPath.<List<Integer>>read(turned, "$.view.jobs[*].doneThisWeek"))
                .containsExactly(0, 0, 0, 0);
        // Last week can still be looked at.
        String lastWeek = fetch("/v1/boards/" + wheel + "?show=" + MONDAY.minusDays(3), nora);
        assertThat(whose(lastWeek)).containsExactly("Nora", "Alex", "Mia", "Leo");
        assertThat(JsonPath.<List<Integer>>read(lastWeek, "$.view.jobs[*].doneThisWeek"))
                .containsExactly(0, 0, 1, 0);

        // Now the table is Leo's: the tick is his star.
        assertThat(stars(act(nora, wheel, "tick", "{\"jobId\":\"%s\"}".formatted(table), 200)))
                .containsExactly(0, 0, 1, 1);

        // Taking a job off the wheel keeps the stars; the jobs behind it move up.
        send(HttpMethod.DELETE, "/v1/board-entries/" + table, nora, null, 204);
        String without = view(nora, wheel);
        assertThat(JsonPath.<List<String>>read(without, "$.view.jobs[*].name"))
                .containsExactly("Bins", "Laundry", "Feed Biscuit");
        assertThat(stars(without)).containsExactly(0, 0, 1, 1);
        act(nora, wheel, "tick", "{\"jobId\":\"%s\"}".formatted(table), 404);
    }

    @Test
    void todayShowsYourOwnJobsAndTheChildrensAndOnlyPeopleOfTheCircleGoOnTheWheel() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String kai = person("Kai");
        String circle = circle(nora, "family", "The Linds");
        String noraId = memberOf(nora, circle);
        String alexId = join(nora, circle, alex);
        String kaiId = join(nora, circle, kai);
        send(HttpMethod.PATCH, "/v1/members/" + kaiId, nora, "{\"role\":\"teen\"}", 200);
        String mia = addMember(nora, circle, "Mia", "child");
        String biscuit = addMember(nora, circle, "Biscuit", "pet");
        String wheel = board(
                nora,
                circle,
                "chore_wheel",
                "circle",
                "{\"people\":[\"%s\",\"%s\",\"%s\",\"%s\"]}".formatted(noraId, alexId, kaiId, mia));
        job(nora, wheel, "Bins", 1);
        job(nora, wheel, "Laundry", 1);
        job(nora, wheel, "Hoover", 1);
        String table =
                add(nora, wheel, "job", "{\"name\":\"Set the table\",\"when\":\"Every evening\",\"timesAWeek\":7}");

        // Nora sees her own job and Mia's (she ticks for her). Kai, a teen, sees only his own.
        assertThat(JsonPath.<List<String>>read(fetch("/v1/circles/" + circle + "/today", nora), "$.items[*].title"))
                .containsExactly("Bins", "Set the table");
        assertThat(JsonPath.<List<String>>read(fetch("/v1/circles/" + circle + "/today", nora), "$.items[*].note"))
                .containsExactly("Your job this week", "Mia's job this week · Every evening");
        assertThat(JsonPath.<List<String>>read(fetch("/v1/circles/" + circle + "/today", kai), "$.items[*].title"))
                .containsExactly("Hoover");
        act(alex, wheel, "tick", "{\"jobId\":\"%s\"}".formatted(table), 200);
        assertThat(JsonPath.<List<Boolean>>read(fetch("/v1/circles/" + circle + "/today", nora), "$.items[*].done"))
                .containsExactly(false, true);

        // A tick is for today or a recent day, never for tomorrow.
        act(nora, wheel, "tick", "{\"jobId\":\"%s\",\"day\":\"%s\"}".formatted(table, TODAY.plusDays(1)), 400);

        // The family is also reminded of the bins by Plan, and says so on the job: it names its reminder. Today
        // then lists the job once, as the reminder, for whoever has that reminder on their list.
        String bins = JsonPath.read(view(nora, wheel), "$.view.jobs[0].id");
        String reminder = JsonPath.read(
                send(
                        HttpMethod.POST,
                        "/v1/reminders",
                        nora,
                        "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"title\":\"Take the bins out\",\"dueOn\":\"%s\",\"timeZone\":\"UTC\",\"audience\":\"circle\"}"
                                .formatted(id(), circle, TODAY),
                        201),
                "$.id");
        change(nora, bins, "{\"reminderId\":\"%s\"}".formatted(reminder), 200);
        assertThat(JsonPath.<String>read(view(nora, wheel), "$.view.jobs[0].reminderId"))
                .isEqualTo(reminder);
        String norasDay = fetch("/v1/circles/" + circle + "/today?day=" + TODAY, nora);
        assertThat(JsonPath.<List<String>>read(norasDay, "$.items[*].title"))
                .containsExactlyInAnyOrder("Take the bins out", "Set the table");
        assertThat(JsonPath.<Integer>read(norasDay, "$.left")).isEqualTo(1);
        // On a day the reminder isn't on her list, the wheel's own line is: nothing is lost, only never said twice.
        String dayAfter = fetch("/v1/circles/" + circle + "/today?day=" + TODAY.minusDays(1), nora);
        assertThat(JsonPath.<List<String>>read(dayAfter, "$.items[*].title")).contains("Bins");
        assertThat(JsonPath.<List<String>>read(dayAfter, "$.items[?(@.title == 'Bins')].sameAs"))
                .containsExactly(reminder);
        // A job can only name a reminder of its own circle that the person may see, and can let go of it again.
        String elsewhere = JsonPath.read(
                send(
                        HttpMethod.POST,
                        "/v1/reminders",
                        kai,
                        "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"title\":\"Kai's own\",\"timeZone\":\"UTC\",\"audience\":\"me\"}"
                                .formatted(id(), circle),
                        201),
                "$.id");
        change(nora, bins, "{\"reminderId\":\"%s\"}".formatted(elsewhere), 400);
        change(nora, bins, "{\"reminderId\":\"%s\"}".formatted(wheel), 400);
        change(nora, bins, "{\"reminderId\":null}", 200);
        assertThat(JsonPath.<List<String>>read(
                        fetch("/v1/circles/" + circle + "/today?day=" + TODAY, nora), "$.items[*].title"))
                .containsExactlyInAnyOrder("Take the bins out", "Bins", "Set the table");

        // Not a pet, not someone from another circle, and not nobody.
        String outsider = memberOf(kai, circle(kai, "solo", "Kai alone"));
        assertThat(send(
                        HttpMethod.PATCH,
                        "/v1/boards/" + wheel,
                        nora,
                        "{\"settings\":{\"people\":[\"%s\"]}}".formatted(biscuit),
                        400))
                .contains("A pet can't have a job on the wheel");
        send(
                HttpMethod.PATCH,
                "/v1/boards/" + wheel,
                nora,
                "{\"settings\":{\"people\":[\"%s\"]}}".formatted(outsider),
                400);
        send(HttpMethod.PATCH, "/v1/boards/" + wheel, nora, "{\"settings\":{\"people\":[]}}", 400);

        // Left out, the wheel is everyone in the circle who isn't a pet.
        String everyone = newBoard(nora, circle, "chore_wheel", null, null, 201);
        assertThat(JsonPath.<List<String>>read(everyone, "$.view.people[*].person.name"))
                .containsExactly("Nora", "Alex", "Kai", "Mia");
    }
}

package app.homeport.api;

import static org.assertj.core.api.Assertions.assertThat;

import com.jayway.jsonpath.JsonPath;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;

/**
 * The one sharing rule, for events, reminders and goals, through every way each can be reached: by its id,
 * in the day's list, in the month, on Today, on the widgets, in its own list, and in search (by its title
 * and by words inside it). For one viewer all the ways have to agree.
 */
class PlanSharingTest extends PlanTestBase {

    private String event;
    private String reminder;
    private String goal;

    /** Nora keeps an event, a reminder and a goal, each as shared as {@code audience} says. */
    private void noraKeepsOneOfEach(String audience) throws Exception {
        String shared = audience == null ? "" : ",\"audience\":\"" + audience + "\"";
        event = event(nora, "Dentist", TODAY, "15:30", ",\"place\":\"Trubarjeva 12\"" + shared);
        reminder = reminder(
                nora,
                "Renew the passport",
                ",\"dueOn\":\"" + TODAY + "\",\"notes\":\"Bring biometric photos\"" + shared);
        goal = goal(nora, "Norway", ",\"target\":8000,\"current\":5600,\"blurb\":\"By train and ferry\"" + shared);
    }

    private boolean contains(String path, String token, String id) throws Exception {
        return fetch(path, token).contains(id);
    }

    /** True when this person can reach the event by any way. The ways must all agree. */
    private boolean seesEvent(String token) throws Exception {
        String c = "/v1/circles/" + circle;
        List<Boolean> ways = List.of(
                status("/v1/events/" + event, token) == 200,
                status("/v1/things/" + event, token) == 200,
                status("/v1/things/" + event + "/audience", token) == 200,
                status("/v1/things/" + event + "/links", token) == 200,
                contains(c + "/plan?day=" + TODAY, token, event),
                !JsonPath.<List<Object>>read(
                                fetch(c + "/month?month=2026-11", token),
                                "$.days[?(@.day == '" + TODAY + "')].dots[?(@.memberId == '" + noraId + "')]")
                        .isEmpty(),
                contains(c + "/today?day=" + TODAY, token, event),
                contains(c + "/widgets?day=" + TODAY, token, event),
                contains(c + "/search?q=Dentist", token, event),
                contains(c + "/search?q=Trubarjeva", token, event));
        assertThat(ways)
                .as("every way to reach the event gives the same answer")
                .containsOnly(ways.get(0));
        return ways.get(0);
    }

    private boolean seesReminder(String token) throws Exception {
        String c = "/v1/circles/" + circle;
        List<Boolean> ways = List.of(
                status("/v1/reminders/" + reminder, token) == 200,
                status("/v1/things/" + reminder, token) == 200,
                status("/v1/things/" + reminder + "/audience", token) == 200,
                contains(c + "/plan?day=" + TODAY, token, reminder),
                contains(c + "/search?q=passport", token, reminder),
                contains(c + "/search?q=biometric", token, reminder));
        assertThat(ways)
                .as("every way to reach the reminder gives the same answer")
                .containsOnly(ways.get(0));
        return ways.get(0);
    }

    private boolean seesGoal(String token) throws Exception {
        String c = "/v1/circles/" + circle;
        List<Boolean> ways = List.of(
                status("/v1/goals/" + goal, token) == 200,
                status("/v1/goals/" + goal + "/entries", token) == 200,
                status("/v1/things/" + goal, token) == 200,
                status("/v1/things/" + goal + "/audience", token) == 200,
                contains(c + "/goals", token, goal),
                contains(c + "/search?q=Norway", token, goal),
                contains(c + "/search?q=ferry", token, goal));
        assertThat(ways).as("every way to reach the goal gives the same answer").containsOnly(ways.get(0));
        return ways.get(0);
    }

    @Test
    void inAFamilyAnEventAReminderAndAGoalAreYoursAloneUntilYouShareThem() throws Exception {
        theLinds();
        noraKeepsOneOfEach(null);

        assertThat(seesEvent(nora)).isTrue();
        assertThat(seesReminder(nora)).isTrue();
        assertThat(seesGoal(nora)).isTrue();
        assertThat(seesEvent(alex)).isFalse();
        assertThat(seesReminder(alex)).isFalse();
        assertThat(seesGoal(alex)).isFalse();
        // Nothing of them leaks into what Alex is shown: not a dot, not a count, not a line.
        String c = "/v1/circles/" + circle;
        assertThat(JsonPath.<List<Object>>read(fetch(c + "/month?month=2026-11", alex), "$.days[*].dots[*]"))
                .isEmpty();
        assertThat(JsonPath.<Integer>read(fetch(c + "/today?day=" + TODAY, alex), "$.items.length()"))
                .isZero();
        assertThat(JsonPath.<Integer>read(fetch(c + "/reminders?day=" + TODAY, alex), "$.yoursCount"))
                .isZero();
        assertThat(fetch(c + "/reminders?day=" + TODAY, alex)).doesNotContain(reminder);
        assertThat(fetch(c + "/goals", alex)).isEqualTo("[]");
        // And he can change nothing of them: to him they aren't there.
        send(HttpMethod.PATCH, "/v1/events/" + event, alex, "{\"title\":\"Mine\"}", 404);
        send(HttpMethod.PUT, "/v1/events/" + event + "/answer", alex, "{\"answer\":\"going\"}", 404);
        send(
                HttpMethod.POST,
                "/v1/events/" + event + "/guests",
                alex,
                "{\"clientId\":\"%s\",\"name\":\"Jan\"}".formatted(id()),
                404);
        send(HttpMethod.PATCH, "/v1/reminders/" + reminder, alex, "{\"title\":\"Mine\"}", 404);
        send(HttpMethod.PUT, "/v1/reminders/" + reminder + "/done", alex, "{\"done\":true}", 404);
        send(HttpMethod.POST, "/v1/reminders/" + reminder + "/nudge", alex, null, 404);
        send(HttpMethod.PATCH, "/v1/goals/" + goal, alex, "{\"title\":\"Mine\"}", 404);
        send(
                HttpMethod.POST,
                "/v1/goals/" + goal + "/entries",
                alex,
                "{\"clientId\":\"%s\",\"amount\":5}".formatted(id()),
                404);
        send(HttpMethod.DELETE, "/v1/things/" + event, alex, null, 404);
    }

    @Test
    void someoneWhoIsNotInTheCircleSeesNothingOfItsPlan() throws Exception {
        theLinds();
        noraKeepsOneOfEach("circle");
        String stranger = person("Stranger");
        String c = "/v1/circles/" + circle;

        for (String path : List.of(
                "/v1/events/" + event,
                "/v1/reminders/" + reminder,
                "/v1/goals/" + goal,
                "/v1/goals/" + goal + "/entries",
                c + "/plan",
                c + "/month",
                c + "/reminders",
                c + "/reminders/done",
                c + "/goals",
                c + "/jots",
                c + "/jot-ways",
                c + "/widgets")) {
            assertThat(status(path, stranger)).as(path).isEqualTo(404);
        }
        // And can put nothing into it.
        for (String kind : List.of("events", "reminders", "goals")) {
            send(
                    HttpMethod.POST,
                    "/v1/" + kind,
                    stranger,
                    "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"title\":\"Hello\",\"day\":\"%s\",\"timeZone\":\"%s\",\"target\":5}"
                            .formatted(id(), circle, TODAY, ZONE),
                    404);
        }
        send(HttpMethod.POST, c + "/read", stranger, "{\"text\":\"milk\"}", 404);
        send(HttpMethod.POST, c + "/jots", stranger, "{\"clientId\":\"%s\",\"text\":\"milk\"}".formatted(id()), 404);
    }

    @Test
    void sharedToLookAtItCanBeSeenEverywhereAndChangedNowhere() throws Exception {
        theLinds();
        String kai = person("Kai");
        join(nora, circle, kai);
        noraKeepsOneOfEach(null);
        String view =
                "{\"audience\":\"some\",\"people\":[{\"memberId\":\"%s\",\"access\":\"view\"}]}".formatted(alexId);
        for (String thing : List.of(event, reminder, goal)) {
            share(nora, thing, view);
        }

        assertThat(seesEvent(alex)).isTrue();
        assertThat(seesReminder(alex)).isTrue();
        assertThat(seesGoal(alex)).isTrue();
        assertThat(seesEvent(kai)).isFalse();
        assertThat(seesReminder(kai)).isFalse();
        assertThat(seesGoal(kai)).isFalse();
        assertThat(JsonPath.<Boolean>read(fetch("/v1/events/" + event, alex), "$.canEdit"))
                .isFalse();
        assertThat(JsonPath.<List<String>>read(fetch("/v1/goals/" + goal, alex), "$.chip.people[*].name"))
                .containsExactly("Alex");

        send(HttpMethod.PATCH, "/v1/events/" + event, alex, "{\"title\":\"Mine\"}", 403);
        send(
                HttpMethod.POST,
                "/v1/events/" + event + "/guests",
                alex,
                "{\"clientId\":\"%s\",\"name\":\"Jan\"}".formatted(id()),
                403);
        send(HttpMethod.PATCH, "/v1/reminders/" + reminder, alex, "{\"title\":\"Mine\"}", 403);
        send(HttpMethod.PUT, "/v1/reminders/" + reminder + "/done", alex, "{\"done\":true}", 403);
        send(HttpMethod.POST, "/v1/reminders/" + reminder + "/nudge", alex, null, 403);
        send(HttpMethod.PATCH, "/v1/goals/" + goal, alex, "{\"title\":\"Mine\"}", 403);
        send(
                HttpMethod.POST,
                "/v1/goals/" + goal + "/entries",
                alex,
                "{\"clientId\":\"%s\",\"amount\":5}".formatted(id()),
                403);
        String entry = JsonPath.read(fetch("/v1/goals/" + goal + "/entries", alex), "$.items[0].id");
        send(HttpMethod.DELETE, "/v1/goal-entries/" + entry, alex, null, 403);
        send(HttpMethod.DELETE, "/v1/goal-entries/" + entry, kai, null, 404);
        send(HttpMethod.DELETE, "/v1/things/" + goal, alex, null, 403);
        // Looking is enough to say whether you are coming.
        send(HttpMethod.PUT, "/v1/events/" + event + "/answer", alex, "{\"answer\":\"cant\"}", 200);

        // Shared to change: now he can.
        String edit =
                "{\"audience\":\"some\",\"people\":[{\"memberId\":\"%s\",\"access\":\"edit\"}]}".formatted(alexId);
        for (String thing : List.of(event, reminder, goal)) {
            share(nora, thing, edit);
        }
        send(HttpMethod.PATCH, "/v1/events/" + event, alex, "{\"place\":\"Trubarjeva 14\"}", 200);
        send(HttpMethod.PUT, "/v1/reminders/" + reminder + "/done", alex, "{\"done\":true}", 200);
        send(
                HttpMethod.POST,
                "/v1/goals/" + goal + "/entries",
                alex,
                "{\"clientId\":\"%s\",\"amount\":5}".formatted(id()),
                201);
        // Deleting stays with whoever made it: the same route as for every kind of thing.
        send(HttpMethod.DELETE, "/v1/things/" + event, alex, null, 403);
        send(HttpMethod.DELETE, "/v1/things/" + event, nora, null, 204);
        assertThat(status("/v1/events/" + event, nora)).isEqualTo(404);
        assertThat(jdbc.sql("select count(*) from events").query(Integer.class).single())
                .isZero();
    }

    @Test
    void hiddenFromOnePersonItIsNowhereForThemUntilTheDayAfter() throws Exception {
        theLinds();
        String mia = person("Mia");
        String miaWithPhone = join(nora, circle, mia);
        noraKeepsOneOfEach("circle");
        assertThat(seesEvent(mia)).isTrue();
        assertThat(seesGoal(mia)).isTrue();

        String hidden = "{\"audience\":\"circle\",\"hiddenFrom\":[{\"memberId\":\"%s\",\"through\":\"%s\"}]}"
                .formatted(miaWithPhone, java.time.LocalDate.now().plusDays(3));
        for (String thing : List.of(event, reminder, goal)) {
            share(nora, thing, hidden);
        }

        assertThat(seesEvent(mia)).isFalse();
        assertThat(seesReminder(mia)).isFalse();
        assertThat(seesGoal(mia)).isFalse();
        assertThat(seesEvent(alex)).isTrue();
        assertThat(JsonPath.<List<String>>read(fetch("/v1/events/" + event, alex), "$.chip.hiddenFrom"))
                .containsExactly("Mia");
        assertThat(JsonPath.<List<String>>read(
                        fetch("/v1/circles/" + circle + "/plan?day=" + TODAY, alex),
                        "$.days[0].entries[0].chip.hiddenFrom"))
                .containsExactly("Mia");
        // She can't be given the reminder while it is hidden from her.
        send(
                HttpMethod.PATCH,
                "/v1/reminders/" + reminder,
                nora,
                "{\"givenTo\":[\"%s\"]}".formatted(miaWithPhone),
                409);

        jdbc.sql("update thing_hides set through = current_date - 1").update();
        assertThat(seesEvent(mia)).isTrue();
        assertThat(seesReminder(mia)).isTrue();
        assertThat(seesGoal(mia)).isTrue();
    }

    @Test
    void todayShowsAReminderOnlyToWhoeverHasItOrAskedForItAndOnlyWhileTheyMaySeeIt() throws Exception {
        theLinds();
        String kai = person("Kai");
        join(nora, circle, kai);
        String bins = reminder(
                nora,
                "Take the bins out",
                ",\"dueOn\":\"" + TODAY
                        + "\",\"dueTime\":\"19:00\",\"audience\":\"circle\",\"givenTo\":[\"%s\"]".formatted(alexId));
        String c = "/v1/circles/" + circle;

        // It is Alex's job and Nora asked for it: on both their Todays. Kai can see it on the calendar, and that is
        // all.
        assertThat(fetch(c + "/today?day=" + TODAY, alex)).contains(bins);
        assertThat(fetch(c + "/today?day=" + TODAY, nora)).contains(bins);
        assertThat(fetch(c + "/today?day=" + TODAY, kai)).doesNotContain(bins);
        assertThat(fetch(c + "/plan?day=" + TODAY, kai)).contains(bins);
        assertThat(JsonPath.<Integer>read(fetch(c + "/reminders?day=" + TODAY, kai), "$.yoursCount"))
                .isZero();

        // Hidden from Alex, it leaves his Today and his list although it was given to him.
        share(nora, bins, "{\"audience\":\"circle\",\"hiddenFrom\":[{\"memberId\":\"%s\"}]}".formatted(alexId));
        assertThat(fetch(c + "/today?day=" + TODAY, alex)).doesNotContain(bins);
        assertThat(fetch(c + "/reminders?day=" + TODAY, alex)).doesNotContain(bins);
        assertThat(fetch(c + "/widgets?day=" + TODAY, alex)).doesNotContain(bins);
        send(HttpMethod.PUT, "/v1/reminders/" + bins + "/done", alex, "{\"done\":true}", 404);
    }
}

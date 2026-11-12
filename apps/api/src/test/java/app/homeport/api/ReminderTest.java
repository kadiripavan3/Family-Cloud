package app.homeport.api;

import static org.assertj.core.api.Assertions.assertThat;

import app.homeport.api.notify.LoggingPushSender;
import app.homeport.api.notify.PushMessage;
import com.jayway.jsonpath.JsonPath;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;

/** Reminders: yours and the ones you gave away, ticking, coming round again, taking turns, and waiting for a place. */
class ReminderTest extends PlanTestBase {

    @Autowired
    LoggingPushSender pushes;

    private String tick(String token, String id, boolean done, String dueOn, int expected) throws Exception {
        return send(
                HttpMethod.PUT,
                "/v1/reminders/" + id + "/done",
                token,
                "{\"done\":%s,\"day\":\"%s\"%s}"
                        .formatted(done, TODAY, dueOn == null ? "" : ",\"dueOn\":\"" + dueOn + "\""),
                expected);
    }

    /** The tests have a "today" of their own; a tick is made at the real moment. This puts the ticks at a moment of that day. */
    private void tickedAt(String moment) {
        jdbc.sql("update reminder_ticks set done_at = cast(:at as timestamptz)")
                .param("at", moment)
                .update();
    }

    private String list(String token) throws Exception {
        return fetch("/v1/circles/" + circle + "/reminders?day=" + TODAY, token);
    }

    @Test
    void aReminderSentTwiceIsMadeOnceAndTheScreenShowsYoursByDayWhatYouAskedAndThePlaces() throws Exception {
        theLinds();
        String body =
                "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"title\":\"Call the plumber\",\"dueOn\":\"2026-11-12\",\"dueTime\":\"09:00\",\"timeZone\":\"%s\"}"
                        .formatted(id(), circle, ZONE);
        String first = send(HttpMethod.POST, "/v1/reminders", nora, body, 201);
        String second = send(HttpMethod.POST, "/v1/reminders", nora, body, 201);
        assertThat(JsonPath.<String>read(second, "$.id")).isEqualTo(JsonPath.<String>read(first, "$.id"));
        assertThat(JsonPath.<String>read(first, "$.dueTime")).isEqualTo("09:00");
        assertThat(JsonPath.<String>read(first, "$.dueAt")).isEqualTo("2026-11-12T08:00:00Z");

        reminder(nora, "Sign the form", ",\"dueOn\":\"2026-11-13\"");
        reminder(nora, "Pay the school", ",\"dueOn\":\"2026-11-09\"");
        reminder(nora, "Sort the photos", "");
        String car = reminder(nora, "Book the car service", ",\"givenTo\":[\"%s\"]".formatted(alexId));
        reminder(
                nora,
                "Pick up the parcel",
                ",\"place\":{\"words\":\"the post office\",\"lat\":46.0514,\"lng\":14.506}");
        reminder(nora, "Milk and bread", ",\"givenTo\":[\"%s\"],\"place\":{\"words\":\"the shop\"}".formatted(alexId));
        jdbc.sql("update things set created_at = timestamptz '2026-11-09 18:00+01' where id = cast(:id as uuid)")
                .param("id", car)
                .update();

        String screen = list(nora);

        assertThat(JsonPath.<Integer>read(screen, "$.yoursCount")).isEqualTo(5);
        assertThat(JsonPath.<Integer>read(screen, "$.askedCount")).isEqualTo(2);
        // Yours, by day. What is overdue stands under today; what has no day comes last.
        assertThat(JsonPath.<List<String>>read(screen, "$.yours[*].day"))
                .containsExactly("2026-11-11", "2026-11-12", "2026-11-13", null);
        assertThat(JsonPath.<List<String>>read(screen, "$.yours[0].reminders[*].title"))
                .containsExactly("Pay the school");
        assertThat(JsonPath.<String>read(screen, "$.yours[0].reminders[0].note"))
                .isEqualTo("was due Monday");
        assertThat(JsonPath.<String>read(screen, "$.yours[1].reminders[0].note"))
                .isEqualTo("9:00 · due tomorrow");
        assertThat(JsonPath.<String>read(screen, "$.yours[2].reminders[0].note"))
                .isEqualTo("due Friday");
        assertThat(JsonPath.<List<String>>read(screen, "$.yours[3].reminders[*].title"))
                .containsExactly("Sort the photos");
        // What she asked of Alex, and since when.
        assertThat(JsonPath.<List<String>>read(screen, "$.asked[*].title")).containsExactly("Book the car service");
        assertThat(JsonPath.<String>read(screen, "$.asked[0].note")).isEqualTo("Asked on Monday · not done yet");
        assertThat(JsonPath.<List<String>>read(screen, "$.asked[0].givenTo[*].name"))
                .containsExactly("Alex");
        assertThat(JsonPath.<Boolean>read(screen, "$.asked[0].canNudge")).isTrue();
        // The ones that wait for a place, with the point the phone watches.
        assertThat(JsonPath.<List<String>>read(screen, "$.places[*].note"))
                .containsExactly("When you're near the post office", "When Alex is near the shop");
        assertThat(JsonPath.<Double>read(screen, "$.places[0].place.lat")).isEqualTo(46.0514);
        assertThat(JsonPath.<Integer>read(screen, "$.places[0].place.radiusM"))
                .as("how near counts, when nothing was said")
                .isEqualTo(200);
        assertThat(JsonPath.<Object>read(screen, "$.places[1].place.lat")).isNull();
        assertThat(JsonPath.<String>read(screen, "$.places[0].noteIcon")).isEqualTo("pin");

        // For Alex the same two are his to do, and nothing of hers that she didn't give him.
        String his = list(alex);
        assertThat(JsonPath.<Integer>read(his, "$.yoursCount")).isEqualTo(2);
        assertThat(JsonPath.<List<String>>read(his, "$.yours[*].reminders[*].title"))
                .containsExactly("Book the car service");
        assertThat(JsonPath.<List<String>>read(his, "$.yours[*].reminders[*].note"))
                .as("what someone else gave you says who it is from")
                .containsExactly("from Nora");
        assertThat(JsonPath.<List<String>>read(his, "$.places[*].note")).containsExactly("When you're near the shop");
        assertThat(JsonPath.<List<String>>read(his, "$.asked")).isEmpty();
    }

    @Test
    void givingAReminderShowsItToThemAndTheyMayTickItButNotChangeIt() throws Exception {
        theLinds();
        String kai = person("Kai");
        String kaiId = join(nora, circle, kai);
        String id = reminder(
                nora, "Book the car service", ",\"dueOn\":\"2026-11-11\",\"givenTo\":[\"%s\"]".formatted(alexId));

        // Only Nora's until she gave it to Alex: now he sees it, and only he.
        String asAlex = fetch("/v1/reminders/" + id + "?day=" + TODAY, alex);
        assertThat(JsonPath.<Boolean>read(asAlex, "$.yours")).isTrue();
        assertThat(JsonPath.<Boolean>read(asAlex, "$.canEdit")).isFalse();
        assertThat(JsonPath.<Boolean>read(asAlex, "$.canTick")).isTrue();
        assertThat(JsonPath.<String>read(asAlex, "$.askedBy.name")).isEqualTo("Nora");
        assertThat(JsonPath.<String>read(asAlex, "$.chip.audience")).isEqualTo("some");
        send(HttpMethod.GET, "/v1/reminders/" + id, kai, null, 404);
        send(HttpMethod.PATCH, "/v1/reminders/" + id, alex, "{\"title\":\"Later\"}", 403);

        String done = tick(alex, id, true, "2026-11-11", 200);
        assertThat(JsonPath.<Boolean>read(done, "$.done")).isTrue();
        assertThat(JsonPath.<String>read(done, "$.doneBy.name")).isEqualTo("Alex");
        String forNora = list(nora);
        assertThat(JsonPath.<Integer>read(forNora, "$.askedCount")).isZero();
        assertThat(JsonPath.<List<Boolean>>read(forNora, "$.asked[*].done"))
                .as("she sees today that he did it")
                .containsExactly(true);
        assertThat(JsonPath.<String>read(forNora, "$.asked[0].note")).startsWith("Done at ");

        // Taking the tick away opens it again. Giving it to someone else shows it to them too.
        tick(alex, id, false, null, 200);
        assertThat(JsonPath.<Boolean>read(fetch("/v1/reminders/" + id + "?day=" + TODAY, nora), "$.done"))
                .isFalse();
        send(
                HttpMethod.PATCH,
                "/v1/reminders/" + id,
                nora,
                "{\"givenTo\":[\"%s\",\"%s\"]}".formatted(alexId, kaiId),
                200);
        send(HttpMethod.GET, "/v1/reminders/" + id, kai, null, 200);
        // Taking it back from everyone makes it hers to do; they still see it until she changes who does.
        String back = send(HttpMethod.PATCH, "/v1/reminders/" + id, nora, "{\"givenTo\":[]}", 200);
        assertThat(JsonPath.<Boolean>read(back, "$.yours")).isTrue();
        tick(kai, id, true, null, 403);

        // Only people of the circle, and never a pet.
        String dog = addMember(nora, circle, "Biscuit", "pet");
        send(HttpMethod.PATCH, "/v1/reminders/" + id, nora, "{\"givenTo\":[\"%s\"]}".formatted(dog), 400);
        send(HttpMethod.PATCH, "/v1/reminders/" + id, nora, "{\"givenTo\":[\"%s\"]}".formatted(id()), 400);
    }

    @Test
    void tickingARepeatingReminderMakesTheNextOneDueAndATickSentTwiceCountsOnce() throws Exception {
        theLinds();
        String id = reminder(
                nora,
                "Feed Biscuit",
                ",\"dueOn\":\"2026-11-11\",\"dueTime\":\"07:30\",\"repeat\":{\"unit\":\"day\"},\"givenTo\":[\"%s\"],\"stars\":1,\"audience\":\"circle\""
                        .formatted(leoId));

        String ticked = tick(nora, id, true, "2026-11-11", 200);
        tickedAt("2026-11-11 07:40+01");
        assertThat(JsonPath.<Boolean>read(ticked, "$.done"))
                .as("done for today")
                .isTrue();
        assertThat(JsonPath.<String>read(ticked, "$.dueOn"))
                .as("and due again tomorrow")
                .isEqualTo("2026-11-12");
        assertThat(JsonPath.<String>read(ticked, "$.tickedDueOn")).isEqualTo("2026-11-11");
        assertThat(JsonPath.<String>read(ticked, "$.note")).endsWith(" · 1 star");

        // The same tick arrives again after a bad connection: nothing moves.
        String again = tick(nora, id, true, "2026-11-11", 200);
        assertThat(JsonPath.<String>read(again, "$.dueOn")).isEqualTo("2026-11-12");
        assertThat(jdbc.sql("select count(*) from reminder_ticks")
                        .query(Integer.class)
                        .single())
                .isEqualTo(1);

        // The calendar: ticked today, open tomorrow and the day after. Tomorrow it is simply due again.
        String plan = fetch("/v1/circles/" + circle + "/plan?day=" + TODAY + "&days=3", nora);
        assertThat(JsonPath.<List<Boolean>>read(plan, "$.days[*].entries[0].done"))
                .containsExactly(true, false, false);
        assertThat(JsonPath.<List<Boolean>>read(plan, "$.days[*].entries[0].canTick"))
                .containsExactly(false, true, false);
        assertThat(JsonPath.<Boolean>read(fetch("/v1/reminders/" + id + "?day=2026-11-12", nora), "$.done"))
                .isFalse();

        // Taking today's tick away puts it back on today.
        String back = tick(nora, id, false, "2026-11-11", 200);
        assertThat(JsonPath.<String>read(back, "$.dueOn")).isEqualTo("2026-11-11");
        assertThat(JsonPath.<Boolean>read(back, "$.done")).isFalse();

        // Ticked days late, the next one is after today, not after the day it was due.
        send(HttpMethod.PATCH, "/v1/reminders/" + id, nora, "{\"dueOn\":\"2026-11-08\",\"dueTime\":\"07:30\"}", 200);
        assertThat(JsonPath.<String>read(tick(nora, id, true, "2026-11-08", 200), "$.dueOn"))
                .isEqualTo("2026-11-12");

        tickedAt("2026-11-11 07:45+01");

        // When it stops repeating, the last tick finishes it.
        send(
                HttpMethod.PATCH,
                "/v1/reminders/" + id,
                nora,
                "{\"repeat\":{\"unit\":\"day\",\"until\":\"2026-11-12\"}}",
                200);
        String last = tick(nora, id, true, "2026-11-12", 200);
        assertThat(JsonPath.<Boolean>read(last, "$.done")).isTrue();
        assertThat(JsonPath.<Boolean>read(fetch("/v1/reminders/" + id + "?day=2026-11-20", nora), "$.done"))
                .isTrue();
    }

    @Test
    void takingTurnsHandsItOnWithEachTickAndBackWhenTheTickIsTakenAway() throws Exception {
        theLinds();
        String id = reminder(
                nora,
                "Take the bins out",
                ",\"dueOn\":\"2026-11-11\",\"dueTime\":\"19:00\",\"repeat\":{\"unit\":\"week\",\"days\":[\"tue\",\"fri\"]},"
                        + "\"givenTo\":[\"%s\",\"%s\"],\"takesTurns\":true,\"audience\":\"circle\""
                                .formatted(noraId, alexId));

        String mine = fetch("/v1/reminders/" + id + "?day=" + TODAY, nora);
        assertThat(JsonPath.<String>read(mine, "$.turn.name")).isEqualTo("Nora");
        assertThat(JsonPath.<String>read(mine, "$.then.name")).isEqualTo("Alex");
        assertThat(JsonPath.<Boolean>read(mine, "$.yours")).isTrue();
        assertThat(JsonPath.<String>read(mine, "$.note")).isEqualTo("19:00 · Tue and Fri · takes turns");
        assertThat(JsonPath.<Boolean>read(fetch("/v1/reminders/" + id + "?day=" + TODAY, alex), "$.yours"))
                .as("not his until it is his turn")
                .isFalse();
        // The calendar says whose turn each time is: tonight hers, Friday his, Tuesday hers again.
        assertThat(day(nora, "2026-11-11"))
                .containsExactly("19:00|Take the bins out|Tue and Fri · your turn, then Alex");
        assertThat(day(nora, "2026-11-13"))
                .containsExactly("19:00|Take the bins out|Tue and Fri · Alex's turn, then you");
        assertThat(day(alex, "2026-11-13"))
                .containsExactly("19:00|Take the bins out|Tue and Fri · your turn, then Nora");
        assertThat(day(nora, "2026-11-17"))
                .containsExactly("19:00|Take the bins out|Tue and Fri · your turn, then Alex");

        // She ticks: it is Alex's on Friday.
        String ticked = tick(nora, id, true, "2026-11-11", 200);
        assertThat(JsonPath.<String>read(ticked, "$.dueOn")).isEqualTo("2026-11-13");
        assertThat(JsonPath.<String>read(ticked, "$.turn.name")).isEqualTo("Alex");
        assertThat(JsonPath.<Boolean>read(fetch("/v1/reminders/" + id + "?day=2026-11-13", alex), "$.yours"))
                .isTrue();
        tick(nora, id, true, "2026-11-11", 200);
        assertThat(JsonPath.<String>read(fetch("/v1/reminders/" + id + "?day=2026-11-13", nora), "$.turn.name"))
                .as("a tick sent twice never skips a turn")
                .isEqualTo("Alex");

        // The tick is taken away: tonight again, and hers again.
        String back = tick(nora, id, false, "2026-11-11", 200);
        assertThat(JsonPath.<String>read(back, "$.dueOn")).isEqualTo("2026-11-11");
        assertThat(JsonPath.<String>read(back, "$.turn.name")).isEqualTo("Nora");

        // Whose turn it is can be set by hand, to one of them.
        send(HttpMethod.PATCH, "/v1/reminders/" + id, nora, "{\"turn\":\"%s\"}".formatted(alexId), 200);
        assertThat(JsonPath.<String>read(fetch("/v1/reminders/" + id, nora), "$.turn.name"))
                .isEqualTo("Alex");
        send(HttpMethod.PATCH, "/v1/reminders/" + id, nora, "{\"turn\":\"%s\"}".formatted(miaId), 400);
        // Taking turns needs two people and something that repeats.
        send(HttpMethod.PATCH, "/v1/reminders/" + id, nora, "{\"givenTo\":[\"%s\"]}".formatted(alexId), 400);
        send(HttpMethod.PATCH, "/v1/reminders/" + id, nora, "{\"stopRepeating\":true}", 400);
        send(HttpMethod.PATCH, "/v1/reminders/" + id, nora, "{\"stopRepeating\":true,\"takesTurns\":false}", 200);
    }

    @Test
    void aReminderKeepsToItsRules() throws Exception {
        theLinds();
        String problem = send(
                HttpMethod.POST,
                "/v1/reminders",
                nora,
                "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"title\":\"Bins\",\"dueTime\":\"19:00\",\"timeZone\":\"%s\"}"
                        .formatted(id(), circle, ZONE),
                400);
        assertThat(JsonPath.<String>read(problem, "$.detail")).isEqualTo("Choose a day for that time.");
        send(
                HttpMethod.POST,
                "/v1/reminders",
                nora,
                "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"title\":\"Bins\",\"repeat\":{\"unit\":\"week\"},\"timeZone\":\"%s\"}"
                        .formatted(id(), circle, ZONE),
                400);
        send(
                HttpMethod.POST,
                "/v1/reminders",
                nora,
                "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"title\":\"Parcel\",\"place\":{\"words\":\"the post office\",\"lat\":46.05},\"timeZone\":\"%s\"}"
                        .formatted(id(), circle, ZONE),
                400);
        send(
                HttpMethod.POST,
                "/v1/reminders",
                nora,
                "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"title\":\"\",\"timeZone\":\"%s\"}"
                        .formatted(id(), circle, ZONE),
                400);

        // A day can be taken away again, and a place.
        String id = reminder(nora, "Parcel", ",\"dueOn\":\"2026-11-12\",\"place\":{\"words\":\"the post office\"}");
        String plain = send(
                HttpMethod.PATCH,
                "/v1/reminders/" + id,
                nora,
                "{\"removeDue\":true,\"removePlace\":true,\"notes\":\"Ask for Ines\"}",
                200);
        assertThat(JsonPath.<Object>read(plain, "$.dueOn")).isNull();
        assertThat(JsonPath.<Object>read(plain, "$.place")).isNull();
        assertThat(JsonPath.<String>read(plain, "$.notes")).isEqualTo("Ask for Ines");
        assertThat(fetch("/v1/circles/" + circle + "/search?q=ines", nora)).contains(id);
    }

    @Test
    void aNudgeGoesToWhoeverHasItOnceAnHourAndOnlyFromWhoeverAskedForIt() throws Exception {
        theLinds();
        send(
                HttpMethod.PUT,
                "/v1/me/devices",
                alex,
                "{\"token\":\"ExponentPushToken[alex-phone]\",\"platform\":\"ios\",\"timeZone\":\"%s\"}"
                        .formatted(ZONE),
                204);
        String id = reminder(nora, "Book the car service", ",\"givenTo\":[\"%s\"]".formatted(alexId));
        pushes.clear();

        send(HttpMethod.POST, "/v1/reminders/" + id + "/nudge", alex, null, 403);
        send(HttpMethod.POST, "/v1/reminders/" + id + "/nudge", nora, null, 204);

        assertThat(pushes.sent()).extracting(PushMessage::token).containsExactly("ExponentPushToken[alex-phone]");
        assertThat(pushes.sent().get(0).title()).isEqualTo("Book the car service");
        assertThat(pushes.sent().get(0).body()).isEqualTo("A gentle nudge from Nora.");
        assertThat(pushes.sent().get(0).url()).isEqualTo("/reminder/" + id);
        // Not again within the hour.
        String problem = send(HttpMethod.POST, "/v1/reminders/" + id + "/nudge", nora, null, 409);
        assertThat(JsonPath.<String>read(problem, "$.detail")).isEqualTo("You nudged a moment ago. Give it an hour.");
        assertThat(JsonPath.<Boolean>read(fetch("/v1/reminders/" + id, nora), "$.canNudge"))
                .isFalse();
        // And nobody is nudged about what is done, or about what is your own.
        tick(alex, id, true, null, 200);
        jdbc.sql("update reminders set nudged_at = null").update();
        send(HttpMethod.POST, "/v1/reminders/" + id + "/nudge", nora, null, 409);
        send(HttpMethod.POST, "/v1/reminders/" + reminder(nora, "My own", "") + "/nudge", nora, null, 409);
        assertThat(pushes.sent()).hasSize(1);
    }

    @Test
    void whatWasTickedIsListedLastFirstInPagesThatNeitherRepeatNorSkip() throws Exception {
        theLinds();
        String daily =
                reminder(nora, "Feed Biscuit", ",\"dueOn\":\"2026-11-01\",\"repeat\":{\"unit\":\"day\"},\"stars\":2");
        for (int day = 1; day <= 5; day++) {
            send(
                    HttpMethod.PUT,
                    "/v1/reminders/" + daily + "/done",
                    nora,
                    "{\"done\":true,\"dueOn\":\"2026-11-0%d\",\"day\":\"2026-11-0%d\"}".formatted(day, day),
                    200);
        }
        tick(nora, reminder(nora, "Post the letter", ""), true, null, 200);

        String first = fetch("/v1/circles/" + circle + "/reminders/done?limit=4", nora);
        assertThat(JsonPath.<List<String>>read(first, "$.items[*].title"))
                .containsExactly("Post the letter", "Feed Biscuit", "Feed Biscuit", "Feed Biscuit");
        assertThat(JsonPath.<List<String>>read(first, "$.items[*].dueOn"))
                .containsExactly(null, "2026-11-05", "2026-11-04", "2026-11-03");
        assertThat(JsonPath.<Integer>read(first, "$.items[1].stars")).isEqualTo(2);
        assertThat(JsonPath.<String>read(first, "$.items[1].doneBy.name")).isEqualTo("Nora");
        String second = fetch(
                "/v1/circles/" + circle + "/reminders/done?limit=4&cursor="
                        + JsonPath.<String>read(first, "$.nextCursor"),
                nora);
        assertThat(JsonPath.<List<String>>read(second, "$.items[*].dueOn")).containsExactly("2026-11-02", "2026-11-01");
        assertThat(JsonPath.<Object>read(second, "$.nextCursor")).isNull();
        // Only what you may see: Alex has no part in these.
        assertThat(JsonPath.<List<String>>read(fetch("/v1/circles/" + circle + "/reminders/done", alex), "$.items"))
                .isEmpty();
    }
}

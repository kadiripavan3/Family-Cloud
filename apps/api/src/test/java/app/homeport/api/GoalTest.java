package app.homeport.api;

import static org.assertj.core.api.Assertions.assertThat;

import com.jayway.jsonpath.JsonPath;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;

/** Goals: a target, what people put in, and what that means for the ring and the sentences next to it. */
class GoalTest extends PlanTestBase {

    private String put(String token, String goal, long amount, String day, String more) throws Exception {
        return send(
                HttpMethod.POST,
                "/v1/goals/" + goal + "/entries",
                token,
                "{\"clientId\":\"%s\",\"amount\":%d,\"day\":\"%s\"%s}".formatted(id(), amount, day, more),
                201);
    }

    @Test
    void aMoneyGoalAddsUpWhatEveryonePutInAndSaysHowItStands() throws Exception {
        theLinds();
        // Begun 36 weeks before "today", to be done 20 weeks after it.
        String norway = goal(
                nora,
                "Norway 2027",
                ",\"unit\":\"money\",\"target\":800000,\"startDay\":\"2026-03-04\",\"targetDay\":\"2027-03-31\",\"audience\":\"circle\","
                        + "\"blurb\":\"Two weeks by train and ferry, paid for before we go\"");
        put(nora, norway, 300000, "2026-04-10", "");
        put(alex, norway, 244500, "2026-09-20", "");
        put(
                nora,
                norway,
                500,
                "2026-10-30",
                ",\"memberId\":\"%s\",\"note\":\"from her pocket money\"".formatted(miaId));
        String last = put(alex, norway, 15000, "2026-11-01", ",\"note\":\"payday\"");
        assertThat(JsonPath.<String>read(last, "$.line")).isEqualTo("Alex added €150");

        String goal = fetch("/v1/goals/" + norway + "?day=" + TODAY, nora);

        assertThat(JsonPath.<Integer>read(goal, "$.current")).isEqualTo(560000);
        assertThat(JsonPath.<Integer>read(goal, "$.pace.percent")).isEqualTo(70);
        assertThat(JsonPath.<String>read(goal, "$.amountLine")).isEqualTo("€5,600 of €8,000");
        assertThat(JsonPath.<String>read(goal, "$.pace.paceLine")).isEqualTo("On track: €120 a week gets there");
        assertThat(JsonPath.<String>read(goal, "$.pace.toGoLine")).isEqualTo("€2,400 to go");
        assertThat(JsonPath.<String>read(goal, "$.pace.timeLine")).isEqualTo("20 weeks left");
        assertThat(JsonPath.<String>read(goal, "$.line")).isEqualTo("€5,600 of €8,000 · on track for March");
        assertThat(JsonPath.<String>read(goal, "$.byLabel")).isEqualTo("by March 2027");
        // Who put in what: whoever began first comes first, and a child's money is hers although a parent typed it.
        assertThat(JsonPath.<List<String>>read(goal, "$.people[*].name")).containsExactly("Nora", "Alex", "Mia");
        assertThat(JsonPath.<String>read(goal, "$.cheer")).isEqualTo("Nora, Alex and Mia chip in");
        assertThat(JsonPath.<List<String>>read(goal, "$.recent[*].line"))
                .containsExactly("Alex added €150", "Mia added €5", "Alex added €2,445");
        assertThat(JsonPath.<String>read(goal, "$.recent[1].note")).isEqualTo("from her pocket money");
        // Saved each month of the year, January first.
        assertThat(JsonPath.<List<Integer>>read(goal, "$.months"))
                .containsExactly(0, 0, 0, 300000, 0, 0, 0, 0, 244500, 500, 15000, 0);
        assertThat(JsonPath.<Integer>read(goal, "$.year")).isEqualTo(2026);
        assertThat(JsonPath.<List<Integer>>read(fetch("/v1/goals/" + norway + "?year=2025", nora), "$.months"))
                .containsOnly(0);

        // Leo chips in too: now all four do. And the list of goals says the same as the goal.
        put(nora, norway, 100, TODAY, ",\"memberId\":\"%s\"".formatted(leoId));
        String list = fetch("/v1/circles/" + circle + "/goals?day=" + TODAY, alex);
        assertThat(JsonPath.<String>read(list, "$[0].cheer")).isEqualTo("All four chip in");
        assertThat(JsonPath.<String>read(list, "$[0].line")).isEqualTo("€5,601 of €8,000 · on track for March");
        assertThat(JsonPath.<Integer>read(list, "$[0].percent")).isEqualTo(70);
        assertThat(fetch("/v1/circles/" + circle + "/search?q=ferry", alex))
                .contains(norway)
                .contains("70% · €5,601 of €8,000");
    }

    @Test
    void aGoalSentTwiceIsMadeOnceAndSoIsWhatIsPutIn() throws Exception {
        theLinds();
        String body =
                "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"title\":\"Read 20 books\",\"target\":20,\"current\":3,\"emoji\":\"📚\",\"steps\":[\"Pick the first\"]}"
                        .formatted(id(), circle);
        String first = send(HttpMethod.POST, "/v1/goals", nora, body, 201);
        String second = send(HttpMethod.POST, "/v1/goals", nora, body, 201);
        String goal = JsonPath.read(first, "$.id");
        assertThat(JsonPath.<String>read(second, "$.id")).isEqualTo(goal);
        assertThat(JsonPath.<Integer>read(second, "$.current"))
                .as("what there was already is counted once")
                .isEqualTo(3);
        assertThat(jdbc.sql("select count(*) from things where kind = 'checklist'")
                        .query(Integer.class)
                        .single())
                .as("and its steps are one list")
                .isEqualTo(1);

        String entry = "{\"clientId\":\"%s\",\"amount\":2}".formatted(id());
        String one = send(HttpMethod.POST, "/v1/goals/" + goal + "/entries", nora, entry, 201);
        String two = send(HttpMethod.POST, "/v1/goals/" + goal + "/entries", nora, entry, 201);
        assertThat(JsonPath.<String>read(two, "$.id")).isEqualTo(JsonPath.<String>read(one, "$.id"));
        String now = fetch("/v1/goals/" + goal, nora);
        assertThat(JsonPath.<Integer>read(now, "$.current")).isEqualTo(5);
        assertThat(JsonPath.<String>read(now, "$.line")).isEqualTo("5 of 20");
        assertThat(JsonPath.<String>read(now, "$.emoji")).isEqualTo("📚");

        // A goal needs a target, and nothing can't be put in.
        send(
                HttpMethod.POST,
                "/v1/goals",
                nora,
                "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"title\":\"No target\"}".formatted(id(), circle),
                400);
        send(
                HttpMethod.POST,
                "/v1/goals/" + goal + "/entries",
                nora,
                "{\"clientId\":\"%s\",\"amount\":0}".formatted(id()),
                400);
        send(
                HttpMethod.PATCH,
                "/v1/goals/" + goal,
                nora,
                "{\"startDay\":\"2026-11-11\",\"targetDay\":\"2026-11-01\"}",
                400);
    }

    @Test
    void whatWasPutInComesInPagesCanBeTakenBackAndCanBeTakenOut() throws Exception {
        theLinds();
        String goal = goal(nora, "Skates fund", ",\"target\":50,\"unitWords\":\"stars\"");
        for (int day = 1; day <= 5; day++) {
            put(nora, goal, day, "2026-11-0" + day, "");
        }
        String out = put(nora, goal, -4, "2026-11-06", ",\"note\":\"spent on stickers\"");
        assertThat(JsonPath.<String>read(out, "$.line")).isEqualTo("Nora took out 4 stars");

        String first = fetch("/v1/goals/" + goal + "/entries?limit=4", nora);
        assertThat(JsonPath.<List<Integer>>read(first, "$.items[*].amount")).containsExactly(-4, 5, 4, 3);
        String second = fetch(
                "/v1/goals/" + goal + "/entries?limit=4&cursor=" + JsonPath.<String>read(first, "$.nextCursor"), nora);
        assertThat(JsonPath.<List<Integer>>read(second, "$.items[*].amount")).containsExactly(2, 1);
        assertThat(JsonPath.<Object>read(second, "$.nextCursor")).isNull();
        assertThat(JsonPath.<String>read(fetch("/v1/goals/" + goal, nora), "$.line"))
                .isEqualTo("11 of 50 stars");

        // Taking an entry back, twice, is fine.
        String five = JsonPath.<List<String>>read(first, "$.items[*].id").get(1);
        send(HttpMethod.DELETE, "/v1/goal-entries/" + five, nora, null, 204);
        send(HttpMethod.DELETE, "/v1/goal-entries/" + five, nora, null, 204);
        assertThat(JsonPath.<Integer>read(fetch("/v1/goals/" + goal, nora), "$.current"))
                .isEqualTo(6);
    }

    @Test
    void aGoalCanCountTheTicksOfItsStepsWhichAreAnOrdinaryList() throws Exception {
        theLinds();
        String goal = goal(
                nora,
                "Get the garden ready",
                ",\"how\":\"ticks\",\"steps\":[\"Clear the beds\",\"Buy seeds\",\"Fix the fence\",\"Plant\"],\"audience\":\"circle\"");

        String fresh = fetch("/v1/goals/" + goal, nora);
        String list = JsonPath.read(fresh, "$.steps.listId");
        assertThat(JsonPath.<Integer>read(fresh, "$.steps.left")).isEqualTo(4);
        assertThat(JsonPath.<String>read(fresh, "$.line")).isEqualTo("0 of 4");
        assertThat(JsonPath.<List<String>>read(fetch("/v1/things/" + goal + "/links", nora), "$[*].id"))
                .containsExactly(list);

        // Alex ticks a step on the list itself, and adds one: the ring follows.
        List<String> lines = JsonPath.read(fetch("/v1/checklists/" + list, alex), "$.items[*].id");
        send(HttpMethod.PATCH, "/v1/checklist-items/" + lines.get(0), alex, "{\"done\":true}", 200);
        send(
                HttpMethod.POST,
                "/v1/checklists/" + list + "/items",
                alex,
                "{\"clientId\":\"%s\",\"text\":\"Water\"}".formatted(id()),
                201);
        String after = fetch("/v1/goals/" + goal, nora);
        assertThat(JsonPath.<String>read(after, "$.amountLine")).isEqualTo("1 of 5");
        assertThat(JsonPath.<Integer>read(after, "$.pace.percent")).isEqualTo(20);

        // Someone who may see the goal and not its list gets no count from the list.
        share(nora, list, "{\"audience\":\"me\"}");
        String forAlex = fetch("/v1/goals/" + goal, alex);
        assertThat(JsonPath.<Object>read(forAlex, "$.steps")).isNull();
        assertThat(JsonPath.<Integer>read(forAlex, "$.current")).isZero();

        // A goal that counts ticks needs a list; the list has to be one of this circle that you can see.
        send(
                HttpMethod.POST,
                "/v1/goals",
                nora,
                "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"title\":\"No steps\",\"how\":\"ticks\"}"
                        .formatted(id(), circle),
                400);
        String hers = JsonPath.read(
                send(
                        HttpMethod.POST,
                        "/v1/checklists",
                        nora,
                        "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"title\":\"Only hers\"}".formatted(id(), circle),
                        201),
                "$.id");
        send(HttpMethod.PATCH, "/v1/goals/" + goal, alex, "{\"stepsListId\":\"%s\"}".formatted(hers), 404);
        send(HttpMethod.PATCH, "/v1/goals/" + goal, nora, "{\"stepsListId\":\"%s\"}".formatted(hers), 200);
    }

    @Test
    void aGoalThatReadsItsNumberFromElsewhereShowsWhatWasPutInByHandUntilThatPlaceCanBeRead() throws Exception {
        theLinds();
        String run = goal(
                nora,
                "Family 10K",
                ",\"target\":30,\"current\":12,\"source\":{\"kind\":\"journey\",\"ref\":\"family-10k\",\"words\":\"Family 10K in Journey\"}");

        String goal = fetch("/v1/goals/" + run, nora);
        assertThat(JsonPath.<String>read(goal, "$.how")).isEqualTo("source");
        assertThat(JsonPath.<String>read(goal, "$.source.kind")).isEqualTo("journey");
        assertThat(JsonPath.<String>read(goal, "$.source.ref")).isEqualTo("family-10k");
        assertThat(JsonPath.<String>read(goal, "$.source.line")).isEqualTo("Reads Family 10K in Journey");
        assertThat(JsonPath.<Boolean>read(goal, "$.source.live"))
                .as("nothing reads Journey yet")
                .isFalse();
        assertThat(JsonPath.<Integer>read(goal, "$.current")).isEqualTo(12);
        assertThat(JsonPath.<String>read(goal, "$.line")).isEqualTo("Day 12 of 30 in Journey");
        assertThat(JsonPath.<String>read(fetch("/v1/circles/" + circle + "/goals", nora), "$[0].source"))
                .isEqualTo("journey");

        // A source has to say where; and it can be let go of, back to a number put in by hand.
        send(
                HttpMethod.POST,
                "/v1/goals",
                nora,
                "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"title\":\"Sheet\",\"target\":5,\"source\":{\"kind\":\"sheet\"}}"
                        .formatted(id(), circle),
                400);
        String plain = send(
                HttpMethod.PATCH, "/v1/goals/" + run, nora, "{\"removeSource\":true,\"title\":\"Run 30 days\"}", 200);
        assertThat(JsonPath.<String>read(plain, "$.how")).isEqualTo("number");
        assertThat(JsonPath.<Object>read(plain, "$.source")).isNull();
        assertThat(JsonPath.<String>read(plain, "$.line")).isEqualTo("12 of 30");
    }
}

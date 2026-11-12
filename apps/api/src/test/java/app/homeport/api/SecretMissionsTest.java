package app.homeport.api;

import static org.assertj.core.api.Assertions.assertThat;

import com.jayway.jsonpath.JsonPath;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.temporal.IsoFields;
import java.time.temporal.TemporalAdjusters;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;

/**
 * Secret missions, tried as the one whose mission it is, the one it is for, and someone looking on. Until the
 * Sunday that ends its week, a mission leaves the API for nobody but its doer, by any route.
 */
class SecretMissionsTest extends FunBoardTest {

    private static final LocalDate MONDAY = TODAY.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
    private static final String SECRET = "Pineapple jam on her pillow before breakfast";
    private static final String DID = "Marzipan mice in both of her boots";

    /**
     * On a Sunday the week's missions are revealed the moment they are done, which is the rule, and leaves
     * nothing to keep secret after "done": those few lines are only tried on the other six days.
     */
    private static final boolean REVEALS_TODAY = TODAY.getDayOfWeek() == DayOfWeek.SUNDAY;

    /** The board with last week's missions shown, whatever day of the week it is. */
    private String lastWeek(String token, String board) throws Exception {
        return fetch("/v1/boards/" + board + "?show=" + MONDAY.minusDays(7), token);
    }

    /** A week goes by: everything written down for this week was last week's. */
    private void aWeekLater() {
        jdbc.sql("update board_entries set day = day - 7 where kind = 'mission'")
                .update();
    }

    @Test
    void aMissionIsItsDoersAloneUntilTheSundayThatEndsItsWeek() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String kai = person("Kai");
        String circle = circle(nora, "family", "The Linds");
        String noraId = memberOf(nora, circle);
        join(nora, circle, alex);
        teen(nora, circle, kai);
        String missions = board(nora, circle, "secret_missions", "circle", null);

        // Everyone has one. Nora sees hers, and only hers: who it is for, and what to do.
        String mine = view(nora, missions);
        assertThat(JsonPath.<Integer>read(mine, "$.view.people")).isEqualTo(3);
        assertThat(JsonPath.<Integer>read(mine, "$.view.week"))
                .isEqualTo(MONDAY.get(IsoFields.WEEK_OF_WEEK_BASED_YEAR));
        assertThat(JsonPath.<String>read(mine, "$.view.revealsOn"))
                .isEqualTo(MONDAY.plusDays(6).toString());
        assertThat(JsonPath.<List<String>>read(mine, "$.view.yours[*].doer.name"))
                .containsExactly("Nora");
        assertThat(JsonPath.<Object>read(mine, "$.view.yours[0].id")).isNull(); // nothing has happened to it yet
        String targetName = JsonPath.read(mine, "$.view.yours[0].target.name");
        String suggested = JsonPath.read(mine, "$.view.yours[0].text");
        assertThat(targetName).isIn("Alex", "Kai");
        assertThat(suggested).contains(targetName);
        String target = Map.of("Alex", alex, "Kai", kai).get(targetName);
        String onlooker = targetName.equals("Alex") ? kai : alex;
        // Asked again, it is the same one; the glance speaks of it to her alone.
        assertThat(JsonPath.<String>read(view(nora, missions), "$.view.yours[0].text"))
                .isEqualTo(suggested);
        assertThat(glance(nora, missions)).endsWith("yours is for " + targetName);

        // "A different one": other words, for the same person. Then she puts it in her own words.
        String another = act(nora, missions, "another", "{}", 200);
        assertThat(JsonPath.<String>read(another, "$.view.yours[0].text"))
                .isNotEqualTo(suggested)
                .contains(targetName);
        assertThat(JsonPath.<String>read(another, "$.view.yours[0].target.name"))
                .isEqualTo(targetName);
        String id = JsonPath.read(another, "$.view.yours[0].id");
        change(nora, id, "{\"text\":\"%s\"}".formatted(SECRET), 200);
        assertThat(JsonPath.<String>read(view(nora, missions), "$.view.yours[0].text"))
                .isEqualTo(SECRET);
        assertThat(fetch("/v1/circles/" + circle + "/search?q=Pineapple", nora)).contains(missions);
        add(nora, missions, "mission", "{\"text\":\"One more for me\"}", 409);

        // The one it is for and the one looking on get nothing of it, and can't reach it by its id or by her name.
        for (String other : List.of(target, onlooker)) {
            assertSecret(other, nora, circle, missions, SECRET);
            String theirs = view(other, missions);
            assertThat(JsonPath.<List<String>>read(theirs, "$.view.yours[*].doer.name"))
                    .doesNotContain("Nora")
                    .hasSize(1);
            assertThat(JsonPath.<List<Object>>read(theirs, "$.view.revealed")).isEmpty();
            change(other, id, "{\"text\":\"Peek\"}", 404);
            send(HttpMethod.DELETE, "/v1/board-entries/" + id, other, null, 404);
            act(other, missions, "like", "{\"entryId\":\"%s\"}".formatted(id), 404);
            act(other, missions, "reply", "{\"entryId\":\"%s\",\"text\":\"Aha\"}".formatted(id), 404);
            act(other, missions, "done", "{\"memberId\":\"%s\"}".formatted(noraId), 404);
            act(other, missions, "another", "{\"memberId\":\"%s\"}".formatted(noraId), 404);
        }

        // Done, with what she did. Still nobody else is told: not the words, and not that it is done.
        String done = act(nora, missions, "done", "{\"did\":\"%s\"}".formatted(DID), 200);
        assertThat(JsonPath.<Boolean>read(done, "$.view.yours[0].done")).isTrue();
        assertThat(glance(nora, missions)).endsWith("yours is done");
        assertThat(act(nora, missions, "another", "{}", 409)).contains("This one is done");
        if (!REVEALS_TODAY) {
            assertThat(JsonPath.<Boolean>read(done, "$.view.yours[0].revealed")).isFalse();
            String undone = act(nora, missions, "done", "{\"done\":false}", 200);
            assertThat(JsonPath.<Boolean>read(undone, "$.view.yours[0].done")).isFalse();
            act(nora, missions, "done", "{}", 200);
            for (String other : List.of(target, onlooker)) {
                assertSecret(other, nora, circle, missions, SECRET);
                assertSecret(other, nora, circle, missions, DID);
                assertThat(JsonPath.<List<Object>>read(view(other, missions), "$.view.revealed"))
                        .isEmpty();
            }
        }

        // The target asks for a different one of their own and never does it.
        act(target, missions, "another", "{}", 200);

        // Sunday has been: what was done is revealed to everyone, and what wasn't done never is.
        aWeekLater();
        for (String other : List.of(target, onlooker, nora)) {
            String revealed = lastWeek(other, missions);
            assertThat(JsonPath.<String>read(revealed, "$.view.revealedWeekStart"))
                    .isEqualTo(MONDAY.minusDays(7).toString());
            assertThat(JsonPath.<List<String>>read(revealed, "$.view.revealed[*].doer.name"))
                    .containsExactly("Nora");
            assertThat(JsonPath.<String>read(revealed, "$.view.revealed[0].text"))
                    .isEqualTo(SECRET);
            assertThat(JsonPath.<String>read(revealed, "$.view.revealed[0].did"))
                    .isEqualTo(DID);
            assertThat(JsonPath.<Boolean>read(revealed, "$.view.revealed[0].forYou"))
                    .isEqualTo(other.equals(target));
            assertThat(fetch("/v1/circles/" + circle + "/search?q=Marzipan", other))
                    .contains(missions);
            assertThat(JsonPath.<List<String>>read(
                            fetch("/v1/boards/" + missions + "/entries?q=Pineapple", other), "$.items[*].did"))
                    .containsExactly(DID);
        }
        // The heart is for the one it was done for; a line under it is theirs or the doer's.
        String like = "{\"entryId\":\"%s\"}".formatted(id);
        assertThat(act(onlooker, missions, "like", like, 403)).contains("The heart is for the one it was done for");
        act(target, missions, "like", like, 200);
        assertThat(JsonPath.<Boolean>read(lastWeek(nora, missions), "$.view.revealed[0].liked"))
                .isTrue();
        act(onlooker, missions, "reply", "{\"entryId\":\"%s\",\"text\":\"I knew\"}".formatted(id), 403);
        act(target, missions, "reply", "{\"entryId\":\"%s\",\"text\":\"I guessed by Wednesday\"}".formatted(id), 200);
        assertThat(JsonPath.<String>read(lastWeek(onlooker, missions), "$.view.revealed[0].reply"))
                .isEqualTo("I guessed by Wednesday");
        // Once revealed it stays as it is.
        assertThat(change(nora, id, "{\"text\":\"Something else\"}", 409)).contains("It has been revealed");
        send(HttpMethod.DELETE, "/v1/board-entries/" + id, nora, null, 409);
        // An older week can be looked at; there was nothing in it.
        String older = fetch("/v1/boards/" + missions + "?show=" + TODAY.minusDays(21), nora);
        assertThat(JsonPath.<List<Object>>read(older, "$.view.revealed")).isEmpty();
        send(HttpMethod.GET, "/v1/boards/" + missions + "?show=lately", nora, null, 400);
        // And a new week has begun: Nora has a new mission, with nothing written down for it.
        assertThat(JsonPath.<Object>read(view(nora, missions), "$.view.yours[0].id"))
                .isNull();
    }

    @Test
    void aChildsMissionIsReadToThemByAGrownUpButNeverByTheOneItIsFor() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String circle = circle(nora, "family", "The Linds");
        join(nora, circle, alex);
        String mia = addMember(nora, circle, "Mia", "child");
        String missions = board(nora, circle, "secret_missions", "circle", null);

        // Three of them stand in a ring, so Mia's is for one of her parents. The other one reads it to her.
        List<String> noraSees = JsonPath.read(view(nora, missions), "$.view.yours[*].doer.name");
        List<String> alexSees = JsonPath.read(view(alex, missions), "$.view.yours[*].doer.name");
        assertThat(noraSees.get(0)).isEqualTo("Nora"); // their own comes first
        assertThat(alexSees.get(0)).isEqualTo("Alex");
        assertThat(noraSees.contains("Mia")).isNotEqualTo(alexSees.contains("Mia"));
        String reader = noraSees.contains("Mia") ? nora : alex;
        String target = reader.equals(nora) ? alex : nora;
        String forWhom = JsonPath.<List<String>>read(
                        view(reader, missions), "$.view.yours[?(@.doer.name == 'Mia')].target.name")
                .get(0);
        assertThat(forWhom).isEqualTo(reader.equals(nora) ? "Alex" : "Nora");

        // The reader ticks it for her and says what she did. The one it is for can't get at it by naming her.
        String body = "{\"memberId\":\"%s\",\"did\":\"%s\"}".formatted(mia, DID);
        String done = act(reader, missions, "done", body, 200);
        assertThat(JsonPath.<List<Boolean>>read(done, "$.view.yours[?(@.doer.name == 'Mia')].done"))
                .containsExactly(true);
        act(target, missions, "done", body, 404);
        act(target, missions, "another", "{\"memberId\":\"%s\"}".formatted(mia), 404);
        if (!REVEALS_TODAY) {
            assertSecret(target, nora, circle, missions, DID);
        }
        assertThat(JsonPath.<List<String>>read(view(target, missions), "$.view.yours[*].doer.name"))
                .hasSize(1);

        // On Sunday it is theirs to read, and theirs to give a heart.
        aWeekLater();
        String revealed = lastWeek(target, missions);
        assertThat(JsonPath.<String>read(revealed, "$.view.revealed[0].doer.name"))
                .isEqualTo("Mia");
        assertThat(JsonPath.<String>read(revealed, "$.view.revealed[0].did")).isEqualTo(DID);
        assertThat(JsonPath.<Boolean>read(revealed, "$.view.revealed[0].forYou"))
                .isTrue();
        String id = JsonPath.read(revealed, "$.view.revealed[0].id");
        act(target, missions, "like", "{\"entryId\":\"%s\"}".formatted(id), 200);
        // The grown-up who read it to her can add a line for her; they can't give the heart.
        act(
                reader,
                missions,
                "reply",
                "{\"entryId\":\"%s\",\"text\":\"She kept a straight face all week\"}".formatted(id),
                200);
        act(reader, missions, "like", "{\"entryId\":\"%s\"}".formatted(id), 403);
    }

    @Test
    void aPetIsGivenAKindnessAndHasNoneToDoAndOnePersonAloneHasNoMission() throws Exception {
        String nora = person("Nora");
        String alone = circle(nora, "family", "Just Nora");
        String quiet = board(nora, alone, "secret_missions", "circle", null);
        String nothing = view(nora, quiet);
        assertThat(JsonPath.<Integer>read(nothing, "$.view.people")).isZero();
        assertThat(JsonPath.<List<Object>>read(nothing, "$.view.yours")).isEmpty();
        assertThat(glance(nora, quiet)).endsWith("one small kindness each");
        assertThat(act(nora, quiet, "done", "{}", 404)).contains("There is no mission there for you this week");

        String circle = circle(nora, "family", "Nora and Biscuit");
        addMember(nora, circle, "Biscuit", "pet");
        String missions = board(nora, circle, "secret_missions", "circle", null);
        String mine = view(nora, missions);
        assertThat(JsonPath.<Integer>read(mine, "$.view.people")).isEqualTo(1);
        assertThat(JsonPath.<String>read(mine, "$.view.yours[0].target.name")).isEqualTo("Biscuit");
        assertThat(JsonPath.<String>read(mine, "$.view.yours[0].text")).contains("Biscuit");
        act(nora, missions, "juggle", "{}", 400);
    }
}

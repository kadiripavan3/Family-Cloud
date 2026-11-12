package app.homeport.api;

import static org.assertj.core.api.Assertions.assertThat;

import app.homeport.api.money.sheet.SheetService;
import com.jayway.jsonpath.JsonPath;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;

/**
 * A goal that reads its number from a sheet keeps no second count of its own. Where the number is the sum of
 * one column ("Saved" adds up "Put in"), the rows are the goal's lines: "Add money" on the goal writes a row,
 * taking the line back removes it, and the goal, the sheet and the lines agree at every step. Where the
 * number is worked out any other way, or the person may not change the sheet, adding says so plainly.
 */
class GoalReadsItsSheetTest extends ApiTest {

    @Autowired
    SheetService sheets;

    private String nora;
    private String alex;
    private String circle;
    private String alexId;
    private String miaId;
    private String sheet;

    @BeforeEach
    void aFamilyWithASavingsSheet() throws Exception {
        nora = person("Nora");
        alex = person("Alex");
        circle = circle(nora, "family", "The Linds");
        alexId = join(nora, circle, alex);
        miaId = addMember(nora, circle, "Mia", "child");
        // The template's own rows: €200, €150 and €150 put in. "Saved" adds them up; "To go" is a formula.
        sheet = JsonPath.read(
                send(
                        HttpMethod.POST,
                        "/v1/sheets",
                        nora,
                        "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"template\":\"savings\",\"title\":\"Norway budget\",\"audience\":\"circle\",\"day\":\"2026-11-11\"}"
                                .formatted(id(), circle),
                        201),
                "$.id");
    }

    private String goal(String title, String number) throws Exception {
        return JsonPath.read(
                send(
                        HttpMethod.POST,
                        "/v1/goals",
                        nora,
                        "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"title\":\"%s\",\"unit\":\"money\",\"target\":800000,\"audience\":\"circle\",\"source\":{\"kind\":\"sheet\",\"ref\":\"%s/%s\"}}"
                                .formatted(id(), circle, title, sheet, number),
                        201),
                "$.id");
    }

    private UUID userOf(String token) throws Exception {
        return UUID.fromString(JsonPath.read(fetch("/v1/me", token), "$.id"));
    }

    private long saved() throws Exception {
        return sheets.total(UUID.fromString(sheet), "Saved", userOf(nora))
                .orElseThrow()
                .cents();
    }

    private String add(String token, String goal, String json, int expected) throws Exception {
        return send(HttpMethod.POST, "/v1/goals/" + goal + "/entries", token, json, expected);
    }

    @Test
    void whatIsAddedOnTheGoalIsARowOfTheSheetAndTakingItBackRemovesTheRow() throws Exception {
        String goal = goal("Norway 2027", "Saved");

        String before = fetch("/v1/goals/" + goal + "?day=2026-11-12", nora);
        assertThat(JsonPath.<Integer>read(before, "$.current")).isEqualTo(50_000);
        assertThat(JsonPath.<String>read(before, "$.source.line")).isEqualTo("Reads “Saved” in Norway budget");
        assertThat(JsonPath.<Boolean>read(before, "$.source.live")).isTrue();
        // The row "Reads “Saved” in Norway budget" can open the sheet.
        assertThat(JsonPath.<String>read(before, "$.source.thingId")).isEqualTo(sheet);
        assertThat(JsonPath.<String>read(before, "$.source.thingKind")).isEqualTo("sheet");
        assertThat(JsonPath.<Boolean>read(before, "$.addHere")).isTrue();
        // Its lines are the sheet's rows, the latest first.
        assertThat(JsonPath.<List<Integer>>read(before, "$.recent[*].amount")).containsExactly(15_000, 15_000, 20_000);
        assertThat(JsonPath.<String>read(before, "$.recent[2].note")).isEqualTo("To get it started");
        assertThat(JsonPath.<List<Integer>>read(before, "$.months[8:11]")).containsExactly(20_000, 15_000, 15_000);

        // Add money on the goal's page: €25 from Nora, and €5 for Mia. Sending the first again adds it once.
        String entry =
                "{\"clientId\":\"%s\",\"amount\":2500,\"note\":\"payday\",\"day\":\"2026-11-12\"}".formatted(id());
        String added = add(nora, goal, entry, 201);
        assertThat(JsonPath.<String>read(added, "$.line")).isEqualTo("Nora added €25");
        assertThat(JsonPath.<String>read(add(nora, goal, entry, 201), "$.id"))
                .isEqualTo(JsonPath.<String>read(added, "$.id"));
        String forMia = add(
                nora,
                goal,
                "{\"clientId\":\"%s\",\"amount\":500,\"note\":\"from her pocket money\",\"day\":\"2026-11-12\",\"memberId\":\"%s\"}"
                        .formatted(id(), miaId),
                201);
        assertThat(JsonPath.<String>read(forMia, "$.line")).isEqualTo("Mia added €5");

        // The goal's number, the sheet's "Saved" and the goal's lines agree.
        String after = fetch("/v1/goals/" + goal + "?day=2026-11-12", nora);
        assertThat(JsonPath.<Integer>read(after, "$.current")).isEqualTo(53_000);
        assertThat(saved()).isEqualTo(53_000);
        assertThat(JsonPath.<String>read(after, "$.amountLine")).isEqualTo("€530 of €8,000");
        assertThat(JsonPath.<List<String>>read(after, "$.recent[*].line"))
                .containsExactly("Mia added €5", "Nora added €25", "Someone added €150");
        assertThat(JsonPath.<List<String>>read(after, "$.recent[0:2].note"))
                .containsExactly("from her pocket money", "payday");
        assertThat(JsonPath.<List<String>>read(after, "$.people[*].name")).containsExactly("Nora", "Mia");
        assertThat(JsonPath.<Integer>read(after, "$.months[10]")).isEqualTo(15_000 + 3_000);
        String lines = fetch("/v1/goals/" + goal + "/entries?limit=2", nora);
        assertThat(JsonPath.<List<Integer>>read(lines, "$.items[*].amount")).containsExactly(500, 2_500);
        String rest = fetch(
                "/v1/goals/" + goal + "/entries?limit=10&cursor=" + JsonPath.<String>read(lines, "$.nextCursor"), nora);
        assertThat(JsonPath.<List<Integer>>read(rest, "$.items[*].amount")).containsExactly(15_000, 15_000, 20_000);
        assertThat(JsonPath.<Object>read(rest, "$.nextCursor")).isNull();
        // The sheet has the two rows: five in all, with who, when and why where its table has a column for them.
        assertThat(jdbc.sql("select count(*) from sheet_rows")
                        .query(Integer.class)
                        .single())
                .isEqualTo(5);
        // Nothing was kept a second time on the goal itself.
        assertThat(jdbc.sql("select count(*) from goal_entries")
                        .query(Integer.class)
                        .single())
                .isZero();

        // Take Nora's back: the row is gone from the sheet, and all three agree again. Taking it back twice is fine.
        send(HttpMethod.DELETE, "/v1/goal-entries/" + JsonPath.<String>read(added, "$.id"), nora, null, 204);
        send(HttpMethod.DELETE, "/v1/goal-entries/" + JsonPath.<String>read(added, "$.id"), nora, null, 204);
        String back = fetch("/v1/goals/" + goal + "?day=2026-11-12", nora);
        assertThat(JsonPath.<Integer>read(back, "$.current")).isEqualTo(50_500);
        assertThat(saved()).isEqualTo(50_500);
        assertThat(JsonPath.<List<String>>read(back, "$.recent[*].line"))
                .containsExactly("Mia added €5", "Someone added €150", "Someone added €150");

        // A row typed into the sheet moves the goal the same way.
        String tab = JsonPath.read(fetch("/v1/sheets/" + sheet, nora), "$.tabs[0].id");
        assertThat(JsonPath.<Integer>read(fetch("/v1/goals/" + goal, nora), "$.current"))
                .isEqualTo(50_500);
        assertThat(tab).isNotNull();
    }

    @Test
    void whoMayNotChangeTheSheetCanNotAddOnTheGoalAndIsToldWhy() throws Exception {
        String goal = goal("Norway 2027", "Saved");
        // Nora lets Alex see the sheet and not change it: the goal says so before he tries, and when he does.
        send(
                HttpMethod.PUT,
                "/v1/things/" + sheet + "/audience",
                nora,
                "{\"audience\":\"some\",\"people\":[{\"memberId\":\"%s\",\"access\":\"view\"}]}".formatted(alexId),
                200);
        String his = fetch("/v1/goals/" + goal, alex);
        assertThat(JsonPath.<Integer>read(his, "$.current")).isEqualTo(50_000);
        assertThat(JsonPath.<String>read(his, "$.source.thingId")).isEqualTo(sheet);
        assertThat(JsonPath.<Boolean>read(his, "$.addHere")).isFalse();
        // (He may not change the goal either, which is Nora's; let him, and it is the sheet that says no.)
        send(
                HttpMethod.PUT,
                "/v1/things/" + goal + "/audience",
                nora,
                "{\"audience\":\"circle\",\"everyoneEdits\":true}",
                200);
        String refused = add(alex, goal, "{\"clientId\":\"%s\",\"amount\":2500}".formatted(id()), 403);
        assertThat(JsonPath.<String>read(refused, "$.code")).isEqualTo("kept_elsewhere");
        assertThat(refused)
                .contains("This goal reads its number from “Saved” in Norway budget, and you can't change that");
        assertThat(saved()).isEqualTo(50_000);

        // The sheet becomes Nora's alone: for Alex the goal can't read it, shows what was put in by hand (nothing),
        // names no sheet to open, and takes nothing.
        send(HttpMethod.PUT, "/v1/things/" + sheet + "/audience", nora, "{\"audience\":\"me\"}", 200);
        String blind = fetch("/v1/goals/" + goal, alex);
        assertThat(JsonPath.<Boolean>read(blind, "$.source.live")).isFalse();
        assertThat(JsonPath.<Object>read(blind, "$.source.thingId")).isNull();
        assertThat(JsonPath.<Integer>read(blind, "$.current")).isZero();
        assertThat(JsonPath.<Boolean>read(blind, "$.addHere")).isFalse();
        assertThat(add(alex, goal, "{\"clientId\":\"%s\",\"amount\":2500}".formatted(id()), 409))
                .contains("which can't be opened just now");
        assertThat(jdbc.sql("select count(*) from goal_entries")
                        .query(Integer.class)
                        .single())
                .isZero();
    }

    @Test
    void aNumberThatIsWorkedOutIsChangedInItsSheetAndTheGoalSaysSo() throws Exception {
        // "To go" is €8,000 minus what was put in: a formula, not a sum of rows.
        String goal = goal("Still to save", "To go");
        String read = fetch("/v1/goals/" + goal, nora);
        assertThat(JsonPath.<Integer>read(read, "$.current")).isEqualTo(750_000);
        assertThat(JsonPath.<Boolean>read(read, "$.source.live")).isTrue();
        assertThat(JsonPath.<String>read(read, "$.source.thingId")).isEqualTo(sheet);
        assertThat(JsonPath.<Boolean>read(read, "$.addHere")).isFalse();
        assertThat(JsonPath.<List<Object>>read(read, "$.recent")).isEmpty();

        String refused = add(nora, goal, "{\"clientId\":\"%s\",\"amount\":2500}".formatted(id()), 409);
        assertThat(JsonPath.<String>read(refused, "$.code")).isEqualTo("kept_elsewhere");
        assertThat(JsonPath.<String>read(refused, "$.detail"))
                .isEqualTo(
                        "This goal reads its number from “To go” in Norway budget. Change it there and the goal moves.");
        assertThat(saved()).isEqualTo(50_000);
        assertThat(jdbc.sql("select count(*) from goal_entries")
                        .query(Integer.class)
                        .single())
                .isZero();

        // The total under the column "Put in" is a sum of rows like "Saved": a goal that reads it takes money too.
        String byColumn = goal("By column", "Put in");
        assertThat(JsonPath.<Boolean>read(fetch("/v1/goals/" + byColumn, nora), "$.addHere"))
                .isTrue();
        add(nora, byColumn, "{\"clientId\":\"%s\",\"amount\":1000}".formatted(id()), 201);
        assertThat(saved()).isEqualTo(51_000);
    }
}

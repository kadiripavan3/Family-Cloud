package app.homeport.api;

import static org.assertj.core.api.Assertions.assertThat;

import com.jayway.jsonpath.JsonPath;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;

/**
 * Tucked notes, tried as the writer and as the one a note is for. Before its moment a note is nowhere for its
 * reader: not on the board, in its entries, in a search, in the glance, on a guest's page or by its id. Today
 * tells them that one is waiting and who by, as the couple's Today is drawn, and nothing of the note itself.
 */
class TuckedNotesTest extends FunBoardTest {

    private static final String SECRET = "Pineapple under the stairs, behind the boots";

    @Test
    void aTuckedNoteIsNowhereForItsReaderUntilItsMomentAndThenItIsTheirs() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String circle = circle(nora, "couple", "Nora and Alex");
        join(nora, circle, alex);
        String notes = board(nora, circle, "tucked_notes", null, null);

        // Between two people a note is for the other one. "Some time this week" picks its own moment.
        String body = "{\"clientId\":\"%s\",\"kind\":\"note\",\"fields\":{\"text\":\"%s\"}}".formatted(id(), SECRET);
        String first = send(HttpMethod.POST, "/v1/boards/" + notes + "/entries", nora, body, 201);
        String again = send(HttpMethod.POST, "/v1/boards/" + notes + "/entries", nora, body, 201);
        String note = JsonPath.read(first, "$.entryId");
        assertThat(JsonPath.<String>read(again, "$.entryId")).isEqualTo(note);

        // The writer reads her own note, and is told the day it will have turned up by. Not the moment: the
        // moment that was picked leaves the API for nobody.
        String hers = view(nora, notes);
        assertThat(JsonPath.<Integer>read(hers, "$.view.tucked.length()")).isEqualTo(1);
        assertThat(JsonPath.<String>read(hers, "$.view.tucked[0].text")).isEqualTo(SECRET);
        assertThat(JsonPath.<String>read(hers, "$.view.tucked[0].forPerson.name"))
                .isEqualTo("Alex");
        assertThat(JsonPath.<String>read(hers, "$.view.tucked[0].turnsUp")).isEqualTo("this_week");
        assertThat(JsonPath.<Object>read(hers, "$.view.tucked[0].at")).isNull();
        LocalDate before = LocalDate.parse(JsonPath.<String>read(hers, "$.view.tucked[0].before"));
        assertThat(before.getDayOfWeek()).isEqualTo(DayOfWeek.SUNDAY);
        assertThat(before).isAfter(TODAY.minusDays(1)).isBefore(TODAY.plusDays(9));
        Instant moment = jdbc.sql("select opens_at from board_entries where id = cast(:id as uuid)")
                .param("id", note)
                .query(java.sql.Timestamp.class)
                .single()
                .toInstant();
        assertThat(moment)
                .isAfter(Instant.now().plusSeconds(3000))
                .isBefore(Instant.now().plusSeconds(9 * 86400));
        assertThat(hers).doesNotContain(moment.toString().substring(0, 16));
        assertThat(glance(nora, notes)).isEqualTo("0 found so far · 1 tucked away");
        assertThat(fetch("/v1/circles/" + circle + "/search?q=Pineapple", nora)).contains(notes);

        // The reader: nothing of it, anywhere, also with his phone set to next month.
        assertSecret(alex, nora, circle, notes, SECRET);
        String his = view(alex, notes);
        assertThat(JsonPath.<List<Object>>read(his, "$.view.tucked")).isEmpty();
        assertThat(JsonPath.<List<Object>>read(his, "$.view.turnedUp")).isEmpty();
        assertThat(JsonPath.<Integer>read(his, "$.view.found")).isZero();
        assertThat(his).doesNotContain(note);
        assertThat(JsonPath.<List<Object>>read(fetch("/v1/boards/" + notes + "/entries", alex), "$.items"))
                .isEmpty();
        assertThat(glance(alex, notes)).isEqualTo("0 found so far");
        // By its id it isn't there for him: not to change, not to take away, not to "find" early.
        change(alex, note, "{\"text\":\"Peek\"}", 404);
        send(HttpMethod.DELETE, "/v1/board-entries/" + note, alex, null, 404);
        act(alex, notes, "found", "{\"entryId\":\"%s\"}".formatted(note), 404);
        // What Today tells him is that one is waiting, and who tucked it away. Nothing of the note is in it.
        String today = today(alex, circle);
        assertThat(JsonPath.<List<String>>read(today, "$.items[*].title"))
                .containsExactly("A note is tucked away for you");
        assertThat(JsonPath.<List<String>>read(today, "$.items[*].note"))
                .containsExactly("From Nora. It turns up when it turns up.");
        assertThat(today).doesNotContain(note).doesNotContain("Pineapple");
        // Her own Today says nothing of her own note.
        assertThat(JsonPath.<List<Object>>read(today(nora, circle), "$.items")).isEmpty();
        // She can still change it, and when it turns up.
        change(nora, note, "{\"text\":\"%s\"}".formatted(SECRET + "."), 200);

        // Its moment comes.
        moveMoment(note, "opens_at", Instant.now().minusSeconds(60));
        String turnedUp = view(alex, notes);
        assertThat(JsonPath.<String>read(turnedUp, "$.view.turnedUp[0].text")).isEqualTo(SECRET + ".");
        assertThat(JsonPath.<String>read(turnedUp, "$.view.turnedUp[0].from.name"))
                .isEqualTo("Nora");
        assertThat(JsonPath.<Boolean>read(turnedUp, "$.view.turnedUp[0].found")).isFalse();
        assertThat(JsonPath.<List<String>>read(today(alex, circle), "$.items[*].title"))
                .containsExactly("A note from Nora has turned up");
        assertThat(fetch("/v1/circles/" + circle + "/search?q=Pineapple", alex)).contains(notes);
        // It is his now: she can't change it or take it back, and it isn't hers to "find".
        assertThat(change(nora, note, "{\"text\":\"Never mind\"}", 409)).contains("It has turned up. It is theirs now");
        send(HttpMethod.DELETE, "/v1/board-entries/" + note, nora, null, 409);
        act(nora, notes, "found", "{\"entryId\":\"%s\"}".formatted(note), 409);

        // He reads it: found, with the time, for both of them. Finding it twice is finding it once.
        act(alex, notes, "found", "{\"entryId\":\"%s\"}".formatted(note), 200);
        String foundAt = JsonPath.read(view(alex, notes), "$.view.foundLately[0].foundAt");
        String found = act(alex, notes, "found", "{\"entryId\":\"%s\"}".formatted(note), 200);
        assertThat(JsonPath.<Integer>read(found, "$.view.found")).isEqualTo(1);
        assertThat(JsonPath.<String>read(found, "$.view.foundLately[0].foundAt"))
                .isEqualTo(foundAt);
        assertThat(JsonPath.<List<Object>>read(found, "$.view.turnedUp")).isEmpty();
        String seenByHer = view(nora, notes);
        assertThat(JsonPath.<List<Object>>read(seenByHer, "$.view.tucked")).isEmpty();
        assertThat(JsonPath.<Boolean>read(seenByHer, "$.view.foundLately[0].found"))
                .isTrue();
        assertThat(JsonPath.<String>read(seenByHer, "$.view.foundLately[0].foundAt"))
                .isEqualTo(foundAt);
        assertThat(glance(nora, notes)).isEqualTo("1 found so far");
        assertThat(JsonPath.<List<Object>>read(today(alex, circle), "$.items")).isEmpty();
        // A found note is the reader's to keep or throw away.
        send(HttpMethod.DELETE, "/v1/board-entries/" + note, alex, null, 204);
    }

    @Test
    void aNoteCanTurnUpAtASetTimeOrWaitForASignalThatNothingSendsYet() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String circle = circle(nora, "couple", "Nora and Alex");
        join(nora, circle, alex);
        String notes = board(nora, circle, "tucked_notes", null, null);

        // A set time: the writer sees it, since she chose it.
        Instant at = Instant.now().plusSeconds(7200);
        String timed = add(
                nora, notes, "note", "{\"text\":\"Half past seven\",\"turnsUp\":\"at\",\"at\":\"%s\"}".formatted(at));
        assertThat(JsonPath.<String>read(view(nora, notes), "$.view.tucked[0].at"))
                .startsWith(at.toString().substring(0, 19));
        add(
                nora,
                notes,
                "note",
                "{\"text\":\"Too late\",\"turnsUp\":\"at\",\"at\":\"%s\"}"
                        .formatted(Instant.now().minusSeconds(60)),
                400);
        add(nora, notes, "note", "{\"text\":\"When?\",\"turnsUp\":\"at\"}", 400);
        add(nora, notes, "note", "{\"text\":\"How?\",\"turnsUp\":\"at\",\"at\":\"half past seven\"}", 400);
        add(nora, notes, "note", "{\"text\":\"How?\",\"turnsUp\":\"by pigeon\"}", 400);
        add(nora, notes, "note", "{\"turnsUp\":\"this_week\"}", 400);
        send(HttpMethod.DELETE, "/v1/board-entries/" + timed, nora, null, 204); // taken back before it turned up

        // "When he lands", "next time it rains": kept, and waiting. The board says plainly that nothing sends
        // those signals yet, and the reader's Today isn't told about a note that can't turn up.
        String lands = add(nora, notes, "note", "{\"text\":\"Quince in your left coat pocket\",\"turnsUp\":\"lands\"}");
        add(nora, notes, "note", "{\"text\":\"Quince under the umbrella\",\"turnsUp\":\"rains\"}");
        String hers = view(nora, notes);
        assertThat(JsonPath.<List<Boolean>>read(hers, "$.view.tucked[*].waiting"))
                .containsExactly(true, true);
        assertThat(JsonPath.<List<String>>read(hers, "$.view.ways[*].way"))
                .containsExactly("this_week", "at", "lands", "rains");
        assertThat(JsonPath.<List<Boolean>>read(hers, "$.view.ways[*].works"))
                .containsExactly(true, true, false, false);
        assertThat(JsonPath.<String>read(hers, "$.view.ways[2].waitsFor")).contains("Phones don't send it yet");
        assertThat(JsonPath.<String>read(hers, "$.view.ways[3].waitsFor")).contains("None is connected yet");
        assertSecret(alex, nora, circle, notes, "Quince in your left coat pocket");
        assertSecret(alex, nora, circle, notes, "Quince under the umbrella");
        assertThat(JsonPath.<List<Object>>read(today(alex, circle), "$.items")).isEmpty();
        // She gives the first one a time instead: now it will turn up, and his Today says one is waiting.
        change(nora, lands, "{\"turnsUp\":\"at\",\"at\":\"%s\"}".formatted(at), 200);
        assertThat(JsonPath.<List<Boolean>>read(view(nora, notes), "$.view.tucked[*].waiting"))
                .containsExactlyInAnyOrder(true, false);
        assertThat(JsonPath.<List<String>>read(today(alex, circle), "$.items[*].title"))
                .containsExactly("A note is tucked away for you");
        assertSecret(alex, nora, circle, notes, "Quince in your left coat pocket");
    }

    @Test
    void amongMoreThanTwoANoteNamesItsReaderAndNobodyElseEverReadsIt() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String kai = person("Kai");
        String circle = circle(nora, "crew", "Lisbon crew");
        String alexId = join(nora, circle, alex);
        join(nora, circle, kai);
        String notes = board(nora, circle, "tucked_notes", null, null);

        assertThat(add(nora, notes, "note", "{\"text\":\"For whom?\"}", 400)).contains("Choose who the note is for");
        add(
                nora,
                notes,
                "note",
                "{\"text\":\"To myself\",\"forMemberId\":\"%s\"}".formatted(memberOf(nora, circle)),
                400);
        String note = add(nora, notes, "note", "{\"text\":\"%s\",\"forMemberId\":\"%s\"}".formatted(SECRET, alexId));
        assertThat(JsonPath.<List<String>>read(view(nora, notes), "$.view.readers[*].name"))
                .containsExactly("Alex", "Kai");

        // Kai is neither its writer nor its reader: nothing before its moment, nothing after, nothing once found.
        assertSecret(kai, nora, circle, notes, SECRET);
        assertThat(JsonPath.<List<Object>>read(today(kai, circle), "$.items")).isEmpty();
        moveMoment(note, "opens_at", Instant.now().minusSeconds(60));
        assertSecret(kai, nora, circle, notes, SECRET);
        act(kai, notes, "found", "{\"entryId\":\"%s\"}".formatted(note), 404);
        act(alex, notes, "found", "{\"entryId\":\"%s\"}".formatted(note), 200);
        assertSecret(kai, nora, circle, notes, SECRET);
        assertThat(JsonPath.<Integer>read(view(kai, notes), "$.view.found")).isZero();
        assertThat(glance(kai, notes)).isEqualTo("0 found so far");
        change(kai, note, "{\"text\":\"Peek\"}", 404);
        send(HttpMethod.DELETE, "/v1/board-entries/" + note, kai, null, 404);
        assertThat(JsonPath.<Integer>read(view(alex, notes), "$.view.found")).isEqualTo(1);
    }
}

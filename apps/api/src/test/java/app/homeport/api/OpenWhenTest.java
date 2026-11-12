package app.homeport.api;

import static org.assertj.core.api.Assertions.assertThat;

import com.jayway.jsonpath.JsonPath;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;

/**
 * Open when…, tried as three people: the writer, the reader, and someone else who can see the board. Everyone
 * sees the envelopes; only the writer reads a letter before it is opened, and only the reader opens it, once.
 */
class OpenWhenTest extends BoardTest {

    private static final String SECRET = "Count the forty-one stars on your ceiling";

    @Test
    void theReaderSeesEnvelopesOpensALetterOnceAndThenKeepsItAndNobodyElseEverReadsIt() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String kai = person("Kai");
        String circle = circle(nora, "family", "The Linds");
        String alexId = join(nora, circle, alex);
        String kaiId = join(nora, circle, kai);
        send(HttpMethod.PATCH, "/v1/members/" + kaiId, nora, "{\"role\":\"teen\"}", 200);
        String letters = board(nora, circle, "open_when", null, "{\"forMemberId\":\"%s\"}".formatted(kaiId));
        // Kai may only look at the board; Alex may change it.
        shareWith(nora, letters, kaiId, "view", alexId, "edit");
        String letter = add(
                nora,
                letters,
                "letter",
                "{\"when\":\"you can't sleep\",\"emoji\":\"🌙\",\"text\":\"%s\",\"mediaId\":\"%s\"}"
                        .formatted(SECRET, recording(nora, 48)));
        add(alex, letters, "letter", "{\"when\":\"you win, or you lose\",\"text\":\"Pancakes either way\"}");

        // The writer reads her own. The reader and the other adult see an envelope: its outside, no words, no voice.
        assertThat(JsonPath.<String>read(view(nora, letters), "$.view.letters[0].text"))
                .isEqualTo(SECRET);
        assertThat(JsonPath.<String>read(view(nora, letters), "$.view.letters[0].voice.url"))
                .contains("/media/audio");
        assertThat(JsonPath.<Object>read(view(nora, letters), "$.view.letters[1].text"))
                .isNull();
        for (String who : List.of(kai, alex)) {
            assertNowhere(who, circle, letters, SECRET);
            String seen = view(who, letters);
            assertThat(seen).doesNotContain("/media/audio");
            assertThat(JsonPath.<String>read(seen, "$.view.letters[0].when")).isEqualTo("you can't sleep");
            assertThat(JsonPath.<String>read(seen, "$.view.letters[0].from.name"))
                    .isEqualTo("Nora");
            assertThat(JsonPath.<Boolean>read(seen, "$.view.letters[0].hasVoice"))
                    .isTrue();
            assertThat(JsonPath.<Boolean>read(seen, "$.view.letters[0].opened")).isFalse();
            assertThat(JsonPath.<Integer>read(seen, "$.view.sealed")).isEqualTo(2);
            // The envelope can be found by what it says on the outside.
            assertThat(fetch("/v1/circles/" + circle + "/search?q=can't sleep", who))
                    .contains(letters);
        }
        assertThat(JsonPath.<Boolean>read(view(kai, letters), "$.view.youAreTheReader"))
                .isTrue();
        assertThat(JsonPath.<Boolean>read(view(kai, letters), "$.view.letters[0].canOpen"))
                .isTrue();
        assertThat(JsonPath.<Boolean>read(view(alex, letters), "$.view.letters[0].canOpen"))
                .isFalse();
        assertThat(JsonPath.<Boolean>read(view(nora, letters), "$.view.letters[0].canOpen"))
                .isFalse();

        // Nobody opens it for him: not the other adult, not the writer herself.
        assertThat(act(alex, letters, "open", "{\"entryId\":\"%s\"}".formatted(letter), 403))
                .contains("Only Kai can open this one");
        act(nora, letters, "open", "{\"entryId\":\"%s\"}".formatted(letter), 403);
        // The writer may still change it; nobody else may.
        change(alex, letter, "{\"text\":\"Rewritten\"}", 403);
        change(nora, letter, "{\"emoji\":\"⭐\"}", 200);

        // Kai opens it, although he may only look at the board. Once: the moment is kept, a second time changes
        // nothing.
        String opened = act(kai, letters, "open", "{\"entryId\":\"%s\"}".formatted(letter), 200);
        assertThat(JsonPath.<String>read(opened, "$.view.letters[0].text")).isEqualTo(SECRET);
        assertThat(JsonPath.<String>read(opened, "$.view.letters[0].voice.url")).contains("/media/audio");
        assertThat(JsonPath.<String>read(opened, "$.view.letters[0].openedBy.name"))
                .isEqualTo("Kai");
        String at = JsonPath.read(opened, "$.view.letters[0].openedAt");
        assertThat(JsonPath.<String>read(
                        act(kai, letters, "open", "{\"entryId\":\"%s\"}".formatted(letter), 200),
                        "$.view.letters[0].openedAt"))
                .isEqualTo(at);
        assertThat(fetch("/v1/circles/" + circle + "/search?q=forty-one", kai)).contains(letters);

        // The writer is told. Alex, who can change the board, still reads nothing of it.
        assertThat(JsonPath.<List<String>>read(fetch("/v1/circles/" + circle + "/today", nora), "$.fresh[*].title"))
                .contains("Open when you can't sleep");
        assertThat(fetch("/v1/circles/" + circle + "/today", nora)).contains("Kai opened it on ");
        assertNowhere(alex, circle, letters, SECRET);
        assertThat(JsonPath.<String>read(view(alex, letters), "$.view.letters[0].openedAt"))
                .isEqualTo(at);
        assertThat(JsonPath.<String>read(fetch("/v1/things/" + letters, alex), "$.glance"))
                .isEqualTo("2 letters · 1 opened");

        // Once opened it is his to keep: it can't be changed or taken back. A sealed one still can.
        assertThat(change(nora, letter, "{\"text\":\"On second thoughts\"}", 409))
                .contains("Once opened, a letter is kept");
        send(HttpMethod.DELETE, "/v1/board-entries/" + letter, nora, null, 409);
        String another = add(nora, letters, "letter", "{\"when\":\"it rains\",\"text\":\"Wellies\"}");
        send(HttpMethod.DELETE, "/v1/board-entries/" + another, alex, null, 403);
        send(HttpMethod.DELETE, "/v1/board-entries/" + another, nora, null, 204);

        // What a letter needs, and who it can be for.
        assertThat(add(nora, letters, "letter", "{\"text\":\"No envelope\"}", 400))
                .contains("Write when to open it");
        assertThat(add(nora, letters, "letter", "{\"when\":\"empty\"}", 400))
                .contains("Write the letter, or record a message");
        send(
                HttpMethod.PATCH,
                "/v1/boards/" + letters,
                nora,
                "{\"settings\":{\"forMemberId\":\"%s\"}}".formatted(alexId),
                409);
    }

    @Test
    void aLetterForAChildWithoutASignInIsOpenedWithThemByAnAdultWhoLooksAfterThem() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String kai = person("Kai");
        String circle = circle(nora, "family", "The Linds");
        join(nora, circle, alex);
        String kaiId = join(nora, circle, kai);
        send(HttpMethod.PATCH, "/v1/members/" + kaiId, nora, "{\"role\":\"teen\"}", 200);
        String mia = addMember(nora, circle, "Mia", "child");
        String letters = board(nora, circle, "open_when", "circle", "{\"forMemberId\":\"%s\"}".formatted(mia));
        String letter =
                add(nora, letters, "letter", "{\"when\":\"you've had a bad day\",\"text\":\"%s\"}".formatted(SECRET));

        // Mia has no phone. Her brother can't open her letter; her father can, with her.
        assertThat(JsonPath.<Boolean>read(view(alex, letters), "$.view.youOpenForThem"))
                .isTrue();
        assertNowhere(alex, circle, letters, SECRET);
        act(kai, letters, "open", "{\"entryId\":\"%s\"}".formatted(letter), 403);
        String opened = act(alex, letters, "open", "{\"entryId\":\"%s\"}".formatted(letter), 200);
        assertThat(JsonPath.<String>read(opened, "$.view.letters[0].text")).isEqualTo(SECRET);
        assertThat(JsonPath.<String>read(opened, "$.view.letters[0].openedBy.name"))
                .isEqualTo("Alex");
        assertThat(fetch("/v1/circles/" + circle + "/today", nora)).contains("Mia opened it on ");

        // Opened or not, it was never for Kai.
        assertNowhere(kai, circle, letters, SECRET);
        assertThat(JsonPath.<Boolean>read(view(kai, letters), "$.view.letters[0].opened"))
                .isTrue();

        // Letters are for a person: not for a pet, and not for nobody.
        String biscuit = addMember(nora, circle, "Biscuit", "pet");
        newBoard(nora, circle, "open_when", null, "{\"forMemberId\":\"%s\"}".formatted(biscuit), 400);
        newBoard(nora, circle, "open_when", null, "{}", 400);
    }
}

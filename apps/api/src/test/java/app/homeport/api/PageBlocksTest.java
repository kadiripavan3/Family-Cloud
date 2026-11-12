package app.homeport.api;

import static org.assertj.core.api.Assertions.assertThat;

import com.jayway.jsonpath.JsonPath;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.test.web.servlet.MvcResult;

/** A page is built from blocks, each changed by itself, and its plain words follow them. */
class PageBlocksTest extends NotesApiTest {

    private List<String> texts(String page, String token) throws Exception {
        return JsonPath.read(fetch("/v1/pages/" + page, token), "$.blocks[*].text");
    }

    private String emptyPage(String token, String circle, String title, String audience) throws Exception {
        return JsonPath.read(
                send(
                        HttpMethod.POST,
                        "/v1/pages",
                        token,
                        "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"title\":\"%s\"%s}"
                                .formatted(
                                        id(),
                                        circle,
                                        title,
                                        audience == null ? "" : ",\"audience\":\"" + audience + "\""),
                        201),
                "$.id");
    }

    private String text(String token, String page, String words) throws Exception {
        return block(token, page, "\"kind\":\"paragraph\",\"text\":\"%s\"".formatted(words));
    }

    @Test
    void aPageWrittenTheOldWayIsOneBlockOfTextAndItsWordsFollowItsBlocks() throws Exception {
        String nora = person("Nora");
        String circle = circle(nora, "solo", "Just me");
        String page = page(nora, circle, "House rules", null);

        String made = fetch("/v1/pages/" + page, nora);
        assertThat(titles(made, "$.blocks[*].kind")).containsExactly("paragraph");
        assertThat(titles(made, "$.blocks[*].text")).containsExactly("Words about House rules");
        assertThat(JsonPath.<String>read(made, "$.body")).isEqualTo("Words about House rules");

        String heading = block(nora, page, "\"kind\":\"heading\",\"text\":\"Quiet hours\"");
        String bullet = block(nora, page, "\"kind\":\"bullet\",\"text\":\"After 22:00 on weekdays\"");
        assertThat(JsonPath.<String>read(fetch("/v1/pages/" + page, nora), "$.body"))
                .isEqualTo("Words about House rules\nQuiet hours\n• After 22:00 on weekdays");
        String found = fetch("/v1/circles/" + circle + "/search?q=weekdays", nora);
        assertThat(JsonPath.<String>read(found, "$.hits[0].thing.id")).isEqualTo(page);
        assertThat(JsonPath.<String>read(found, "$.hits[0].snippet")).contains("After 22:00");

        // Change one block, remove another: the words follow, and so does the search.
        send(HttpMethod.PATCH, "/v1/page-blocks/" + bullet, nora, "{\"text\":\"After 23:00 at weekends\"}", 200);
        send(HttpMethod.DELETE, "/v1/page-blocks/" + heading, nora, null, 204);
        assertThat(JsonPath.<String>read(fetch("/v1/pages/" + page, nora), "$.body"))
                .isEqualTo("Words about House rules\n• After 23:00 at weekends");
        assertThat(fetch("/v1/circles/" + circle + "/search?q=weekdays", nora)).doesNotContain(page);
        assertThat(fetch("/v1/circles/" + circle + "/search?q=weekends", nora)).contains(page);

        // Wherever the page is listed among other things, it says how it starts.
        assertThat(JsonPath.<String>read(fetch("/v1/things/" + page, nora), "$.glance"))
                .isEqualTo("Words about House rules");

        // A page with no words has no blocks.
        String empty = fetch("/v1/pages/" + emptyPage(nora, circle, "Later", null), nora);
        assertThat(JsonPath.<List<Object>>read(empty, "$.blocks")).isEmpty();
        assertThat(JsonPath.<String>read(empty, "$.body")).isEmpty();
        assertThat(JsonPath.<Object>read(fetch("/v1/things/" + JsonPath.<String>read(empty, "$.id"), nora), "$.glance"))
                .isNull();
    }

    @Test
    void aBlockSentTwiceIsAddedOnce() throws Exception {
        String nora = person("Nora");
        String circle = circle(nora, "solo", "Just me");
        String page = emptyPage(nora, circle, "Wi-Fi", null);
        String words = "{\"clientId\":\"%s\",\"kind\":\"paragraph\",\"text\":\"The router is in the hallway.\"}"
                .formatted(id());
        String list =
                "{\"clientId\":\"%s\",\"kind\":\"checklist\",\"title\":\"If the internet drops\",\"items\":[\"Unplug the white box\"]}"
                        .formatted(id());

        String first = send(HttpMethod.POST, "/v1/pages/" + page + "/blocks", nora, words, 201);
        String second = send(HttpMethod.POST, "/v1/pages/" + page + "/blocks", nora, words, 201);
        send(HttpMethod.POST, "/v1/pages/" + page + "/blocks", nora, list, 201);
        send(HttpMethod.POST, "/v1/pages/" + page + "/blocks", nora, list, 201);

        assertThat(JsonPath.<String>read(second, "$.id")).isEqualTo(JsonPath.<String>read(first, "$.id"));
        assertThat(titles(fetch("/v1/pages/" + page, nora), "$.blocks[*].kind"))
                .containsExactly("paragraph", "checklist");
        assertThat(titles(fetch("/v1/circles/" + circle + "/checklists", nora), "$.items[*].title"))
                .containsExactly("If the internet drops");
        send(
                HttpMethod.POST,
                "/v1/pages/" + page + "/blocks",
                nora,
                "{\"kind\":\"paragraph\",\"text\":\"No id\"}",
                400);
    }

    @Test
    void blocksGoAfterABlockFirstOrAtTheEndAndCanBeMoved() throws Exception {
        String nora = person("Nora");
        String circle = circle(nora, "solo", "Just me");
        String page = emptyPage(nora, circle, "Order", null);
        String a = text(nora, page, "A");
        String c = text(nora, page, "C");
        String b = block(nora, page, "\"kind\":\"paragraph\",\"text\":\"B\",\"after\":\"%s\"".formatted(a));
        assertThat(texts(page, nora)).containsExactly("A", "B", "C");

        String z = block(nora, page, "\"kind\":\"paragraph\",\"text\":\"Z\",\"atStart\":true");
        assertThat(texts(page, nora)).containsExactly("Z", "A", "B", "C");
        send(HttpMethod.PATCH, "/v1/page-blocks/" + c, nora, "{\"after\":\"%s\"}".formatted(z), 200);
        assertThat(texts(page, nora)).containsExactly("Z", "C", "A", "B");
        send(HttpMethod.PATCH, "/v1/page-blocks/" + b, nora, "{\"atStart\":true}", 200);
        assertThat(texts(page, nora)).containsExactly("B", "Z", "C", "A");

        // After a block that is gone: at the end, rather than nowhere.
        send(HttpMethod.DELETE, "/v1/page-blocks/" + z, nora, null, 204);
        block(nora, page, "\"kind\":\"paragraph\",\"text\":\"D\",\"after\":\"%s\"".formatted(z));
        assertThat(texts(page, nora)).containsExactly("B", "C", "A", "D");
        // Many blocks put into the same gap still each get a place of their own.
        for (int i = 0; i < 60; i++) {
            block(nora, page, "\"kind\":\"paragraph\",\"text\":\"n%d\",\"after\":\"%s\"".formatted(i, b));
        }
        List<String> now = texts(page, nora);
        assertThat(now.subList(0, 3)).containsExactly("B", "n59", "n58");
        assertThat(now.subList(60, 64)).containsExactly("n0", "C", "A", "D");

        // Words can become a heading or a bullet. They can't become a photo.
        String heading = send(HttpMethod.PATCH, "/v1/page-blocks/" + a, nora, "{\"kind\":\"heading\"}", 200);
        assertThat(JsonPath.<String>read(heading, "$.kind")).isEqualTo("heading");
        assertThat(JsonPath.<String>read(heading, "$.text")).isEqualTo("A");
        send(HttpMethod.PATCH, "/v1/page-blocks/" + a, nora, "{\"kind\":\"photo\"}", 400);
        send(HttpMethod.PATCH, "/v1/page-blocks/" + a, nora, "{\"kind\":\"table\"}", 400);
    }

    @Test
    void twoPeopleWritingOnOnePageBothKeepWhatTheyDid() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String circle = circle(nora, "couple", "Nora and Alex");
        join(nora, circle, alex);
        String page = page(nora, circle, "Wi-Fi", null);
        String first = JsonPath.read(fetch("/v1/pages/" + page, nora), "$.blocks[0].id");

        // Both have the page open. Nora rewrites the first block while Alex adds two under it; then Nora adds
        // one in the same place.
        send(
                HttpMethod.PATCH,
                "/v1/page-blocks/" + first,
                nora,
                "{\"text\":\"The router is in the hallway cupboard.\"}",
                200);
        block(alex, page, "\"kind\":\"heading\",\"text\":\"If the internet drops\",\"after\":\"%s\"".formatted(first));
        block(alex, page, "\"kind\":\"bullet\",\"text\":\"Call Telemach\"");
        block(
                nora,
                page,
                "\"kind\":\"paragraph\",\"text\":\"The heating app is on the tablet.\",\"after\":\"%s\""
                        .formatted(first));

        String now = fetch("/v1/pages/" + page, alex);
        assertThat(titles(now, "$.blocks[*].text"))
                .containsExactly(
                        "The router is in the hallway cupboard.",
                        "The heating app is on the tablet.",
                        "If the internet drops",
                        "Call Telemach");
        // Who edited it last, for "Edited by Nora · just now".
        assertThat(JsonPath.<String>read(now, "$.editedBy.name")).isEqualTo("Nora");
        assertThat(JsonPath.<String>read(now, "$.editedAt")).isNotNull();
        send(HttpMethod.PATCH, "/v1/pages/" + page, alex, "{\"emoji\":\"📶\"}", 200);
        String after = fetch("/v1/pages/" + page, nora);
        assertThat(JsonPath.<String>read(after, "$.editedBy.name")).isEqualTo("Alex");
        assertThat(JsonPath.<String>read(after, "$.emoji")).isEqualTo("📶");
        assertThat(JsonPath.<String>read(after, "$.title")).isEqualTo("Wi-Fi");
    }

    @Test
    void aChangeThatCameTooLateForItsBlockAnswersGentlyAndTheRestGoIn() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String stranger = person("Stranger");
        String circle = circle(nora, "couple", "Nora and Alex");
        join(nora, circle, alex);
        String page = emptyPage(nora, circle, "Trip", null);
        String other = emptyPage(nora, circle, "Another page", null);
        String a = text(nora, page, "A");
        String b = text(nora, page, "B");
        String elsewhere = text(nora, other, "Elsewhere");

        // Alex's phone had no signal. Meanwhile Nora removed B.
        send(HttpMethod.DELETE, "/v1/page-blocks/" + b, nora, null, 204);

        // One at a time: a change to what is gone says so in a sentence; removing what is gone is fine.
        String gone = send(HttpMethod.PATCH, "/v1/page-blocks/" + b, alex, "{\"text\":\"Late\"}", 404);
        assertThat(JsonPath.<String>read(gone, "$.code")).isEqualTo("block_gone");
        assertThat(JsonPath.<String>read(gone, "$.detail")).contains("isn't there any more");
        send(HttpMethod.DELETE, "/v1/page-blocks/" + b, alex, null, 204);

        // The whole queue at once: each change has its own answer, and the late one doesn't stop the others.
        String queue = """
            {"changes":[
              {"op":"change","blockId":"%1$s","change":{"text":"B, but better"}},
              {"op":"add","add":{"clientId":"%2$s","kind":"paragraph","text":"New","after":"%1$s"}},
              {"op":"remove","blockId":"%1$s"},
              {"op":"change","blockId":"%3$s","change":{"text":"A, changed late"}},
              {"op":"add","add":{"clientId":"%4$s","kind":"photo"}},
              {"op":"change","blockId":"%5$s","change":{"text":"Not this page's"}}
            ]}
            """.formatted(b, id(), a, id(), elsewhere);
        String answer = send(HttpMethod.POST, "/v1/pages/" + page + "/changes", alex, queue, 200);
        assertThat(titles(answer, "$.answers[*].outcome"))
                .containsExactly("gone", "done", "done", "done", "refused", "gone");
        assertThat(JsonPath.<String>read(answer, "$.answers[0].said")).contains("removed while you were away");
        assertThat(JsonPath.<String>read(answer, "$.answers[4].said")).isEqualTo("Choose what to show here.");
        assertThat(titles(answer, "$.page.blocks[*].text")).containsExactly("A, changed late", "New");
        assertThat(texts(other, nora)).containsExactly("Elsewhere");

        // The phone didn't hear the answer and sends it all again: nothing is added twice.
        String again = send(HttpMethod.POST, "/v1/pages/" + page + "/changes", alex, queue, 200);
        assertThat(titles(again, "$.answers[*].outcome"))
                .containsExactly("gone", "done", "done", "done", "refused", "gone");
        assertThat(titles(again, "$.page.blocks[*].text")).containsExactly("A, changed late", "New");

        // A queue for a page that isn't yours to change is refused as a whole.
        send(HttpMethod.POST, "/v1/pages/" + page + "/changes", stranger, queue, 404);
        audience(nora, page, "{\"audience\":\"circle\",\"everyoneEdits\":false}");
        send(HttpMethod.POST, "/v1/pages/" + page + "/changes", alex, queue, 403);
        send(
                HttpMethod.POST,
                "/v1/pages/" + page + "/changes",
                nora,
                "{\"changes\":[{\"blockId\":\"%s\"}]}".formatted(a),
                400);
    }

    @Test
    void aLiveBlockShowsTheThingAsItStandsAndNothingOfWhatYouMayNotSee() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String circle = circle(nora, "family", "The Linds");
        String alexId = join(nora, circle, alex);
        String page = emptyPage(nora, circle, "Mia's birthday", "circle");
        String prep = list(nora, circle, null, "Party prep", "me", "Cake", "Balloons");
        String cake = JsonPath.read(fetch("/v1/checklists/" + prep, nora), "$.items[0].id");

        String block = block(nora, page, "\"kind\":\"live\",\"thingId\":\"%s\"".formatted(prep));

        String hers = fetch("/v1/pages/" + page, nora);
        assertThat(JsonPath.<String>read(hers, "$.blocks[0].thing.title")).isEqualTo("Party prep");
        assertThat(JsonPath.<String>read(hers, "$.blocks[0].thing.kind")).isEqualTo("checklist");
        assertThat(JsonPath.<String>read(hers, "$.blocks[0].thing.glance")).isEqualTo("0 of 2 done");
        assertThat(JsonPath.<String>read(hers, "$.blocks[0].thing.chip.audience"))
                .isEqualTo("me");
        assertThat(JsonPath.<Boolean>read(hers, "$.blocks[0].unseen")).isFalse();
        // It is live: tick a line where the list lives and the page says so.
        send(HttpMethod.PATCH, "/v1/checklist-items/" + cake, nora, "{\"done\":true}", 200);
        assertThat(JsonPath.<String>read(fetch("/v1/pages/" + page, nora), "$.blocks[0].thing.glance"))
                .isEqualTo("1 of 2 done");

        // Alex may read the page and not the list: something is there, and that is all he learns.
        String his = fetch("/v1/pages/" + page, alex);
        assertThat(JsonPath.<Boolean>read(his, "$.blocks[0].unseen")).isTrue();
        assertThat(JsonPath.<Object>read(his, "$.blocks[0].thing")).isNull();
        assertThat(his).doesNotContain("Party prep").doesNotContain(prep).doesNotContain("Cake");
        shareWith(nora, prep, alexId, "view");
        assertThat(JsonPath.<String>read(fetch("/v1/pages/" + page, alex), "$.blocks[0].thing.title"))
                .isEqualTo("Party prep");

        // Only what you can see yourself, from this circle, and not the page on itself.
        String secret = list(nora, circle, null, "Gift ideas", "me", "Skates");
        String elsewhere = page(nora, circle(nora, "crew", "Lisbon crew"), "Plans", "circle");
        send(
                HttpMethod.POST,
                "/v1/pages/" + page + "/blocks",
                alex,
                "{\"clientId\":\"%s\",\"kind\":\"live\",\"thingId\":\"%s\"}".formatted(id(), secret),
                404);
        send(
                HttpMethod.POST,
                "/v1/pages/" + page + "/blocks",
                nora,
                "{\"clientId\":\"%s\",\"kind\":\"live\",\"thingId\":\"%s\"}".formatted(id(), elsewhere),
                400);
        send(
                HttpMethod.POST,
                "/v1/pages/" + page + "/blocks",
                nora,
                "{\"clientId\":\"%s\",\"kind\":\"live\",\"thingId\":\"%s\"}".formatted(id(), page),
                400);
        send(
                HttpMethod.POST,
                "/v1/pages/" + page + "/blocks",
                nora,
                "{\"clientId\":\"%s\",\"kind\":\"live\"}".formatted(id()),
                400);
        // A live block is the thing itself, never a copy: it has no words of its own.
        send(HttpMethod.PATCH, "/v1/page-blocks/" + block, nora, "{\"text\":\"A caption\"}", 200);
        assertThat(JsonPath.<String>read(fetch("/v1/pages/" + page, nora), "$.body"))
                .isEmpty();

        // When the thing is deleted, its block goes with it.
        send(HttpMethod.DELETE, "/v1/things/" + prep, nora, null, 204);
        assertThat(JsonPath.<List<Object>>read(fetch("/v1/pages/" + page, alex), "$.blocks"))
                .isEmpty();
    }

    @Test
    void aListStartedInAPageIsSharedLikeThePageAndDrawnWithItsLines() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String mia = person("Mia");
        String circle = circle(nora, "family", "The Linds");
        join(nora, circle, alex);
        String miaId = join(nora, circle, mia);
        String page = emptyPage(nora, circle, "Mia's 10th birthday", "circle");
        audience(nora, page, "{\"audience\":\"circle\",\"hiddenFrom\":[{\"memberId\":\"%s\"}]}".formatted(miaId));

        String block = send(
                HttpMethod.POST,
                "/v1/pages/" + page + "/blocks",
                nora,
                "{\"clientId\":\"%s\",\"kind\":\"checklist\",\"title\":\"Gift ideas\",\"items\":[\"Roller skates\",\"Watercolour set\"]}"
                        .formatted(id()),
                201);
        String list = JsonPath.read(block, "$.thing.id");
        assertThat(JsonPath.<String>read(block, "$.thing.title")).isEqualTo("Gift ideas");
        assertThat(titles(block, "$.checklist.items[*].text")).containsExactly("Roller skates", "Watercolour set");

        // Whoever reads the page reads the list in it, and can tick it right there.
        String his = fetch("/v1/pages/" + page, alex);
        String skates = JsonPath.read(his, "$.blocks[0].checklist.items[0].id");
        assertThat(titles(his, "$.blocks[0].thing.chip.hiddenFrom")).containsExactly("Mia");
        send(
                HttpMethod.PATCH,
                "/v1/checklist-items/" + skates,
                alex,
                "{\"done\":true,\"note\":\"Alex bought them\"}",
                200);
        String hers = fetch("/v1/pages/" + page, nora);
        assertThat(JsonPath.<Boolean>read(hers, "$.blocks[0].checklist.items[0].done"))
                .isTrue();
        assertThat(JsonPath.<String>read(hers, "$.blocks[0].checklist.items[0].doneBy.name"))
                .isEqualTo("Alex");

        // And whoever the page is hidden from finds neither the page nor the list, by any way.
        assertThat(status("/v1/pages/" + page, mia)).isEqualTo(404);
        assertThat(status("/v1/checklists/" + list, mia)).isEqualTo(404);
        assertThat(fetch("/v1/circles/" + circle + "/search?q=skates", mia)).doesNotContain(list);
        assertThat(fetch("/v1/circles/" + circle + "/checklists", mia)).doesNotContain(list);
        assertThat(fetch("/v1/circles/" + circle + "/notes", mia))
                .doesNotContain(list)
                .doesNotContain(page);

        // The list has its place in the page: it isn't listed by itself as something that was never filed.
        String notes = fetch("/v1/circles/" + circle + "/notes", alex);
        assertThat(titles(notes, "$.recent[*].title")).containsExactly("Mia's 10th birthday");
        assertThat(JsonPath.<Integer>read(notes, "$.unfiled")).isEqualTo(1);

        // After the page is shared differently, its lists can be given the same audience in one go.
        audience(nora, page, "{\"audience\":\"me\"}");
        assertThat(status("/v1/checklists/" + list, alex)).isEqualTo(200);
        String shared = send(HttpMethod.POST, "/v1/pages/" + page + "/share-lists", nora, null, 200);
        assertThat(JsonPath.<Integer>read(shared, "$.changed")).isEqualTo(1);
        assertThat(status("/v1/checklists/" + list, alex)).isEqualTo(404);

        // A list that exists already can be drawn in a page too; a page can't be drawn as a list.
        String groceries = list(nora, circle, null, "Groceries", "me", "Milk");
        String drawn = send(
                HttpMethod.POST,
                "/v1/pages/" + page + "/blocks",
                nora,
                "{\"clientId\":\"%s\",\"kind\":\"checklist\",\"thingId\":\"%s\"}".formatted(id(), groceries),
                201);
        assertThat(titles(drawn, "$.checklist.items[*].text")).containsExactly("Milk");
        send(
                HttpMethod.POST,
                "/v1/pages/" + page + "/blocks",
                nora,
                "{\"clientId\":\"%s\",\"kind\":\"checklist\",\"thingId\":\"%s\"}".formatted(id(), page),
                400);
    }

    @Test
    void aPhotoInAPageIsYourOwnUploadAndGoesWhenItsBlockGoes() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String circle = circle(nora, "couple", "Nora and Alex");
        join(nora, circle, alex);
        String page = emptyPage(nora, circle, "Wi-Fi", null);
        String photo = uploadPhoto(nora);

        String block = send(
                HttpMethod.POST,
                "/v1/pages/" + page + "/blocks",
                nora,
                "{\"clientId\":\"%s\",\"kind\":\"photo\",\"mediaId\":\"%s\",\"text\":\"Where the router lives\"}"
                        .formatted(id(), photo),
                201);
        assertThat(JsonPath.<String>read(block, "$.media.url")).contains("/");
        assertThat(JsonPath.<String>read(block, "$.media.kind")).isEqualTo("photo");
        // The words under a photo are part of the page's words.
        assertThat(JsonPath.<String>read(fetch("/v1/pages/" + page, alex), "$.body"))
                .isEqualTo("Where the router lives");
        assertThat(JsonPath.<String>read(fetch("/v1/pages/" + page, alex), "$.blocks[0].media.thumbUrl"))
                .isNotNull();

        // Someone else's upload, the same upload twice, a photo as a file, or nothing at all: refused.
        String blockWith = "{\"clientId\":\"%s\",\"kind\":\"%s\",\"mediaId\":\"%s\"}";
        send(
                HttpMethod.POST,
                "/v1/pages/" + page + "/blocks",
                alex,
                blockWith.formatted(id(), "photo", uploadPhoto(nora)),
                400);
        send(HttpMethod.POST, "/v1/pages/" + page + "/blocks", nora, blockWith.formatted(id(), "photo", photo), 400);
        send(
                HttpMethod.POST,
                "/v1/pages/" + page + "/blocks",
                nora,
                blockWith.formatted(id(), "file", uploadPhoto(nora)),
                400);
        send(
                HttpMethod.POST,
                "/v1/pages/" + page + "/blocks",
                nora,
                "{\"clientId\":\"%s\",\"kind\":\"file\"}".formatted(id()),
                400);

        // A file is added the same way, and comes back with its name and where to open it.
        String target = send(
                HttpMethod.POST,
                "/v1/media/uploads",
                nora,
                "{\"kind\":\"file\",\"contentType\":\"application/pdf\",\"fileName\":\"Boiler manual.pdf\"}",
                200);
        send(target, "application/pdf", "a manual".getBytes());
        String manual = JsonPath.read(target, "$.mediaId");
        send(HttpMethod.POST, "/v1/media/uploads/" + manual + "/complete", nora, null, 204);
        String file = send(
                HttpMethod.POST, "/v1/pages/" + page + "/blocks", nora, blockWith.formatted(id(), "file", manual), 201);
        assertThat(JsonPath.<String>read(file, "$.media.fileName")).isEqualTo("Boiler manual.pdf");
        assertThat(JsonPath.<String>read(file, "$.media.fileUrl")).isNotNull();
        assertThat(JsonPath.<Object>read(file, "$.media.thumbUrl")).isNull();
        send(HttpMethod.POST, "/v1/pages/" + page + "/blocks", nora, blockWith.formatted(id(), "photo", manual), 400);

        // The upload goes with its block, and with its page.
        send(HttpMethod.DELETE, "/v1/page-blocks/" + JsonPath.<String>read(block, "$.id"), nora, null, 204);
        assertThat(uploads(photo)).isZero();
        String second = uploadPhoto(nora);
        send(HttpMethod.POST, "/v1/pages/" + page + "/blocks", nora, blockWith.formatted(id(), "photo", second), 201);
        send(HttpMethod.DELETE, "/v1/things/" + page, nora, null, 204);
        assertThat(uploads(second)).isZero();
        assertThat(uploads(manual)).isZero();
        assertThat(jdbc.sql("select count(*) from removed_files")
                        .query(Integer.class)
                        .single())
                .isEqualTo(3);
    }

    private int uploads(String mediaId) {
        return jdbc.sql("select count(*) from media where id = cast(:id as uuid)")
                .param("id", mediaId)
                .query(Integer.class)
                .single();
    }

    @Test
    void marksStayWithTheirTextAndAPlaceHasWordsAndMayHaveAPoint() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String circle = circle(nora, "couple", "Nora and Alex");
        String alexId = join(nora, circle, alex);
        String outsider =
                JsonPath.read(fetch("/v1/circles/" + circle(alex, "solo", "Alex alone"), alex), "$.myMemberId");
        String page = emptyPage(nora, circle, "Wi-Fi", null);
        String words = "The heating app is on the hallway tablet. @Alex knows the boiler code.";
        String marked = "{\"clientId\":\"%s\",\"kind\":\"paragraph\",\"text\":\"%s\",\"marks\":[%s]}";

        String block = send(
                HttpMethod.POST,
                "/v1/pages/" + page + "/blocks",
                nora,
                marked.formatted(
                        id(),
                        words,
                        "{\"start\":42,\"end\":47,\"kind\":\"mention\",\"memberId\":\"%s\"},{\"start\":4,\"end\":15,\"kind\":\"bold\"},{\"start\":4,\"end\":15,\"kind\":\"link\",\"url\":\"https://example.com/heating\"}"
                                .formatted(alexId)),
                201);
        assertThat(titles(block, "$.marks[*].kind")).containsExactly("bold", "link", "mention");
        assertThat(JsonPath.<String>read(block, "$.marks[1].url")).isEqualTo("https://example.com/heating");
        assertThat(JsonPath.<String>read(block, "$.marks[2].memberId")).isEqualTo(alexId);
        assertThat(JsonPath.<String>read(fetch("/v1/pages/" + page, alex), "$.body"))
                .isEqualTo(words);

        // A mark outside its text, a link that isn't one, a name from another circle: refused.
        send(
                HttpMethod.POST,
                "/v1/pages/" + page + "/blocks",
                nora,
                marked.formatted(id(), "Short", "{\"start\":0,\"end\":9,\"kind\":\"bold\"}"),
                400);
        send(
                HttpMethod.POST,
                "/v1/pages/" + page + "/blocks",
                nora,
                marked.formatted(
                        id(), "Short", "{\"start\":0,\"end\":5,\"kind\":\"link\",\"url\":\"javascript:alert(1)\"}"),
                400);
        send(
                HttpMethod.POST,
                "/v1/pages/" + page + "/blocks",
                nora,
                marked.formatted(
                        id(),
                        "Short",
                        "{\"start\":0,\"end\":5,\"kind\":\"mention\",\"memberId\":\"%s\"}".formatted(outsider)),
                400);
        send(
                HttpMethod.POST,
                "/v1/pages/" + page + "/blocks",
                nora,
                marked.formatted(id(), "Short", "{\"start\":0,\"end\":5,\"kind\":\"blink\"}"),
                400);
        // New words without new marks have none; marks sent with the words are kept.
        String id = JsonPath.read(block, "$.id");
        assertThat(JsonPath.<List<Object>>read(
                        send(HttpMethod.PATCH, "/v1/page-blocks/" + id, nora, "{\"text\":\"Shorter now\"}", 200),
                        "$.marks"))
                .isEmpty();
        String again = send(
                HttpMethod.PATCH,
                "/v1/page-blocks/" + id,
                nora,
                "{\"text\":\"Shorter now\",\"marks\":[{\"start\":0,\"end\":7,\"kind\":\"italic\"}]}",
                200);
        assertThat(titles(again, "$.marks[*].kind")).containsExactly("italic");
        assertThat(titles(
                        send(HttpMethod.PATCH, "/v1/page-blocks/" + id, nora, "{\"kind\":\"bullet\"}", 200),
                        "$.marks[*].kind"))
                .containsExactly("italic");

        // A place: words, and a point when it is known.
        String place = send(
                HttpMethod.POST,
                "/v1/pages/" + page + "/blocks",
                nora,
                "{\"clientId\":\"%s\",\"kind\":\"place\",\"text\":\"Hallway cupboard, Trubarjeva 9\",\"lat\":46.0519,\"lng\":14.5096}"
                        .formatted(id()),
                201);
        assertThat(JsonPath.<Double>read(place, "$.lat")).isEqualTo(46.0519);
        String placeId = JsonPath.read(place, "$.id");
        send(
                HttpMethod.POST,
                "/v1/pages/" + page + "/blocks",
                nora,
                "{\"clientId\":\"%s\",\"kind\":\"place\",\"lat\":1,\"lng\":2}".formatted(id()),
                400);
        send(
                HttpMethod.POST,
                "/v1/pages/" + page + "/blocks",
                nora,
                "{\"clientId\":\"%s\",\"kind\":\"place\",\"text\":\"Somewhere\",\"lat\":146}".formatted(id()),
                400);
        String noPoint = send(HttpMethod.PATCH, "/v1/page-blocks/" + placeId, nora, "{\"removePoint\":true}", 200);
        assertThat(JsonPath.<Object>read(noPoint, "$.lat")).isNull();
        assertThat(JsonPath.<String>read(noPoint, "$.text")).isEqualTo("Hallway cupboard, Trubarjeva 9");
        assertThat(JsonPath.<String>read(fetch("/v1/pages/" + page, nora), "$.body"))
                .isEqualTo("• Shorter now\nHallway cupboard, Trubarjeva 9");
    }

    @Test
    void askingAgainForAPageThatDidNotChangeGetsAShortNo() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String stranger = person("Stranger");
        String circle = circle(nora, "couple", "Nora and Alex");
        join(nora, circle, alex);
        String page = emptyPage(nora, circle, "Wi-Fi", null);
        String list = JsonPath.read(
                send(
                        HttpMethod.POST,
                        "/v1/pages/" + page + "/blocks",
                        nora,
                        "{\"clientId\":\"%s\",\"kind\":\"checklist\",\"items\":[\"Unplug the white box\"]}"
                                .formatted(id()),
                        201),
                "$.checklist.items[0].id");
        String path = "/v1/pages/" + page;
        String version = JsonPath.read(fetch(path, alex), "$.version");

        MvcResult same = again(path, alex, version);
        assertThat(same.getResponse().getStatus()).isEqualTo(304);
        assertThat(same.getResponse().getContentAsString()).isEmpty();
        assertThat(same.getResponse().getHeader("ETag")).isEqualTo("\"" + version + "\"");

        // Anything he would be shown differently makes it a full answer again: a block, a tick in the list
        // drawn in the page, the title.
        text(nora, page, "The router is in the hallway.");
        MvcResult changed = again(path, alex, version);
        assertThat(changed.getResponse().getStatus()).isEqualTo(200);
        String second = JsonPath.read(changed.getResponse().getContentAsString(), "$.version");
        assertThat(second).isNotEqualTo(version);
        assertThat(again(path, alex, second).getResponse().getStatus()).isEqualTo(304);
        send(HttpMethod.PATCH, "/v1/checklist-items/" + list, nora, "{\"done\":true}", 200);
        assertThat(again(path, alex, second).getResponse().getStatus()).isEqualTo(200);
        String third = JsonPath.read(fetch(path, alex), "$.version");
        send(HttpMethod.PATCH, path, nora, "{\"title\":\"Wi-Fi and smart home\"}", 200);
        assertThat(again(path, alex, third).getResponse().getStatus()).isEqualTo(200);

        // His own pin changes his answer and nobody else's.
        String his = JsonPath.read(fetch(path, alex), "$.version");
        String hers = JsonPath.read(fetch(path, nora), "$.version");
        send(HttpMethod.PUT, "/v1/things/" + page + "/pin", alex, null, 204);
        assertThat(again(path, alex, his).getResponse().getStatus()).isEqualTo(200);
        assertThat(again(path, nora, hers).getResponse().getStatus()).isEqualTo(304);

        // Knowing a version is no way in.
        assertThat(again(path, stranger, hers).getResponse().getStatus()).isEqualTo(404);
        audience(nora, page, "{\"audience\":\"me\"}");
        assertThat(again(path, alex, JsonPath.read(fetch(path, nora), "$.version"))
                        .getResponse()
                        .getStatus())
                .isEqualTo(404);
    }

    @Test
    void changingAllTheWordsTheOldWayKeepsThePhotosAndLists() throws Exception {
        String nora = person("Nora");
        String circle = circle(nora, "solo", "Just me");
        String page = page(nora, circle, "Wi-Fi", null);
        block(nora, page, "\"kind\":\"heading\",\"text\":\"If the internet drops\"");
        block(
                nora,
                page,
                "\"kind\":\"photo\",\"mediaId\":\"%s\",\"text\":\"Where the router lives\""
                        .formatted(uploadPhoto(nora)));
        block(nora, page, "\"kind\":\"checklist\",\"items\":[\"Unplug the white box\"]");

        String changed = send(HttpMethod.PATCH, "/v1/pages/" + page, nora, "{\"body\":\"All new words\"}", 200);

        assertThat(titles(changed, "$.blocks[*].kind")).containsExactly("paragraph", "photo", "checklist");
        assertThat(JsonPath.<String>read(changed, "$.blocks[0].text")).isEqualTo("All new words");
        assertThat(JsonPath.<String>read(changed, "$.body")).isEqualTo("All new words\nWhere the router lives");
        // The same words again change nothing.
        String again = send(
                HttpMethod.PATCH,
                "/v1/pages/" + page,
                nora,
                "{\"body\":\"All new words\\nWhere the router lives\"}",
                200);
        assertThat(JsonPath.<String>read(again, "$.blocks[0].id"))
                .isEqualTo(JsonPath.<String>read(changed, "$.blocks[0].id"));
    }

    @Test
    void whoMayOnlyLookAtAPageCannotChangeItsBlocks() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String kai = person("Kai");
        String stranger = person("Stranger");
        String circle = circle(nora, "family", "The Linds");
        String alexId = join(nora, circle, alex);
        join(nora, circle, kai);
        String page = emptyPage(nora, circle, "Wi-Fi", "me");
        String block = text(nora, page, "The router is in the hallway.");
        shareWith(nora, page, alexId, "view");
        String add = "{\"clientId\":\"%s\",\"kind\":\"paragraph\",\"text\":\"Hello\"}";

        // Alex may look: no adding, changing, moving or removing.
        assertThat(texts(page, alex)).containsExactly("The router is in the hallway.");
        send(HttpMethod.POST, "/v1/pages/" + page + "/blocks", alex, add.formatted(id()), 403);
        send(HttpMethod.PATCH, "/v1/page-blocks/" + block, alex, "{\"text\":\"Mine now\"}", 403);
        send(HttpMethod.DELETE, "/v1/page-blocks/" + block, alex, null, 403);
        send(HttpMethod.POST, "/v1/pages/" + page + "/share-lists", alex, null, 200);

        // Kai is in the circle and wasn't shown the page; a stranger isn't in the circle. To both, neither the
        // page nor a block of it is there.
        for (String outside : List.of(kai, stranger)) {
            send(HttpMethod.POST, "/v1/pages/" + page + "/blocks", outside, add.formatted(id()), 404);
            send(HttpMethod.PATCH, "/v1/page-blocks/" + block, outside, "{\"text\":\"Mine now\"}", 404);
            send(HttpMethod.DELETE, "/v1/page-blocks/" + block, outside, null, 404);
            send(HttpMethod.POST, "/v1/pages/" + page + "/share-lists", outside, null, 404);
        }
        assertThat(texts(page, nora)).containsExactly("The router is in the hallway.");

        shareWith(nora, page, alexId, "edit");
        send(HttpMethod.PATCH, "/v1/page-blocks/" + block, alex, "{\"text\":\"The router is in the cupboard.\"}", 200);
    }

    @Test
    void aPhoneCanKeepWorkingOnABlockItAddedWithoutSignal() throws Exception {
        String nora = person("Nora");
        String circle = circle(nora, "solo", "Just me");
        String page = emptyPage(nora, circle, "Trip", null);
        text(nora, page, "Was here already");
        String first = id();
        String second = id();

        // On the train: two new blocks, the second under the first; the first rewritten; the second thrown
        // away again. The phone knows its new blocks only by the ids it gave them itself.
        String queue = """
            {"changes":[
              {"op":"add","add":{"clientId":"%1$s","kind":"heading","text":"Written offline","atStart":true}},
              {"op":"add","add":{"clientId":"%2$s","kind":"paragraph","text":"Under it","after":"%1$s"}},
              {"op":"change","blockId":"%1$s","change":{"text":"Written offline, then changed"}},
              {"op":"add","add":{"clientId":"%3$s","kind":"bullet","text":"And a third","after":"%2$s"}},
              {"op":"remove","blockId":"%2$s"}
            ]}
            """.formatted(first, second, id());
        String answer = send(HttpMethod.POST, "/v1/pages/" + page + "/changes", nora, queue, 200);

        assertThat(titles(answer, "$.answers[*].outcome")).containsOnly("done");
        assertThat(titles(answer, "$.page.blocks[*].text"))
                .containsExactly("Written offline, then changed", "And a third", "Was here already");
        // The answers carry the ids the blocks have from now on.
        assertThat(JsonPath.<String>read(answer, "$.answers[2].blockId"))
                .isEqualTo(JsonPath.<String>read(answer, "$.page.blocks[0].id"))
                .isNotEqualTo(first);
        assertThat(titles(
                        send(HttpMethod.POST, "/v1/pages/" + page + "/changes", nora, queue, 200),
                        "$.page.blocks[*].text"))
                .containsExactly("Written offline, then changed", "And a third", "Was here already");
    }
}

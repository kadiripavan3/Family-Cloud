package app.homeport.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.jayway.jsonpath.JsonPath;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;

/**
 * The guest book: a guest writes through the code by the door, on a web page with no account, and what they
 * write is seen by nobody but the people who live there until one of them says yes. Tried as two flatmates,
 * someone who is only a guest in the circle, the next guest at the door, and someone with a guest pass.
 */
class GuestBookTest extends BoardTest {

    private static final String WAITING = "Zebra stripes on the ceiling";

    private String page(String path) throws Exception {
        return mvc.perform(get(path)).andReturn().getResponse().getContentAsString();
    }

    private String door(String path, String json, int expected) throws Exception {
        var answer = mvc.perform(
                        post(path).contentType(MediaType.APPLICATION_JSON).content(json))
                .andReturn()
                .getResponse();
        assertThat(answer.getStatus()).as(path).isEqualTo(expected);
        return answer.getContentAsString();
    }

    private static String pathOf(String link) {
        return link.replaceFirst("^https?://[^/]+", "");
    }

    @Test
    void whatAGuestWritesAtTheDoorWaitsForAFlatmatesYesBeforeAnyoneElseSeesIt() throws Exception {
        String kai = person("Kai");
        String lea = person("Lea");
        String visitor = person("Visitor");
        String flat = circle(kai, "flat", "Trubarjeva 9");
        String leaId = join(kai, flat, lea);
        String visitorId = join(kai, flat, visitor);
        // Someone who was let into the circle as a guest only: among equals that is the one role there is.
        jdbc.sql("update members set role = 'guest' where id = cast(:id as uuid)")
                .param("id", visitorId)
                .update();
        String book = board(kai, flat, "guest_book", null, null);
        // A guest of the circle sees only what is shared with them by name: the book is, to change even.
        shareWith(kai, book, leaId, "edit", visitorId, "edit");

        // A flatmate writes a line into the book in the app: it is there at once.
        add(
                lea,
                book,
                "line",
                "{\"name\":\"Tom\",\"about\":\"from Leeds\",\"text\":\"Stayed for the pancakes.\",\"nights\":3}");
        // Someone who is only a guest in the circle doesn't add to it there, and gets no link.
        assertThat(add(visitor, book, "line", "{\"name\":\"Me\",\"text\":\"I was here\"}", 403))
                .contains("Only the people who live here");
        assertThat(JsonPath.<Object>read(view(visitor, book), "$.view.link")).isNull();
        assertThat(JsonPath.<Boolean>read(view(visitor, book), "$.view.decides"))
                .isFalse();

        // The code by the door is a link. Its page shows the book's name and what was let in, nothing else.
        String link = JsonPath.read(view(kai, book), "$.view.link");
        String path = pathOf(link);
        assertThat(path).matches("/book/[a-z0-9-]{23}");
        var opened = mvc.perform(get(path)).andReturn().getResponse();
        assertThat(opened.getHeader("Referrer-Policy")).isEqualTo("same-origin");
        assertThat(opened.getHeader("Cache-Control")).isEqualTo("no-store");
        assertThat(opened.getContentAsString())
                .contains("The guest book")
                .contains("Stayed for the pancakes.")
                .contains("Sign the book")
                .doesNotContain("Trubarjeva")
                .doesNotContain("Kai")
                .doesNotContain("from Leeds");
        assertThat(page("/book/abcde-fghjk-mnpqr-stuvw")).contains("This code doesn't work any more");
        door("/book/abcde-fghjk-mnpqr-stuvw/sign", "{\"name\":\"X\",\"text\":\"Y\"}", 404);

        // A guest signs. A name and a line are needed; a second tap leaves one line.
        assertThat(door(path + "/sign", "{\"name\":\" \",\"text\":\"Hello\"}", 400))
                .contains("Write your name.");
        assertThat(door(path + "/sign", "{\"name\":\"Maja\"}", 400)).contains("Write a line for the book.");
        assertThat(door(path + "/sign", "{\"name\":\"Maja\",\"text\":\"Hi\",\"nights\":0}", 400))
                .contains("as a number");
        String signing =
                "{\"clientId\":\"%s\",\"name\":\"Maja\",\"about\":\"Lena's sister\",\"text\":\"%s\",\"nights\":2}"
                        .formatted(id(), WAITING);
        door(path + "/sign", signing, 200);
        door(path + "/sign", signing, 200);

        // The two who live here see it waiting, and hear of it on Today.
        for (String flatmate : List.of(kai, lea)) {
            String seen = view(flatmate, book);
            assertThat(JsonPath.<List<String>>read(seen, "$.view.waiting[*].text"))
                    .containsExactly(WAITING);
            assertThat(JsonPath.<Boolean>read(seen, "$.view.waiting[0].fromTheDoor"))
                    .isTrue();
            assertThat(JsonPath.<String>read(seen, "$.view.waiting[0].about")).isEqualTo("Lena's sister");
            // Waiting isn't in the book yet: it isn't counted.
            assertThat(JsonPath.<Integer>read(seen, "$.view.guests")).isEqualTo(1);
            assertThat(JsonPath.<Integer>read(seen, "$.view.nights")).isEqualTo(3);
            assertThat(JsonPath.<String>read(fetch("/v1/things/" + book, flatmate), "$.glance"))
                    .isEqualTo("1 guest · 3 nights on the sofa · 1 waiting for a yes");
            String today = fetch("/v1/circles/" + flat + "/today", flatmate);
            assertThat(JsonPath.<List<String>>read(today, "$.cards[*].title"))
                    .containsExactly("A guest wrote in the guest book");
            assertThat(JsonPath.<String>read(today, "$.cards[0].line"))
                    .isEqualTo("Maja, Lena's sister · waiting for a yes");
            assertThat(fetch("/v1/boards/" + book + "/entries?filter=waiting", flatmate))
                    .contains(WAITING);
            assertThat(fetch("/v1/circles/" + flat + "/search?q=Zebra", flatmate))
                    .contains(book);
        }

        // Nobody else does, by any route: not the guest in the circle, not the next guest at the door, not
        // someone with a guest pass.
        assertNowhere(visitor, flat, book, WAITING);
        assertThat(view(visitor, book)).doesNotContain("Maja").doesNotContain("waiting for a yes");
        assertThat(JsonPath.<String>read(fetch("/v1/things/" + book, visitor), "$.glance"))
                .isEqualTo("1 guest · 3 nights on the sofa");
        assertThat(JsonPath.<List<Object>>read(fetch("/v1/circles/" + flat + "/today", visitor), "$.cards"))
                .isEmpty();
        assertThat(page(path))
                .contains("Stayed for the pancakes.")
                .doesNotContain("Zebra")
                .doesNotContain("Maja");
        String pass = send(
                HttpMethod.POST,
                "/v1/circles/" + flat + "/guest-passes",
                kai,
                "{\"clientId\":\"%s\",\"guestName\":\"Ines\",\"endsAt\":\"%s\",\"thingIds\":[\"%s\"]}"
                        .formatted(id(), Instant.now().plusSeconds(3600), book),
                201);
        String passPage = mvc.perform(
                        post(pathOf(JsonPath.read(pass, "$.url"))).param("code", JsonPath.<String>read(pass, "$.code")))
                .andReturn()
                .getResponse()
                .getContentAsString();
        assertThat(passPage)
                .contains("Stayed for the pancakes.")
                .doesNotContain("Zebra")
                .doesNotContain("Maja");
        String waitingId = JsonPath.read(view(kai, book), "$.view.waiting[0].id");
        // The guest in the circle can't let it in, change it or remove it.
        act(visitor, book, "let_in", "{\"entryId\":\"%s\"}".formatted(waitingId), 403);
        change(visitor, waitingId, "{\"name\":\"Peek\"}", 403);
        send(HttpMethod.DELETE, "/v1/board-entries/" + waitingId, visitor, null, 403);

        // Lea says yes. Now it is in the book for everyone, counted, and on the door's page.
        String letIn = act(lea, book, "let_in", "{\"entryId\":\"%s\"}".formatted(waitingId), 200);
        assertThat(JsonPath.<List<Object>>read(letIn, "$.view.waiting")).isEmpty();
        assertThat(JsonPath.<List<String>>read(letIn, "$.view.latest[*].name")).containsExactly("Maja", "Tom");
        assertThat(JsonPath.<String>read(letIn, "$.view.latest[0].letInBy.name"))
                .isEqualTo("Lea");
        assertThat(JsonPath.<Integer>read(letIn, "$.view.guests")).isEqualTo(2);
        assertThat(JsonPath.<Integer>read(letIn, "$.view.nights")).isEqualTo(5);
        assertThat(view(visitor, book)).contains(WAITING);
        assertThat(page(path)).contains("Zebra stripes on the ceiling").contains("Maja");
        assertThat(fetch("/v1/circles/" + flat + "/search?q=Zebra", visitor)).contains(book);
        assertThat(JsonPath.<List<Object>>read(fetch("/v1/circles/" + flat + "/today", kai), "$.cards"))
                .isEmpty();

        // A guest's words stay theirs; the facts of the stay can be put right. A flatmate can remove a line.
        assertThat(change(kai, waitingId, "{\"text\":\"Something else\"}", 409)).contains("a guest's own words");
        change(kai, waitingId, "{\"nights\":4}", 200);
        assertThat(JsonPath.<Integer>read(view(kai, book), "$.view.nights")).isEqualTo(7);
        door(path + "/sign", "{\"name\":\"Nobody\",\"text\":\"Rude words\"}", 200);
        String rude = JsonPath.read(view(lea, book), "$.view.waiting[0].id");
        send(HttpMethod.DELETE, "/v1/board-entries/" + rude, lea, null, 204);
        assertThat(view(kai, book)).doesNotContain("Rude words");

        // A new code: the old link stops working, and the new one opens the same book.
        String newLink = JsonPath.read(act(kai, book, "new_code", "{}", 200), "$.view.link");
        assertThat(newLink).isNotEqualTo(link);
        assertThat(page(path)).contains("This code doesn't work any more").doesNotContain("pancakes");
        door(path + "/sign", "{\"name\":\"Late\",\"text\":\"Too late\"}", 404);
        assertThat(page(pathOf(newLink))).contains("Stayed for the pancakes.");
    }

    @Test
    void aGuestsPhotoTravelsLikeEveryFileAndADoorThatIsFloodedStopsTakingMore() throws Exception {
        String kai = person("Kai");
        String flat = circle(kai, "flat", "Trubarjeva 9");
        String book = board(kai, flat, "guest_book", null, null);
        String path = pathOf(JsonPath.read(view(kai, book), "$.view.link"));

        // The page asks where to send the photo, sends it there, and says it is done.
        String target = door(
                path + "/sign",
                "{\"clientId\":\"%s\",\"name\":\"Tom\",\"text\":\"Came with a camera\",\"photoType\":\"image/jpeg\"}"
                        .formatted(id()),
                200);
        String mediaId = JsonPath.read(target, "$.mediaId");
        assertThat(JsonPath.<Object>read(view(kai, book), "$.view.waiting[0].photo"))
                .isNull();
        door(path + "/photo", "{\"mediaId\":\"%s\"}".formatted(id()), 400);
        send(
                target,
                "image/jpeg",
                jpeg(new java.awt.image.BufferedImage(8, 6, java.awt.image.BufferedImage.TYPE_INT_RGB)));
        door(path + "/photo", "{\"mediaId\":\"%s\"}".formatted(mediaId), 204);
        door(path + "/photo", "{\"mediaId\":\"%s\"}".formatted(mediaId), 204);
        String withPhoto = view(kai, book);
        assertThat(JsonPath.<String>read(withPhoto, "$.view.waiting[0].photo.url"))
                .contains("/media/");
        // It is kept as an upload of whoever made the book, and goes when the line is turned away.
        String line = JsonPath.read(withPhoto, "$.view.waiting[0].id");
        assertThat(jdbc.sql("select count(*) from media where id = cast(:id as uuid) and status = 'ready'")
                        .param("id", mediaId)
                        .query(Integer.class)
                        .single())
                .isEqualTo(1);
        send(HttpMethod.DELETE, "/v1/board-entries/" + line, kai, null, 204);
        assertThat(jdbc.sql("select count(*) from media where id = cast(:id as uuid)")
                        .param("id", mediaId)
                        .query(Integer.class)
                        .single())
                .isZero();

        // Something that isn't a photo is refused, and the line stays without it.
        String notAPhoto = door(
                path + "/sign",
                "{\"clientId\":\"%s\",\"name\":\"Zed\",\"text\":\"With a file\",\"photoType\":\"image/jpeg\"}"
                        .formatted(id()),
                200);
        send(notAPhoto, "image/jpeg", "not a picture at all".getBytes());
        assertThat(door(
                        path + "/photo",
                        "{\"mediaId\":\"%s\"}".formatted(JsonPath.<String>read(notAPhoto, "$.mediaId")),
                        400))
                .contains("Your line is there without it");
        assertThat(JsonPath.<List<String>>read(view(kai, book), "$.view.waiting[*].text"))
                .containsExactly("With a file");

        // Thirty lines may wait. The thirty-first is told to try later, and nothing more piles up.
        for (int n = 1; n < 30; n++) {
            door(path + "/sign", "{\"name\":\"Guest %d\",\"text\":\"Line %d\"}".formatted(n, n), 200);
        }
        assertThat(door(path + "/sign", "{\"name\":\"One more\",\"text\":\"Line 31\"}", 429))
                .contains("A lot is waiting to be read already");
        assertThat(JsonPath.<Integer>read(view(kai, book), "$.view.waiting.length()"))
                .isEqualTo(30);
    }
}

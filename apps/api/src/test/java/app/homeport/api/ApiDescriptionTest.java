package app.homeport.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

import com.jayway.jsonpath.JsonPath;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Rules that every part of the API keeps, checked against its own description (openapi.json), so a route
 * added later is held to them without anyone remembering: lists take a cursor, creating takes a clientId,
 * and nothing that is read by its id is there for someone outside the circle.
 */
class ApiDescriptionTest extends ApiTest {

    private static final JsonNode API = new JsonMapper().readTree(read());

    private static String read() {
        try {
            return Files.readString(Path.of("openapi.json"));
        } catch (java.io.IOException e) {
            throw new java.io.UncheckedIOException(e);
        }
    }

    /** Operations that create something and take no clientId, each with the reason that is good enough. */
    private static final Map<String, String> CREATES_WITHOUT_CLIENT_ID =
            Map.of("POST /v1/library", "a batch: each file in it carries its own clientId");

    @Test
    void everyListThatHandsOutACursorTakesACursorAndALimit() {
        List<String> wrong = new ArrayList<>();
        operations().forEach((name, operation) -> {
            JsonNode answer = schemaOf(operation.path("responses").path("200").path("content"));
            if (answer.path("properties").has("nextCursor")) {
                List<String> parameters = new ArrayList<>();
                operation
                        .path("parameters")
                        .forEach(p -> parameters.add(p.path("name").asString()));
                if (!parameters.contains("cursor") || !parameters.contains("limit")) {
                    wrong.add(name);
                }
            }
        });
        assertThat(wrong)
                .as("lists with a nextCursor but no cursor and limit to ask with")
                .isEmpty();
    }

    @Test
    void everythingThatCreatesTakesAClientIdSoSendingItTwiceMakesItOnce() {
        List<String> wrong = new ArrayList<>();
        operations().forEach((name, operation) -> {
            if (operation.path("responses").has("201")
                    && !schemaOf(operation.path("requestBody").path("content"))
                            .path("properties")
                            .has("clientId")
                    && !CREATES_WITHOUT_CLIENT_ID.containsKey(name)) {
                wrong.add(name);
            }
        });
        assertThat(wrong)
                .as("operations that answer 201 without a clientId (add one, or the reason it needs none)")
                .isEmpty();
    }

    /**
     * Who may see what, asked of every route that reads something by its id. Nora keeps a circle with a page
     * only she can see, a person without a phone and a guest pass. A stranger asks every GET route for each
     * of those ids, and so does Alex, who is in the circle but was shown none of the private things. Every
     * answer has to be "not found" (or "not yours"), never the thing.
     *
     * <p>A new GET route with an {id} is tried with every kind of id there is, so it is covered the day it
     * is added. A route whose {id} is of a new kind needs its id added to {@code ids} below.
     */
    @Test
    void nothingThatIsReadByItsIdIsThereForSomeoneOutside() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String stranger = person("Stranger");
        String circle = circle(nora, "family", "The Linds");
        join(nora, circle, alex);
        String child = addMember(nora, circle, "Mia", "child");
        String page = page(nora, circle, "Gift list", "me");
        String list = privateThing(nora, "/v1/checklists", circle, "Gift ideas");
        String folder = privateThing(nora, "/v1/folders", circle, "Nora's work");
        String pass = JsonPath.read(
                send(
                        HttpMethod.POST,
                        "/v1/circles/" + circle + "/guest-passes",
                        nora,
                        "{\"clientId\":\"%s\",\"guestName\":\"Ines\",\"endsAt\":\"%s\",\"thingIds\":[\"%s\"]}"
                                .formatted(id(), java.time.Instant.now().plusSeconds(3600), page),
                        201),
                "$.id");
        String code = JsonPath.<String>read(fetch("/v1/circles/" + circle, nora), "$.joinUrl")
                .replaceFirst(".*/", "");
        // A Vault item only Nora can see. (What is scrambled is made up here: the API never looks inside.)
        send(
                HttpMethod.PUT,
                "/v1/vault",
                nora,
                "{\"publicKey\":\"%s\",\"wrappedPrivateKey\":\"AAAA\",\"salt\":\"%s\",\"kdf\":{\"n\":32768,\"r\":8,\"p\":1}}"
                        .formatted("A".repeat(43), "A".repeat(22)),
                200);
        String vaultItem = JsonPath.read(
                send(
                        HttpMethod.POST,
                        "/v1/vault/items",
                        nora,
                        "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"title\":\"Bank\",\"category\":\"login\",\"ciphertext\":\"AAAA\",\"wrappedKey\":\"AAAA\"}"
                                .formatted(id(), circle),
                        201),
                "$.id");

        // The Library's kinds, each only Nora's: a photo, a document (a scan), a video and an album.
        String clipTarget = send(
                HttpMethod.POST, "/v1/media/uploads", nora, "{\"kind\":\"video\",\"contentType\":\"video/mp4\"}", 200);
        send(clipTarget, "video/mp4", "a clip".getBytes());
        String clip = JsonPath.read(clipTarget, "$.mediaId");
        send(HttpMethod.POST, "/v1/media/uploads/" + clip + "/complete", nora, null, 204);
        List<String> library = JsonPath.read(
                send(
                        HttpMethod.POST,
                        "/v1/library",
                        nora,
                        ("{\"circleId\":\"%s\",\"items\":[{\"clientId\":\"%s\",\"mediaId\":\"%s\"},"
                                        + "{\"clientId\":\"%s\",\"mediaId\":\"%s\",\"kind\":\"document\",\"text\":\"Words inside\"},"
                                        + "{\"clientId\":\"%s\",\"mediaId\":\"%s\"}]}")
                                .formatted(circle, id(), uploadPhoto(nora), id(), uploadPhoto(nora), id(), clip),
                        201),
                "$.items[*].item.id");
        assertThat(library).hasSize(3);
        String album = JsonPath.read(
                send(
                        HttpMethod.POST,
                        "/v1/albums",
                        nora,
                        "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"title\":\"Only hers\",\"itemIds\":[\"%s\"]}"
                                .formatted(id(), circle, library.get(0)),
                        201),
                "$.id");

        // Every id a stranger must learn nothing from, and the ones Alex must learn nothing from although he is in the
        // circle.
        // A board only Nora can see, with a sealed letter in it.
        String board = JsonPath.read(
                send(
                        HttpMethod.POST,
                        "/v1/boards",
                        nora,
                        "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"template\":\"time_capsule\",\"audience\":\"me\",\"settings\":{\"opensOn\":\"%s\"}}"
                                .formatted(
                                        id(), circle, java.time.LocalDate.now().plusYears(1)),
                        201),
                "$.id");
        List<String> forStranger =
                new ArrayList<>(List.of(circle, child, page, pass, album, list, folder, board, vaultItem));
        forStranger.addAll(library);
        List<String> forAlex = new ArrayList<>(List.of(page, album, list, folder, board, vaultItem));
        forAlex.addAll(library);
        List<String> gaveAway = new ArrayList<>();
        for (String name : operations().keySet()) {
            if (!name.startsWith("GET ") || !name.contains("{id}")) {
                continue;
            }
            String path = name.substring(4);
            for (String id : forStranger) {
                if (answers(path.replace("{id}", id), stranger)) {
                    gaveAway.add("a stranger: " + path + " with " + label(id, circle, child, page, pass, board));
                }
            }
            for (String id : forAlex) {
                if (answers(path.replace("{id}", id), alex)) {
                    gaveAway.add("someone in the circle it wasn't shared with: " + path);
                }
            }
        }
        assertThat(gaveAway)
                .as("routes that answered someone who may not see the thing")
                .isEmpty();

        // The one thing a stranger may ask about with nothing but a link: what circle the link is for.
        assertThat(fetch("/v1/join/" + code, stranger)).contains("The Linds").doesNotContain("Mia");
    }

    private static String label(String id, String circle, String child, String page, String pass, String board) {
        return id.equals(circle)
                ? "a circle's id"
                : id.equals(child)
                        ? "a member's id"
                        : id.equals(page)
                                ? "a page's id"
                                : id.equals(pass) ? "a guest pass's id" : "the id of a thing " + id;
    }

    /** Makes something only its maker can see, of the kind this route makes. Returns its id. */
    private String privateThing(String token, String route, String circle, String title) throws Exception {
        return JsonPath.read(
                send(
                        HttpMethod.POST,
                        route,
                        token,
                        "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"title\":\"%s\",\"audience\":\"me\"}"
                                .formatted(id(), circle, title),
                        201),
                "$.id");
    }

    /** True when the route answers with something: neither "not found" nor "forbidden". */
    private boolean answers(String path, String token) throws Exception {
        int status = mvc.perform(get(path).header("Authorization", token))
                .andReturn()
                .getResponse()
                .getStatus();
        return status != 404 && status != 403;
    }

    /** Every operation of the API, by "METHOD /path". */
    private static Map<String, JsonNode> operations() {
        Map<String, JsonNode> all = new TreeMap<>();
        API.path("paths")
                .properties()
                .forEach(path -> path.getValue()
                        .properties()
                        .forEach(method -> all.put(
                                method.getKey().toUpperCase(java.util.Locale.ROOT) + " " + path.getKey(),
                                method.getValue())));
        return all;
    }

    /** The schema behind a request or an answer, whatever content type it is listed under. */
    private static JsonNode schemaOf(JsonNode content) {
        for (Map.Entry<String, JsonNode> byType : content.properties()) {
            JsonNode ref = byType.getValue().path("schema").path("$ref");
            if (ref.isString()) {
                String name = ref.asString();
                return API.path("components").path("schemas").path(name.substring(name.lastIndexOf('/') + 1));
            }
        }
        return content.path("no schema");
    }
}

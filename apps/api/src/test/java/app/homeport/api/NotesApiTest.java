package app.homeport.api;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

import com.jayway.jsonpath.JsonPath;
import java.util.List;
import org.springframework.http.HttpMethod;
import org.springframework.test.web.servlet.MvcResult;

/** What the tests of Notes share: making spaces, folders, pages, lists and blocks the way the app does. */
abstract class NotesApiTest extends ApiTest {

    /** Makes a space (no parent) or a folder. With a null audience it starts as the circle's kind says. Returns its id. */
    protected String folder(String token, String circle, String parent, String title, String audience)
            throws Exception {
        return JsonPath.read(
                send(
                        HttpMethod.POST,
                        "/v1/folders",
                        token,
                        "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"title\":\"%s\"%s%s}"
                                .formatted(
                                        id(),
                                        circle,
                                        title,
                                        parent == null ? "" : ",\"parentId\":\"" + parent + "\"",
                                        audience == null ? "" : ",\"audience\":\"" + audience + "\""),
                        201),
                "$.id");
    }

    /** Writes a page into a folder. Returns its id. */
    protected String pageIn(String token, String circle, String folder, String title, String audience)
            throws Exception {
        return JsonPath.read(
                send(
                        HttpMethod.POST,
                        "/v1/pages",
                        token,
                        "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"folderId\":\"%s\",\"title\":\"%s\",\"body\":\"Words about %s\"%s}"
                                .formatted(
                                        id(),
                                        circle,
                                        folder,
                                        title,
                                        title,
                                        audience == null ? "" : ",\"audience\":\"" + audience + "\""),
                        201),
                "$.id");
    }

    /** Starts a list, in a folder or (with null) in none. Returns its id. */
    protected String list(String token, String circle, String folder, String title, String audience, String... items)
            throws Exception {
        return JsonPath.read(
                send(
                        HttpMethod.POST,
                        "/v1/checklists",
                        token,
                        "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"title\":\"%s\"%s%s,\"items\":[%s]}"
                                .formatted(
                                        id(),
                                        circle,
                                        title,
                                        folder == null ? "" : ",\"folderId\":\"" + folder + "\"",
                                        audience == null ? "" : ",\"audience\":\"" + audience + "\"",
                                        items.length == 0 ? "" : "\"" + String.join("\",\"", items) + "\""),
                        201),
                "$.id");
    }

    /** Adds a line to a list; {@code more} is further JSON fields, starting with a comma, or empty. Returns the line's id. */
    protected String line(String token, String list, String text, String more) throws Exception {
        return JsonPath.read(
                send(
                        HttpMethod.POST,
                        "/v1/checklists/" + list + "/items",
                        token,
                        "{\"clientId\":\"%s\",\"text\":\"%s\"%s}".formatted(id(), text, more),
                        201),
                "$.id");
    }

    /** Adds a block to a page; {@code fields} is its JSON without the clientId, such as {@code "kind":"heading","text":"Hello"}. Returns its id. */
    protected String block(String token, String page, String fields) throws Exception {
        return JsonPath.read(
                send(
                        HttpMethod.POST,
                        "/v1/pages/" + page + "/blocks",
                        token,
                        "{\"clientId\":\"%s\",%s}".formatted(id(), fields),
                        201),
                "$.id");
    }

    /** Shares a thing with some people by name: pairs of member id and "edit" or "view". */
    protected void shareWith(String token, String thing, String... memberAndAccess) throws Exception {
        StringBuilder people = new StringBuilder();
        for (int i = 0; i < memberAndAccess.length; i += 2) {
            people.append(i == 0 ? "" : ",")
                    .append("{\"memberId\":\"%s\",\"access\":\"%s\"}"
                            .formatted(memberAndAccess[i], memberAndAccess[i + 1]));
        }
        send(
                HttpMethod.PUT,
                "/v1/things/" + thing + "/audience",
                token,
                "{\"audience\":\"some\",\"people\":[" + people + "]}",
                200);
    }

    protected void audience(String token, String thing, String json) throws Exception {
        send(HttpMethod.PUT, "/v1/things/" + thing + "/audience", token, json, 200);
    }

    /** Puts a thing into a folder (or, with null, takes it out). */
    protected void file(String token, String thing, String folder) throws Exception {
        send(
                HttpMethod.PUT,
                "/v1/things/" + thing + "/folder",
                token,
                "{\"folderId\":%s}".formatted(folder == null ? "null" : "\"" + folder + "\""),
                200);
    }

    protected int status(String path, String token) throws Exception {
        return mvc.perform(get(path).header("Authorization", token))
                .andReturn()
                .getResponse()
                .getStatus();
    }

    /** Asks for something again, saying which version is already there. */
    protected MvcResult again(String path, String token, String version) throws Exception {
        return mvc.perform(get(path).header("Authorization", token).header("If-None-Match", "\"" + version + "\""))
                .andReturn();
    }

    protected List<String> titles(String json, String path) {
        return JsonPath.read(json, path);
    }

    /** The titles of what is in a folder, for this person, in order. */
    protected List<String> inFolder(String folder, String token) throws Exception {
        return JsonPath.read(fetch("/v1/folders/" + folder + "/items", token), "$.items[*].title");
    }
}

package app.homeport.api;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

import com.jayway.jsonpath.JsonPath;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.util.List;
import org.springframework.http.HttpMethod;

/** What the Library's tests share: sending files the way a phone does, and putting them into a circle's Library. */
abstract class LibraryApiTest extends ApiTest {

    private int pictures;

    /** A small JPEG that is different every time, so each has its own fingerprint. */
    protected byte[] picture() throws Exception {
        BufferedImage image = new BufferedImage(48, 36, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = image.createGraphics();
        pictures++;
        g.setColor(new Color((pictures * 67) % 256, (pictures * 131) % 256, (pictures * 29) % 256));
        g.fillRect(0, 0, 48, 36);
        g.setColor(Color.WHITE);
        g.fillRect(pictures % 40, pictures % 30, 6, 6);
        g.dispose();
        return jpeg(image);
    }

    /** Uploads a file the way the app does for the Library. Returns the media id. */
    protected String sendFile(String token, String kind, String contentType, byte[] bytes, String more)
            throws Exception {
        String target = send(
                HttpMethod.POST,
                "/v1/media/uploads",
                token,
                "{\"kind\":\"%s\",\"contentType\":\"%s\",\"keepOriginal\":true%s}".formatted(kind, contentType, more),
                200);
        send(target, contentType, bytes);
        String id = JsonPath.read(target, "$.mediaId");
        send(HttpMethod.POST, "/v1/media/uploads/" + id + "/complete", token, null, 204);
        return id;
    }

    /** Adds one upload to a circle's Library. {@code more} is further JSON fields, starting with a comma, or empty. Returns the answer for it. */
    protected String addOne(String token, String circle, String mediaId, String more) throws Exception {
        String answer = send(
                HttpMethod.POST,
                "/v1/library",
                token,
                "{\"circleId\":\"%s\",\"items\":[{\"clientId\":\"%s\",\"mediaId\":\"%s\"%s}]}"
                        .formatted(circle, id(), mediaId, more),
                201);
        return answer;
    }

    /** A new photo in a circle's Library, taken at this time on the clock where it was taken. Returns its id. */
    protected String photo(String token, String circle, String takenAt, String more) throws Exception {
        String media = sendFile(token, "photo", "image/jpeg", picture(), "");
        return JsonPath.read(
                addOne(token, circle, media, ",\"takenAt\":\"%s\"%s".formatted(takenAt, more)), "$.items[0].item.id");
    }

    /** A new video with a still. Returns its id. */
    protected String video(String token, String circle, String takenAt, String more) throws Exception {
        String clip = sendFile(
                token, "video", "video/mp4", ("not really a video " + id()).getBytes(), ",\"durationSeconds\":42");
        String still = sendFile(token, "photo", "image/jpeg", picture(), "");
        return JsonPath.read(
                addOne(
                        token,
                        circle,
                        clip,
                        ",\"takenAt\":\"%s\",\"posterMediaId\":\"%s\"%s".formatted(takenAt, still, more)),
                "$.items[0].item.id");
    }

    /** A new PDF with these words inside. Returns its id. */
    protected String document(String token, String circle, String name, String text, String more) throws Exception {
        String media = sendFile(
                token,
                "file",
                "application/pdf",
                ("%PDF " + name + id()).getBytes(),
                ",\"fileName\":\"%s.pdf\"".formatted(name));
        return JsonPath.read(
                addOne(
                        token,
                        circle,
                        media,
                        ",\"text\":%s%s"
                                .formatted(
                                        new tools.jackson.databind.json.JsonMapper().writeValueAsString(text), more)),
                "$.items[0].item.id");
    }

    protected String album(String token, String circle, String title, String more) throws Exception {
        return JsonPath.read(
                send(
                        HttpMethod.POST,
                        "/v1/albums",
                        token,
                        "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"title\":\"%s\"%s}"
                                .formatted(id(), circle, title, more),
                        201),
                "$.id");
    }

    protected void shareWith(String token, String thing, String json) throws Exception {
        send(HttpMethod.PUT, "/v1/things/" + thing + "/audience", token, json, 200);
    }

    protected int status(String path, String token) throws Exception {
        return mvc.perform(get(path).header("Authorization", token))
                .andReturn()
                .getResponse()
                .getStatus();
    }

    /** The ids on a page of the wall, in its order. */
    protected List<String> wall(String token, String circle, String query) throws Exception {
        return JsonPath.read(fetch("/v1/circles/" + circle + "/library" + query, token), "$.items[*].id");
    }

    protected static String list(String... ids) {
        return ids.length == 0 ? "[]" : "[\"" + String.join("\",\"", ids) + "\"]";
    }
}

package app.homeport.api;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

/** Base for API tests: the whole application, a real database, emptied before each test. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles({"local", "test"})
public abstract class ApiTest {

    @Autowired
    protected MockMvc mvc;

    @Autowired
    protected JdbcClient jdbc;

    @BeforeEach
    void emptyDatabase() {
        jdbc.sql(
                        "truncate table circles, media, profiles, local_users, job_runs, rate_limits, removed_files, deleted_accounts, apple_sign_ins, push_tickets cascade")
                .update();
    }

    /** Signs in with the test code and returns "Bearer <token>". */
    protected String signIn(String email) throws Exception {
        String body = mvc.perform(post("/local-auth/token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"%s\",\"code\":\"123456\"}".formatted(email)))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString();
        return "Bearer " + JsonPath.<String>read(body, "$.accessToken");
    }

    /** Signs in and creates a profile. Returns "Bearer <token>". */
    protected String person(String name) throws Exception {
        String token = signIn(name.toLowerCase() + "@example.com");
        mvc.perform(put("/v1/me/profile")
                        .header("Authorization", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"ageConfirmed\":true,\"displayName\":\"%s\"}".formatted(name)))
                .andExpect(status().isOk());
        return token;
    }

    /** Sends JSON as this person and returns the answer's body, expecting the given status. */
    protected String send(
            org.springframework.http.HttpMethod method, String path, String token, String json, int expected)
            throws Exception {
        var request = org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request(method, path)
                .header("Authorization", token);
        if (json != null) {
            request = request.contentType(MediaType.APPLICATION_JSON).content(json);
        }
        return mvc.perform(request)
                .andExpect(status().is(expected))
                .andReturn()
                .getResponse()
                .getContentAsString();
    }

    protected String fetch(String path, String token) throws Exception {
        return send(org.springframework.http.HttpMethod.GET, path, token, null, 200);
    }

    protected static String id() {
        return java.util.UUID.randomUUID().toString();
    }

    /** Starts a circle of this kind. Returns its id. */
    protected String circle(String token, String kind, String name) throws Exception {
        return JsonPath.read(
                send(
                        org.springframework.http.HttpMethod.POST,
                        "/v1/circles",
                        token,
                        "{\"clientId\":\"%s\",\"kind\":\"%s\",\"name\":\"%s\"}".formatted(id(), kind, name),
                        201),
                "$.id");
    }

    /** Lets another person into a circle through its join link. Returns their member id in it. */
    protected String join(String ownerToken, String circleId, String joinerToken) throws Exception {
        String url = JsonPath.read(fetch("/v1/circles/" + circleId, ownerToken), "$.joinUrl");
        String code = url.substring(url.lastIndexOf('/') + 1);
        return JsonPath.read(
                send(org.springframework.http.HttpMethod.PUT, "/v1/join/" + code, joinerToken, null, 200),
                "$.myMemberId");
    }

    /** Adds someone without a phone (a child or a pet). Returns their member id. */
    protected String addMember(String token, String circleId, String name, String kind) throws Exception {
        return JsonPath.read(
                send(
                        org.springframework.http.HttpMethod.POST,
                        "/v1/circles/" + circleId + "/members",
                        token,
                        "{\"clientId\":\"%s\",\"name\":\"%s\",\"kind\":\"%s\"}".formatted(id(), name, kind),
                        201),
                "$.id");
    }

    /** Writes a page. With a null audience it starts as the circle's kind says. Returns its id. */
    protected String page(String token, String circleId, String title, String audience) throws Exception {
        return JsonPath.read(
                send(
                        org.springframework.http.HttpMethod.POST,
                        "/v1/pages",
                        token,
                        "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"title\":\"%s\",\"body\":\"Words about %s\"%s}"
                                .formatted(
                                        id(),
                                        circleId,
                                        title,
                                        title,
                                        audience == null ? "" : ",\"audience\":\"" + audience + "\""),
                        201),
                "$.id");
    }

    /** Uploads a small photo the way the app does: ask for a target, send the bytes there, say it is done. Returns the media id. */
    protected String uploadPhoto(String token) throws Exception {
        return upload(
                token,
                "image/jpeg",
                jpeg(new java.awt.image.BufferedImage(8, 6, java.awt.image.BufferedImage.TYPE_INT_RGB)));
    }

    /** Uploads these bytes as a photo and says it is done, expecting that to work. Returns the media id. */
    protected String upload(String token, String contentType, byte[] bytes) throws Exception {
        String target = startPhoto(token, contentType);
        send(target, contentType, bytes);
        String id = JsonPath.read(target, "$.mediaId");
        mvc.perform(post("/v1/media/uploads/" + id + "/complete").header("Authorization", token))
                .andExpect(status().isNoContent());
        return id;
    }

    /** Asks for somewhere to send a photo. Returns the API's answer (mediaId, uploadUrl, …) as JSON. */
    protected String startPhoto(String token, String contentType) throws Exception {
        return mvc.perform(post("/v1/media/uploads")
                        .header("Authorization", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"kind\":\"photo\",\"contentType\":\"%s\"}".formatted(contentType)))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString();
    }

    /** Sends a file to where the API said to send it. */
    protected void send(String target, String contentType, byte[] bytes) throws Exception {
        mvc.perform(put(java.net.URI.create(JsonPath.<String>read(target, "$.uploadUrl")))
                        .contentType(MediaType.valueOf(contentType))
                        .content(bytes))
                .andExpect(status().isNoContent());
    }

    protected static byte[] jpeg(java.awt.image.BufferedImage image) throws java.io.IOException {
        java.io.ByteArrayOutputStream bytes = new java.io.ByteArrayOutputStream();
        javax.imageio.ImageIO.write(image, "jpg", bytes);
        return bytes.toByteArray();
    }
}

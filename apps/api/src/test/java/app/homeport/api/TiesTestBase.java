package app.homeport.api;

import app.homeport.api.notify.LoggingPushSender;
import app.homeport.api.notify.PushDelivery;
import app.homeport.api.notify.PushMessage;
import com.jayway.jsonpath.JsonPath;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;

/**
 * What the tests of Activity, notifications, the summary, export and leaving share: The Linds (Nora and
 * Alex with their own sign-ins and phones, Mia and Leo without), short ways to make one of each kind of
 * thing, and Activity and the pushes read back as plain sentences.
 */
public abstract class TiesTestBase extends ApiTest {

    protected static final String ZONE = "Europe/Ljubljana";
    private static final SecureRandom RANDOM = new SecureRandom();

    @Autowired
    protected PushDelivery delivery;

    @Autowired
    protected LoggingPushSender sent;

    protected String nora;
    protected String alex;
    protected String circle;
    protected String noraId;
    protected String alexId;
    protected String miaId;
    protected String leoId;

    @BeforeEach
    void nothingSentYet() {
        sent.clear();
    }

    /** Nora starts a family, Alex joins, Mia and Leo are added as children without a phone. Both adults have a phone. */
    protected void theLinds() throws Exception {
        nora = person("Nora");
        alex = person("Alex");
        circle = circle(nora, "family", "The Linds");
        noraId = JsonPath.read(fetch("/v1/circles/" + circle, nora), "$.myMemberId");
        alexId = join(nora, circle, alex);
        miaId = addMember(nora, circle, "Mia", "child");
        leoId = addMember(nora, circle, "Leo", "child");
        phone(nora, "nora");
        phone(alex, "alex");
        quiet();
    }

    /** Forgets what happened so far (who joined, what was pushed), so a test reads only what it does itself. */
    protected void quiet() {
        jdbc.sql("delete from activity").update();
        jdbc.sql("delete from pushes").update();
        sent.clear();
    }

    protected void phone(String token, String name) throws Exception {
        send(
                HttpMethod.PUT,
                "/v1/me/devices",
                token,
                "{\"token\":\"ExponentPushToken[%s]\",\"platform\":\"ios\",\"timeZone\":\"%s\"}".formatted(name, ZONE),
                204);
    }

    // ---------- making things ----------

    protected String make(String token, String route, String json) throws Exception {
        return JsonPath.read(send(HttpMethod.POST, route, token, json, 201), "$.id");
    }

    protected String checklist(String token, String title, String audience, String... lines) throws Exception {
        return make(
                token,
                "/v1/checklists",
                "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"title\":\"%s\",\"audience\":\"%s\",\"items\":[%s]}"
                        .formatted(
                                id(),
                                circle,
                                title,
                                audience,
                                lines.length == 0 ? "" : "\"" + String.join("\",\"", lines) + "\""));
    }

    protected String addLine(String token, String list, String text) throws Exception {
        return make(
                token,
                "/v1/checklists/" + list + "/items",
                "{\"clientId\":\"%s\",\"text\":\"%s\"}".formatted(id(), text));
    }

    protected void tick(String token, String line) throws Exception {
        send(HttpMethod.PATCH, "/v1/checklist-items/" + line, token, "{\"done\":true}", 200);
    }

    protected String bill(String token, String title, long cents, String dueOn, String more) throws Exception {
        return make(
                token,
                "/v1/bills",
                "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"title\":\"%s\",\"amountCents\":%d,\"dueOn\":\"%s\"%s}"
                        .formatted(id(), circle, title, cents, dueOn, more));
    }

    protected String event(String token, String title, String day, String time, String more) throws Exception {
        return make(
                token,
                "/v1/events",
                "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"title\":\"%s\",\"day\":\"%s\"%s,\"timeZone\":\"%s\"%s}"
                        .formatted(
                                id(),
                                circle,
                                title,
                                day,
                                time == null ? "" : ",\"time\":\"" + time + "\"",
                                ZONE,
                                more));
    }

    protected String reminder(String token, String title, String more) throws Exception {
        return make(
                token,
                "/v1/reminders",
                "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"title\":\"%s\",\"timeZone\":\"%s\"%s}"
                        .formatted(id(), circle, title, ZONE, more));
    }

    /** Adds photos to the Library as this person, with this audience. Returns their ids. */
    protected List<String> photos(String token, String audience, int howMany) throws Exception {
        List<String> items = new ArrayList<>();
        for (int n = 0; n < howMany; n++) {
            // Each a picture of its own: the same file twice is one photo.
            java.awt.image.BufferedImage image =
                    new java.awt.image.BufferedImage(8, 6, java.awt.image.BufferedImage.TYPE_INT_RGB);
            image.setRGB(n % 8, n % 6, RANDOM.nextInt(0xFFFFFF));
            image.setRGB((n + 3) % 8, (n + 1) % 6, RANDOM.nextInt(0xFFFFFF));
            items.add(
                    "{\"clientId\":\"%s\",\"mediaId\":\"%s\",\"audience\":\"%s\",\"takenAt\":\"2026-11-07T10:%02d:00+01:00\"}"
                            .formatted(id(), upload(token, "image/jpeg", jpeg(image)), audience, n % 60));
        }
        return JsonPath.read(
                send(
                        HttpMethod.POST,
                        "/v1/library",
                        token,
                        "{\"circleId\":\"%s\",\"items\":[%s]}".formatted(circle, String.join(",", items)),
                        201),
                "$.items[*].item.id");
    }

    protected void audience(String token, String thing, String json) throws Exception {
        send(HttpMethod.PUT, "/v1/things/" + thing + "/audience", token, json, 200);
    }

    // ---------- the Vault, with made-up keys ----------

    protected static String sealed(int bytes) {
        byte[] random = new byte[bytes];
        RANDOM.nextBytes(random);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(random);
    }

    protected void vault(String token) throws Exception {
        send(
                HttpMethod.PUT,
                "/v1/vault",
                token,
                "{\"publicKey\":\"%s\",\"wrappedPrivateKey\":\"%s\",\"salt\":\"%s\",\"kdf\":{\"n\":32768,\"r\":8,\"p\":1}}"
                        .formatted(sealed(32), sealed(73), sealed(16)),
                200);
    }

    protected String vaultItem(String token, String title) throws Exception {
        return make(
                token,
                "/v1/vault/items",
                "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"title\":\"%s\",\"category\":\"code\",\"ciphertext\":\"%s\",\"wrappedKey\":\"%s\"}"
                        .formatted(id(), circle, title, sealed(120), sealed(105)));
    }

    /** Shares a Vault item with one person from its owner's phone. {@code more} is extra fields, starting with a comma. */
    protected void vaultShare(String token, String item, String memberId, String more) throws Exception {
        send(
                HttpMethod.PUT,
                "/v1/vault/items/" + item + "/sharing",
                token,
                "{\"audience\":\"some\",\"people\":[{\"memberId\":\"%s\",\"access\":\"see\",\"wrappedKey\":\"%s\"%s}]}"
                        .formatted(memberId, sealed(105), more),
                200);
    }

    // ---------- reading back ----------

    protected String activity(String token, String query) throws Exception {
        return fetch("/v1/circles/" + circle + "/activity" + (query.isEmpty() ? "" : "?" + query), token);
    }

    /** The lines of an answer under {@code items} or {@code due}, each as its sentence, then " | " and its note when it has one. */
    protected static List<String> said(String answer, String part) {
        List<String> lines = new ArrayList<>();
        int count = JsonPath.<Integer>read(answer, "$." + part + ".length()");
        for (int n = 0; n < count; n++) {
            List<String> words = JsonPath.read(answer, "$." + part + "[" + n + "].sentence[*].text");
            String note = JsonPath.read(answer, "$." + part + "[" + n + "].note");
            lines.add(String.join("", words) + (note == null ? "" : " | " + note));
        }
        return lines;
    }

    protected List<String> lines(String token) throws Exception {
        return said(activity(token, ""), "items");
    }

    /** The same lines without their notes: for where the note is another place's words (a page's first line). */
    protected List<String> sentences(String token) throws Exception {
        return lines(token).stream()
                .map(line -> line.replaceFirst(" \\| .*", ""))
                .toList();
    }

    /** Sends what is waiting and returns every push that went out since the test began, as "phone: title | body". */
    protected List<String> pushed() {
        delivery.deliverDue();
        return sent.sent().stream()
                .map(p -> p.token().replaceAll(".*\\[|]", "") + ": " + p.title() + " | " + p.body())
                .toList();
    }

    protected List<PushMessage> messages() {
        delivery.deliverDue();
        return sent.sent();
    }
}

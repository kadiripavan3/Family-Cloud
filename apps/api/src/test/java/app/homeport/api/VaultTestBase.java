package app.homeport.api;

import com.jayway.jsonpath.JsonPath;
import java.security.SecureRandom;
import java.util.Base64;
import org.springframework.http.HttpMethod;

/**
 * What the Vault's tests share. Most of them send made-up scrambled text: the API never looks inside, so for
 * its rules any text of the right alphabet will do. {@link VaultProtocolTest} is the one that uses real keys.
 */
abstract class VaultTestBase extends ApiTest {

    private static final SecureRandom RANDOM = new SecureRandom();

    /** Unreadable text as a phone would send it: this many random bytes, as base64url. */
    protected static String sealed(int bytes) {
        byte[] random = new byte[bytes];
        RANDOM.nextBytes(random);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(random);
    }

    /** Sets up this person's Vault with made-up keys. Returns the public key. */
    protected String vault(String token) throws Exception {
        String publicKey = sealed(32);
        send(HttpMethod.PUT, "/v1/vault", token, vaultJson(publicKey), 200);
        return publicKey;
    }

    protected static String vaultJson(String publicKey) {
        return "{\"publicKey\":\"%s\",\"wrappedPrivateKey\":\"%s\",\"salt\":\"%s\",\"kdf\":{\"n\":32768,\"r\":8,\"p\":1}}"
                .formatted(publicKey, sealed(73), sealed(16));
    }

    /** Keeps a new item in this person's Vault. {@code more} is extra JSON fields, starting with a comma, or empty. */
    protected String item(String token, String circle, String title, String category, String more) throws Exception {
        return JsonPath.read(
                send(HttpMethod.POST, "/v1/vault/items", token, itemJson(circle, title, category, more), 201), "$.id");
    }

    protected String item(String token, String circle, String title, String category) throws Exception {
        return item(token, circle, title, category, "");
    }

    protected static String itemJson(String circle, String title, String category, String more) {
        return "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"title\":\"%s\",\"category\":\"%s\",\"ciphertext\":\"%s\",\"wrappedKey\":\"%s\"%s}"
                .formatted(id(), circle, title, category, sealed(120), sealed(105), more);
    }

    /** One person in a share request, with a wrapped key made for them. */
    protected static String with(String memberId, String access) {
        return "{\"memberId\":\"%s\",\"access\":\"%s\",\"wrappedKey\":\"%s\"}".formatted(memberId, access, sealed(105));
    }

    /** The same, with more fields (starting with a comma): once, stopsAt. */
    protected static String with(String memberId, String access, String more) {
        return "{\"memberId\":\"%s\",\"access\":\"%s\",\"wrappedKey\":\"%s\"%s}"
                .formatted(memberId, access, sealed(105), more);
    }

    /** One person in a share request who gets no key yet. */
    protected static String named(String memberId, String access) {
        return "{\"memberId\":\"%s\",\"access\":\"%s\"}".formatted(memberId, access);
    }

    /** Changes who an item is shared with, through the Vault's own route. Returns the answer. */
    protected String share(String token, String item, String audience, int expected, String... people)
            throws Exception {
        return send(
                HttpMethod.PUT,
                "/v1/vault/items/" + item + "/sharing",
                token,
                "{\"audience\":\"%s\",\"people\":[%s]}".formatted(audience, String.join(",", people)),
                expected);
    }

    protected String open(String token, String item, int expected) throws Exception {
        return send(HttpMethod.POST, "/v1/vault/items/" + item + "/open", token, null, expected);
    }

    protected int status(String path, String token) throws Exception {
        return mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get(path)
                        .header("Authorization", token))
                .andReturn()
                .getResponse()
                .getStatus();
    }

    /** The code of the problem an answer carries. */
    protected static String code(String problem) {
        return JsonPath.read(problem, "$.code");
    }
}

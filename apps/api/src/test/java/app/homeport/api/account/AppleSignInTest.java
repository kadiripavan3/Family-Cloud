package app.homeport.api.account;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.homeport.api.ApiTest;
import app.homeport.api.common.ApiProblem;
import com.nimbusds.jose.crypto.ECDSAVerifier;
import com.nimbusds.jwt.SignedJWT;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECGenParameterSpec;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

/**
 * "Continue with Apple" has an end as well as a beginning: deleting the account tells Apple. Tried against a
 * small stand-in for Apple that answers the way Apple does.
 */
class AppleSignInTest extends ApiTest {

    private record Call(String path, Map<String, String> form) {}

    private HttpServer apple;
    private final List<Call> calls = new ArrayList<>();
    private int status = 200;
    private String answer = "{\"access_token\":\"a\",\"refresh_token\":\"r-123\",\"id_token\":\"i\"}";
    private KeyPair key;

    @BeforeEach
    void start() throws Exception {
        KeyPairGenerator generator = KeyPairGenerator.getInstance("EC");
        generator.initialize(new ECGenParameterSpec("secp256r1"));
        key = generator.generateKeyPair();
        apple = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        apple.createContext("/", exchange -> {
            Map<String, String> form = new HashMap<>();
            for (String pair :
                    new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8).split("&")) {
                String[] parts = pair.split("=", 2);
                form.put(parts[0], parts.length > 1 ? URLDecoder.decode(parts[1], StandardCharsets.UTF_8) : "");
            }
            calls.add(new Call(exchange.getRequestURI().getPath(), form));
            byte[] body = (exchange.getRequestURI().getPath().endsWith("/token") ? answer : "")
                    .getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(status, body.length == 0 ? -1 : body.length);
            if (body.length > 0) {
                exchange.getResponseBody().write(body);
            }
            exchange.close();
        });
        apple.start();
    }

    @AfterEach
    void stop() {
        apple.stop(0);
    }

    private AppleIdSignIn signIn() {
        // The key the way it sits in a setting: the .p8 file's contents, line breaks written as \n.
        String p8 = "-----BEGIN PRIVATE KEY-----\\n"
                + Base64.getEncoder().encodeToString(key.getPrivate().getEncoded())
                + "\\n-----END PRIVATE KEY-----";
        return new AppleIdSignIn(
                jdbc,
                "http://127.0.0.1:" + apple.getAddress().getPort(),
                "TEAM123456",
                "KEY1234567",
                "app.homeport.dev",
                p8);
    }

    @Test
    void applesCodeIsExchangedAtSignInAndTheTokenIsRevokedWhenTheAccountGoes() throws Exception {
        UUID nora = UUID.randomUUID();
        AppleIdSignIn apple = signIn();

        apple.remember(nora, "one-time-code");

        Call exchange = calls.get(0);
        assertThat(exchange.path()).isEqualTo("/auth/token");
        assertThat(exchange.form())
                .containsEntry("grant_type", "authorization_code")
                .containsEntry("code", "one-time-code")
                .containsEntry("client_id", "app.homeport.dev");
        // Apple is shown who is asking with a short-lived note signed by the developer account's key.
        SignedJWT note = SignedJWT.parse(exchange.form().get("client_secret"));
        assertThat(note.verify(new ECDSAVerifier((ECPublicKey) key.getPublic())))
                .isTrue();
        assertThat(note.getHeader().getKeyID()).isEqualTo("KEY1234567");
        assertThat(note.getJWTClaimsSet().getIssuer()).isEqualTo("TEAM123456");
        assertThat(note.getJWTClaimsSet().getSubject()).isEqualTo("app.homeport.dev");
        assertThat(note.getJWTClaimsSet().getAudience()).hasSize(1);
        assertThat(note.getJWTClaimsSet().getExpirationTime()).isInTheFuture();
        assertThat(jdbc.sql("select refresh_token from apple_sign_ins where user_id = :id")
                        .param("id", nora)
                        .query(String.class)
                        .single())
                .isEqualTo("r-123");

        // Apple can't be reached when the account is deleted: nothing is forgotten, so it is tried again.
        status = 503;
        assertThatThrownBy(() -> apple.forget(nora)).isInstanceOf(RuntimeException.class);
        assertThat(count()).isEqualTo(1);

        status = 200;
        apple.forget(nora);
        Call revoke = calls.get(calls.size() - 1);
        assertThat(revoke.path()).isEqualTo("/auth/revoke");
        assertThat(revoke.form()).containsEntry("token", "r-123").containsEntry("token_type_hint", "refresh_token");
        assertThat(count()).isZero();
        // Someone who never signed in with Apple: nothing to tell, and Apple isn't called.
        int before = calls.size();
        apple.forget(UUID.randomUUID());
        assertThat(calls).hasSize(before);
    }

    @Test
    void aCodeAppleRefusesIsSaidPlainlyAndATokenAppleNoLongerKnowsIsSimplyDropped() {
        UUID nora = UUID.randomUUID();
        AppleIdSignIn apple = signIn();
        status = 400;
        answer = "{\"error\":\"invalid_grant\"}";
        assertThatThrownBy(() -> apple.remember(nora, "used-code"))
                .isInstanceOf(ApiProblem.class)
                .hasMessage("Apple didn't accept that sign-in. Sign in again.");
        assertThat(count()).isZero();

        jdbc.sql("insert into apple_sign_ins (user_id, refresh_token) values (:id, 'old')")
                .param("id", nora)
                .update();
        apple.forget(nora); // Apple answers 400: it doesn't know the token any more
        assertThat(count()).isZero();
    }

    @Test
    void withoutAppleConnectedTheAppMayStillHandOverTheCodeAlsoBeforeThereIsAProfile() throws Exception {
        String half = signIn("half@example.com");
        mvc.perform(put("/v1/me/apple-sign-in")
                        .header("Authorization", half)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"authorizationCode\":\"one-time-code\"}"))
                .andExpect(status().isNoContent());
        mvc.perform(put("/v1/me/apple-sign-in")
                        .header("Authorization", half)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fields.authorizationCode").value("Apple's code is missing."));
        assertThat(count()).isZero();
        assertThat(calls).isEmpty();
    }

    @Test
    void aKeyThatIsNotAKeyStopsTheApiFromStartingWithASentence() {
        assertThatThrownBy(() -> new AppleIdSignIn(jdbc, "https://appleid.apple.com", "T", "K", "app", "not a key"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("paste the whole contents of the .p8 file");
        assertThatThrownBy(() -> new AppleIdSignIn(jdbc, "https://appleid.apple.com", "", "K", "app", "x"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("APPLE_TEAM_ID");
    }

    private int count() {
        return jdbc.sql("select count(*) from apple_sign_ins")
                .query(Integer.class)
                .single();
    }
}

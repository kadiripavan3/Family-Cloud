package app.homeport.api.account;

import app.homeport.api.common.ApiProblem;
import app.homeport.api.common.Http;
import com.nimbusds.jose.JOSEException;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.ECDSASigner;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import java.security.KeyFactory;
import java.security.interfaces.ECPrivateKey;
import java.security.spec.PKCS8EncodedKeySpec;
import java.time.Instant;
import java.util.Base64;
import java.util.Date;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClient;

/**
 * Talks to Apple ({@code journey.apple.mode=apple}). At sign-in the app hands over Apple's one-time code,
 * which is exchanged for a token that can later be revoked; when the account is deleted, that token is
 * revoked. Apple wants each call signed with a key from the Apple Developer account: the team's id, the
 * key's id, the key itself (the contents of the .p8 file) and the app's identifier.
 */
@Component
@ConditionalOnProperty(name = "homeport.apple.mode", havingValue = "apple")
class AppleIdSignIn implements AppleSignIn {

    private static final ParameterizedTypeReference<Map<String, Object>> JSON = new ParameterizedTypeReference<>() {};

    private final JdbcClient jdbc;
    private final RestClient apple;
    private final String audience;
    private final String teamId;
    private final String keyId;
    private final String clientId;
    private final ECPrivateKey key;

    AppleIdSignIn(
            JdbcClient jdbc,
            @Value("${homeport.apple.url:https://appleid.apple.com}") String url,
            @Value("${homeport.apple.team-id:}") String teamId,
            @Value("${homeport.apple.key-id:}") String keyId,
            @Value("${homeport.apple.client-id:}") String clientId,
            @Value("${homeport.apple.private-key:}") String privateKey) {
        if (teamId.isBlank() || keyId.isBlank() || clientId.isBlank() || privateKey.isBlank()) {
            throw new IllegalStateException(
                    "homeport.apple.mode=apple needs APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_CLIENT_ID and APPLE_PRIVATE_KEY"
                            + " (see docs/08-connect-services.md, step 5).");
        }
        this.jdbc = jdbc;
        this.audience = url.replaceAll("/+$", "");
        this.apple = Http.client().baseUrl(audience).build();
        this.teamId = teamId.trim();
        this.keyId = keyId.trim();
        this.clientId = clientId.trim();
        this.key = read(privateKey);
    }

    @Override
    public void remember(UUID userId, String authorizationCode) {
        MultiValueMap<String, String> form = signedForm();
        form.add("grant_type", "authorization_code");
        form.add("code", authorizationCode);
        Map<String, Object> answer;
        try {
            answer = apple.post()
                    .uri("/auth/token")
                    .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                    .body(form)
                    .retrieve()
                    .body(JSON);
        } catch (HttpClientErrorException refused) {
            throw ApiProblem.badRequest("apple_code_refused", "Apple didn't accept that sign-in. Sign in again.");
        }
        if (answer == null || !(answer.get("refresh_token") instanceof String token)) {
            return; // Apple gave nothing to revoke later; there is nothing to keep
        }
        jdbc.sql("""
            insert into apple_sign_ins (user_id, refresh_token) values (:user, :token)
            on conflict (user_id) do update set refresh_token = excluded.refresh_token, created_at = now()
            """).param("user", userId).param("token", token).update();
    }

    @Override
    public void forget(UUID userId) {
        Optional<String> token = jdbc.sql("select refresh_token from apple_sign_ins where user_id = :user")
                .param("user", userId)
                .query(String.class)
                .optional();
        if (token.isEmpty()) {
            return;
        }
        MultiValueMap<String, String> form = signedForm();
        form.add("token", token.get());
        form.add("token_type_hint", "refresh_token");
        try {
            apple.post()
                    .uri("/auth/revoke")
                    .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                    .body(form)
                    .retrieve()
                    .toBodilessEntity();
        } catch (HttpClientErrorException.BadRequest alreadyGone) {
            // Apple no longer knows the token: the link is gone, which is what was wanted.
        }
        jdbc.sql("delete from apple_sign_ins where user_id = :user")
                .param("user", userId)
                .update();
    }

    /** Every call names the app and proves it with a short-lived note signed by the developer account's key. */
    private MultiValueMap<String, String> signedForm() {
        Instant now = Instant.now();
        SignedJWT note = new SignedJWT(
                new JWSHeader.Builder(JWSAlgorithm.ES256).keyID(keyId).build(),
                new JWTClaimsSet.Builder()
                        .issuer(teamId)
                        .subject(clientId)
                        .audience(audience)
                        .issueTime(Date.from(now))
                        .expirationTime(Date.from(now.plusSeconds(300)))
                        .build());
        try {
            note.sign(new ECDSASigner(key));
        } catch (JOSEException e) {
            throw new IllegalStateException("The Apple key couldn't sign", e);
        }
        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("client_id", clientId);
        form.add("client_secret", note.serialize());
        return form;
    }

    /** The .p8 file's contents, with or without its BEGIN and END lines, and with line breaks written as "\n" or real ones. */
    private static ECPrivateKey read(String pem) {
        String body =
                pem.replace("\\n", "\n").replaceAll("-----[A-Z ]+-----", "").replaceAll("\\s", "");
        try {
            return (ECPrivateKey) KeyFactory.getInstance("EC")
                    .generatePrivate(new PKCS8EncodedKeySpec(Base64.getDecoder().decode(body)));
        } catch (Exception e) {
            throw new IllegalStateException(
                    "APPLE_PRIVATE_KEY isn't a key Apple gives out: paste the whole contents of the .p8 file.", e);
        }
    }
}

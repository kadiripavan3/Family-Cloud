package app.homeport.api.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.ECDSASigner;
import com.nimbusds.jose.crypto.MACSigner;
import com.nimbusds.jose.jwk.Curve;
import com.nimbusds.jose.jwk.ECKey;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.gen.ECKeyGenerator;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import java.util.UUID;
import java.util.function.Consumer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtException;

/** Tokens from Supabase Auth are checked against the project's public keys, and only a signed-in person's token passes. */
class SupabaseTokensTest {

    private HttpServer project;
    private String url;
    private ECKey key;

    @BeforeEach
    void startAProjectThatPublishesItsKeys() throws Exception {
        key = new ECKeyGenerator(Curve.P_256).keyID("key-1").generate();
        byte[] published = new JWKSet(key.toPublicJWK()).toString().getBytes(StandardCharsets.UTF_8);
        project = HttpServer.create(new InetSocketAddress("localhost", 0), 0);
        project.createContext("/auth/v1/.well-known/jwks.json", exchange -> {
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, published.length);
            exchange.getResponseBody().write(published);
            exchange.close();
        });
        project.start();
        url = "http://localhost:" + project.getAddress().getPort();
    }

    @AfterEach
    void stop() {
        project.stop(0);
    }

    @Test
    void aSignedInPersonsTokenPassesAndSaysWhoTheyAre() throws Exception {
        UUID person = UUID.randomUUID();
        Jwt token = decoder().decode(signed(key, claims -> claims.subject(person.toString())));
        assertThat(CurrentUser.from(token)).isEqualTo(new CurrentUser(person, "maya@example.com"));
    }

    @Test
    void anythingElseIsRefused() throws Exception {
        JwtDecoder decoder = decoder();
        ECKey stranger = new ECKeyGenerator(Curve.P_256).keyID("key-1").generate();
        assertThatThrownBy(() -> decoder.decode(signed(stranger, claims -> {})))
                .as("signed by someone else")
                .isInstanceOf(JwtException.class);
        assertThatThrownBy(() -> decoder.decode(signed(
                        key,
                        claims -> claims.expirationTime(Date.from(Instant.now().minusSeconds(300))))))
                .as("run out")
                .isInstanceOf(JwtException.class);
        assertThatThrownBy(
                        () -> decoder.decode(signed(key, claims -> claims.issuer("https://elsewhere.example/auth/v1"))))
                .as("from another project")
                .isInstanceOf(JwtException.class);
        assertThatThrownBy(() -> decoder.decode(signed(key, claims -> claims.audience("anon"))))
                .as("not for signed-in people")
                .isInstanceOf(JwtException.class);
        assertThatThrownBy(() -> decoder.decode(signed(
                        key, claims -> claims.claim("role", "service_role").subject(null))))
                .as("the project's own key, not a person")
                .isInstanceOf(JwtException.class);
        assertThatThrownBy(() -> decoder.decode(signed(key, claims -> claims.claim("is_anonymous", true))))
                .as("an anonymous visitor")
                .isInstanceOf(JwtException.class);
        assertThatThrownBy(() -> decoder.decode(signed(key, claims -> claims.subject("not-an-id"))))
                .as("a subject that isn't a person's id")
                .isInstanceOf(JwtException.class);
    }

    @Test
    void anOlderProjectWithASharedSecretWorksToo() throws Exception {
        String secret = "an-older-projects-shared-secret-0123456789";
        JwtDecoder decoder = SupabaseTokens.decoder(new AuthProperties.Supabase(url, secret, "service"));
        SignedJWT token = new SignedJWT(new JWSHeader(JWSAlgorithm.HS256), claims(c -> {}));
        token.sign(new MACSigner(secret.getBytes(StandardCharsets.UTF_8)));
        assertThat(decoder.decode(token.serialize()).getClaimAsString("email")).isEqualTo("maya@example.com");
        // A token signed with the published key is no good to a project that uses a secret.
        assertThatThrownBy(() -> decoder.decode(signed(key, c -> {}))).isInstanceOf(JwtException.class);
    }

    @Test
    void aMissingProjectAddressIsSaidPlainly() {
        assertThatThrownBy(() -> SupabaseTokens.decoder(new AuthProperties.Supabase("", null, null)))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("SUPABASE_URL");
    }

    private JwtDecoder decoder() {
        return SupabaseTokens.decoder(new AuthProperties.Supabase(url + "/", null, "service"));
    }

    private JWTClaimsSet claims(Consumer<JWTClaimsSet.Builder> change) {
        JWTClaimsSet.Builder claims = new JWTClaimsSet.Builder()
                .issuer(url + "/auth/v1")
                .subject(UUID.randomUUID().toString())
                .audience("authenticated")
                .claim("role", "authenticated")
                .claim("email", "maya@example.com")
                .issueTime(new Date())
                .expirationTime(Date.from(Instant.now().plusSeconds(3600)));
        change.accept(claims);
        return claims.build();
    }

    private String signed(ECKey with, Consumer<JWTClaimsSet.Builder> change) throws Exception {
        SignedJWT token = new SignedJWT(
                new JWSHeader.Builder(JWSAlgorithm.ES256).keyID(with.getKeyID()).build(), claims(change));
        token.sign(new ECDSASigner(with));
        return token.serialize();
    }
}

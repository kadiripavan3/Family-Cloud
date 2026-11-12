package app.homeport.api.auth;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jose.jws.SignatureAlgorithm;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;

/**
 * Checks sign-in tokens issued by Supabase Auth. The API never sees a password or a code: the app signs in
 * with Supabase and sends the token it got; here the token's signature is checked against the project's
 * public keys (fetched from the project the first time a token arrives, then remembered), together with who
 * issued it, who it is for, that it hasn't run out, and that it belongs to a real, signed-in person.
 */
final class SupabaseTokens {

    private SupabaseTokens() {}

    static JwtDecoder decoder(AuthProperties.Supabase supabase) {
        if (supabase == null || supabase.url() == null || supabase.url().isBlank()) {
            throw new IllegalStateException(
                    "homeport.auth.mode is 'supabase' but the project's address is missing. Set SUPABASE_URL (see docs/09-connect-services.md, step 1).");
        }
        String issuer = supabase.url().trim().replaceAll("/+$", "") + "/auth/v1";
        NimbusJwtDecoder decoder;
        if (supabase.jwtSecret() != null && !supabase.jwtSecret().isBlank()) {
            decoder = NimbusJwtDecoder.withSecretKey(
                            new SecretKeySpec(supabase.jwtSecret().getBytes(StandardCharsets.UTF_8), "HmacSHA256"))
                    .macAlgorithm(MacAlgorithm.HS256)
                    .build();
        } else {
            decoder = NimbusJwtDecoder.withJwkSetUri(issuer + "/.well-known/jwks.json")
                    .jwsAlgorithms(algorithms -> {
                        algorithms.add(SignatureAlgorithm.ES256);
                        algorithms.add(SignatureAlgorithm.RS256);
                    })
                    .build();
        }
        decoder.setJwtValidator(new DelegatingOAuth2TokenValidator<>(
                JwtValidators.createDefaultWithIssuer(issuer), SupabaseTokens::aSignedInPerson));
        return decoder;
    }

    /**
     * Supabase also issues tokens that are not a person who signed in: for the project's own keys (no subject),
     * and for anonymous visitors if that were ever switched on. Neither may use the API.
     */
    private static OAuth2TokenValidatorResult aSignedInPerson(Jwt token) {
        List<String> audience = token.getAudience();
        boolean forUs = audience != null && audience.contains(SecurityConfig.AUDIENCE);
        boolean person = "authenticated".equals(token.getClaimAsString("role"))
                && !Boolean.TRUE.equals(token.getClaimAsBoolean("is_anonymous"))
                && isUuid(token.getSubject());
        return forUs && person ? OAuth2TokenValidatorResult.success() : NOT_A_PERSON;
    }

    private static final OAuth2TokenValidatorResult NOT_A_PERSON = OAuth2TokenValidatorResult.failure(
            new OAuth2Error("invalid_token", "Not a signed-in person's token.", null));

    private static boolean isUuid(String value) {
        try {
            UUID.fromString(value);
            return true;
        } catch (RuntimeException e) {
            return false;
        }
    }
}

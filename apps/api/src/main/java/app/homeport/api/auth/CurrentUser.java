package app.homeport.api.auth;

import java.time.Instant;
import java.util.UUID;
import org.springframework.security.oauth2.jwt.Jwt;

/**
 * The signed-in person, read from their token: who they are, and when this sign-in was made. The id is the
 * same in local and Supabase sign-in.
 */
public record CurrentUser(UUID id, String email, Instant signedInAt) {

    public static CurrentUser from(Jwt jwt) {
        return new CurrentUser(UUID.fromString(jwt.getSubject()), jwt.getClaimAsString("email"), jwt.getIssuedAt());
    }
}

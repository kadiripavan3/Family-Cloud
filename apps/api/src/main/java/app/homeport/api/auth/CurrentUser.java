package app.homeport.api.auth;

import java.util.UUID;
import org.springframework.security.oauth2.jwt.Jwt;

/** The signed-in person, read from their token. The id is the same in local and Supabase sign-in. */
public record CurrentUser(UUID id, String email) {

    public static CurrentUser from(Jwt jwt) {
        return new CurrentUser(UUID.fromString(jwt.getSubject()), jwt.getClaimAsString("email"));
    }
}

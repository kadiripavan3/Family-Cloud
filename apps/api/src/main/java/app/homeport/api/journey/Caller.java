package app.homeport.api.journey;

import java.util.Optional;
import java.util.UUID;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

/**
 * The person Journey is asked as: who they are, and the sign-in they came with. Journey's API trusts the same
 * sign-in as this one, so their own token is handed on and Journey answers as it would answer them. The
 * token is held only while their request (or the work it started) runs; it is never written down.
 *
 * @param token the person's bearer token as it arrived; null where there is none to pass (the stand-in
 *     needs none, and the real Journey answers nobody without one)
 */
public record Caller(UUID userId, String token) {

    /** The person behind the request being answered right now; empty outside a request (a nightly job). */
    public static Optional<Caller> current() {
        Authentication who = SecurityContextHolder.getContext().getAuthentication();
        return who instanceof JwtAuthenticationToken token
                ? Optional.of(new Caller(
                        UUID.fromString(token.getToken().getSubject()),
                        token.getToken().getTokenValue()))
                : Optional.empty();
    }

    /** The person behind this request, who must be the one the controller was handed. */
    public static Caller of(UUID me) {
        return current().filter(caller -> caller.userId().equals(me)).orElseGet(() -> new Caller(me, null));
    }

    @Override
    public String toString() {
        // A token must never end up in a log line.
        return "Caller[" + userId + "]";
    }
}

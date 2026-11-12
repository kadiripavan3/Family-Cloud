package app.homeport.api.auth;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * How people sign in.
 *
 * <ul>
 *   <li>{@code local}: the API hands out its own tokens for any email and a fixed test code. For
 *       building and testing without outside accounts. Never for production.
 *   <li>{@code supabase}: tokens come from Supabase Auth. The API only checks them.
 * </ul>
 */
@ConfigurationProperties("homeport.auth")
public record AuthProperties(String mode, Local local, Supabase supabase) {

    public record Local(String secret, String code, Duration tokenTtl) {}

    /**
     * @param url the project's address, such as {@code https://abcd.supabase.co}
     * @param jwtSecret only for an older project that still signs tokens with a shared secret; leave empty
     *     otherwise and the project's public keys are used
     * @param serviceKey the project's secret key, used for one thing: removing the sign-in when an account is deleted
     */
    public record Supabase(String url, String jwtSecret, String serviceKey) {}

    public boolean isLocal() {
        return "local".equals(mode);
    }

    public boolean isSupabase() {
        return "supabase".equals(mode);
    }
}

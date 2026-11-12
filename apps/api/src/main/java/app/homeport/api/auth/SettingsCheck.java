package app.homeport.api.auth;

import java.util.ArrayList;
import java.util.List;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;

/**
 * Where real people use the API, every service that is switched on needs its keys, and a few settings must
 * make sense. Rather than failing somewhere deep inside on the first thing that is missing, the API looks at
 * all of them when it starts and says, in one list, what to set. (On a developer's computer, with the
 * {@code local} profile, nothing here applies.)
 *
 * <p>Each line names the step of {@code docs/09-connect-services.md} it belongs to: 1 Supabase, 2 storage,
 * 3 Fly.io, 5 Apple, 7 email, 9 the link with Journey. Push notifications (step 6) need nothing here: the one
 * key they can take, {@code EXPO_ACCESS_TOKEN}, is only for an Expo project with enhanced push security.
 */
final class SettingsCheck {

    /** The page that says where each value comes from. */
    static final String PAGE = "docs/09-connect-services.md";

    private SettingsCheck() {}

    static void check(Environment env) {
        if (env.acceptsProfiles(Profiles.of("local", "test"))) {
            return;
        }
        List<String> missing = new ArrayList<>();
        if ("supabase".equals(env.getProperty("homeport.auth.mode"))) {
            need(env, missing, "homeport.auth.supabase.url", "SUPABASE_URL", "sign-in (step 1)");
            need(env, missing, "homeport.auth.supabase.service-key", "SUPABASE_SERVICE_KEY", "sign-in (step 1)");
        }
        if ("r2".equals(env.getProperty("homeport.media.mode"))) {
            String storage = "photos and files (step 2)";
            need(env, missing, "homeport.media.r2.endpoint", "R2_ENDPOINT", storage);
            need(env, missing, "homeport.media.r2.bucket", "R2_BUCKET", storage);
            need(env, missing, "homeport.media.r2.access-key-id", "R2_ACCESS_KEY_ID", storage);
            need(env, missing, "homeport.media.r2.secret-access-key", "R2_SECRET_ACCESS_KEY", storage);
            need(env, missing, "homeport.media.r2.public-url", "R2_PUBLIC_URL", storage);
        }
        if ("apple".equals(env.getProperty("homeport.apple.mode"))) {
            String or = "\"Continue with Apple\" (step 5), or HOMEPORT_APPLE_MODE=off";
            need(env, missing, "homeport.apple.team-id", "APPLE_TEAM_ID", or);
            need(env, missing, "homeport.apple.key-id", "APPLE_KEY_ID", or);
            need(env, missing, "homeport.apple.client-id", "APPLE_CLIENT_ID", or);
            need(env, missing, "homeport.apple.private-key", "APPLE_PRIVATE_KEY", or);
        }
        if ("resend".equals(env.getProperty("homeport.email.mode"))) {
            String or = "email (step 7), or HOMEPORT_EMAIL_MODE=off";
            need(env, missing, "homeport.email.resend.api-key", "RESEND_API_KEY", or);
            if (env.getProperty("homeport.email.from", "").contains("example.com")) {
                missing.add("HOMEPORT_EMAIL_FROM: an address on your own domain, such as"
                        + " \"Homeport <hello@yourdomain.com>\" (" + or + ")");
            }
        }
        if ("http".equals(env.getProperty("homeport.journey.mode"))) {
            need(
                    env,
                    missing,
                    "homeport.journey.http.url",
                    "JOURNEY_API_URL",
                    "the link with Journey (step 9), or HOMEPORT_JOURNEY_MODE=off");
        }
        String address = env.getProperty("homeport.public-url", "").trim();
        if (!address.startsWith("https://")) {
            missing.add("HOMEPORT_PUBLIC_URL: the https address people reach the API at (step 3). Links in emails and"
                    + " on shared pages are built from it.");
        }
        if (!missing.isEmpty()) {
            throw new IllegalStateException("The API can't start yet. Set these (" + PAGE + " says where each value"
                    + " comes from):\n  - " + String.join("\n  - ", missing));
        }
    }

    private static void need(Environment env, List<String> missing, String setting, String name, String forWhat) {
        if (env.getProperty(setting, "").isBlank()) {
            missing.add(name + ": for " + forWhat);
        }
    }
}

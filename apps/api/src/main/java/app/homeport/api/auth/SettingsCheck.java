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
 */
final class SettingsCheck {

    /** A reviewers' password shorter than this could be guessed by trying. */
    static final int SHORTEST_ADMIN_PASSWORD = 20;

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
            need(env, missing, "homeport.media.r2.endpoint", "R2_ENDPOINT", "photos (step 2)");
            need(env, missing, "homeport.media.r2.bucket", "R2_BUCKET", "photos (step 2)");
            need(env, missing, "homeport.media.r2.access-key-id", "R2_ACCESS_KEY_ID", "photos (step 2)");
            need(env, missing, "homeport.media.r2.secret-access-key", "R2_SECRET_ACCESS_KEY", "photos (step 2)");
            need(env, missing, "homeport.media.r2.public-url", "R2_PUBLIC_URL", "photos (step 2)");
        }
        if ("mux".equals(env.getProperty("homeport.video.mode"))) {
            String or = "clips (step 6), or HOMEPORT_VIDEO_MODE=off";
            need(env, missing, "homeport.video.mux.token-id", "MUX_TOKEN_ID", or);
            need(env, missing, "homeport.video.mux.token-secret", "MUX_TOKEN_SECRET", or);
            need(env, missing, "homeport.video.mux.webhook-secret", "MUX_WEBHOOK_SECRET", or);
        }
        if ("resend".equals(env.getProperty("homeport.email.mode"))) {
            String or = "email (step 8), or HOMEPORT_EMAIL_MODE=off";
            need(env, missing, "homeport.email.resend.api-key", "RESEND_API_KEY", or);
            if (env.getProperty("homeport.email.from", "").contains("example.com")) {
                missing.add(
                        "HOMEPORT_EMAIL_FROM: an address on your own domain, such as \"Journey <hello@yourdomain.com>\" ("
                                + or + ")");
            }
        }
        if ("rekognition".equals(env.getProperty("homeport.moderation.mode"))) {
            String or = "the photo check (step 9), or HOMEPORT_MODERATION_MODE=off";
            need(env, missing, "homeport.moderation.rekognition.access-key-id", "AWS_ACCESS_KEY_ID", or);
            need(env, missing, "homeport.moderation.rekognition.secret-access-key", "AWS_SECRET_ACCESS_KEY", or);
        }
        if ("apple".equals(env.getProperty("homeport.apple.mode"))) {
            String or = "\"Continue with Apple\" (step 5), or HOMEPORT_APPLE_MODE=off";
            need(env, missing, "homeport.apple.team-id", "APPLE_TEAM_ID", or);
            need(env, missing, "homeport.apple.key-id", "APPLE_KEY_ID", or);
            need(env, missing, "homeport.apple.client-id", "APPLE_CLIENT_ID", or);
            need(env, missing, "homeport.apple.private-key", "APPLE_PRIVATE_KEY", or);
        }
        String address = env.getProperty("homeport.public-url", "").trim();
        if (!address.startsWith("https://")) {
            missing.add("HOMEPORT_PUBLIC_URL: the https address people reach the API at (step 3). Links in emails and"
                    + " on shared pages are built from it.");
        }
        String password = env.getProperty("homeport.admin.password", "");
        if (!password.isBlank() && password.length() < SHORTEST_ADMIN_PASSWORD) {
            missing.add("HOMEPORT_ADMIN_PASSWORD: at least " + SHORTEST_ADMIN_PASSWORD
                    + " characters (step 10). A short one could be guessed.");
        }
        if (!missing.isEmpty()) {
            throw new IllegalStateException("The API can't start yet. Set these (docs/08-connect-services.md says where"
                    + " each value comes from):\n  - " + String.join("\n  - ", missing));
        }
    }

    private static void need(Environment env, List<String> missing, String setting, String name, String forWhat) {
        if (env.getProperty(setting, "").isBlank()) {
            missing.add(name + ": for " + forWhat);
        }
    }
}

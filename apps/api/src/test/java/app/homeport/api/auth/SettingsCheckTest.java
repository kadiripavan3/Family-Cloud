package app.homeport.api.auth;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

/** Where real people use the API, everything that is switched on has what it needs, or the API says what is missing. */
class SettingsCheckTest {

    /** The first deploy the runbook describes: sign-in and photos connected, everything else switched off. */
    private static MockEnvironment firstDeploy() {
        return new MockEnvironment()
                .withProperty("homeport.auth.mode", "supabase")
                .withProperty("homeport.auth.supabase.url", "https://project.supabase.co")
                .withProperty("homeport.auth.supabase.service-key", "service-key")
                .withProperty("homeport.media.mode", "r2")
                .withProperty("homeport.media.r2.endpoint", "https://account.r2.cloudflarestorage.com")
                .withProperty("homeport.media.r2.bucket", "journey-media")
                .withProperty("homeport.media.r2.access-key-id", "id")
                .withProperty("homeport.media.r2.secret-access-key", "secret")
                .withProperty("homeport.media.r2.public-url", "https://media.example.org")
                .withProperty("homeport.video.mode", "off")
                .withProperty("homeport.push.mode", "off")
                .withProperty("homeport.email.mode", "off")
                .withProperty("homeport.moderation.mode", "off")
                .withProperty("homeport.public-url", "https://homeport-api.fly.dev");
    }

    @Test
    void theFirstDeployStartsWithSignInAndPhotosAndTheRestSwitchedOff() {
        assertThatCode(() -> SettingsCheck.check(firstDeploy())).doesNotThrowAnyException();
    }

    @Test
    void everythingThatIsMissingIsNamedInOneList() {
        MockEnvironment nothingSet = new MockEnvironment()
                .withProperty("homeport.auth.mode", "supabase")
                .withProperty("homeport.media.mode", "r2")
                .withProperty("homeport.video.mode", "mux")
                .withProperty("homeport.email.mode", "resend")
                .withProperty("homeport.email.from", "Journey <hello@example.com>")
                .withProperty("homeport.moderation.mode", "rekognition")
                .withProperty("homeport.admin.password", "review");
        assertThatThrownBy(() -> SettingsCheck.check(nothingSet))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("SUPABASE_URL")
                .hasMessageContaining("SUPABASE_SERVICE_KEY")
                .hasMessageContaining("R2_ENDPOINT")
                .hasMessageContaining("R2_PUBLIC_URL")
                .hasMessageContaining("MUX_TOKEN_ID")
                .hasMessageContaining("MUX_WEBHOOK_SECRET")
                .hasMessageContaining("HOMEPORT_VIDEO_MODE=off")
                .hasMessageContaining("RESEND_API_KEY")
                .hasMessageContaining("HOMEPORT_EMAIL_FROM")
                .hasMessageContaining("AWS_ACCESS_KEY_ID")
                .hasMessageContaining("HOMEPORT_MODERATION_MODE=off")
                .hasMessageContaining("HOMEPORT_PUBLIC_URL")
                .hasMessageContaining("HOMEPORT_ADMIN_PASSWORD: at least 20 characters")
                .hasMessageContaining("docs/08-connect-services.md");
    }

    @Test
    void eachServiceThatIsSwitchedOnLaterNeedsItsOwnKeys() {
        MockEnvironment withClips = firstDeploy().withProperty("homeport.video.mode", "mux");
        assertThatThrownBy(() -> SettingsCheck.check(withClips))
                .hasMessageContaining("MUX_TOKEN_SECRET")
                .hasMessageNotContaining("RESEND_API_KEY");
        withClips
                .withProperty("homeport.video.mux.token-id", "id")
                .withProperty("homeport.video.mux.token-secret", "secret")
                .withProperty("homeport.video.mux.webhook-secret", "whsec");
        assertThatCode(() -> SettingsCheck.check(withClips)).doesNotThrowAnyException();

        // Links in emails and on shared pages must be https addresses people can open.
        MockEnvironment plain = firstDeploy().withProperty("homeport.public-url", "http://localhost:8080");
        assertThatThrownBy(() -> SettingsCheck.check(plain)).hasMessageContaining("HOMEPORT_PUBLIC_URL");
        // A long reviewers' password is fine; none at all means the reviewer's pages don't exist.
        assertThatCode(() -> SettingsCheck.check(
                        firstDeploy().withProperty("homeport.admin.password", "a-long-password-from-a-manager")))
                .doesNotThrowAnyException();
    }

    @Test
    void onADevelopersComputerNothingIsAsked() {
        MockEnvironment local = new MockEnvironment().withProperty("homeport.auth.mode", "local");
        local.setActiveProfiles("local");
        assertThatCode(() -> SettingsCheck.check(local)).doesNotThrowAnyException();
    }
}

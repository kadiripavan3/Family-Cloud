package app.homeport.api.auth;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

/** Where real people use the API, everything that is switched on has what it needs, or the API says what is missing. */
class SettingsCheckTest {

    /** The first deploy the runbook describes: sign-in and storage connected, push and email switched off. */
    private static MockEnvironment firstDeploy() {
        return new MockEnvironment()
                .withProperty("homeport.auth.mode", "supabase")
                .withProperty("homeport.auth.supabase.url", "https://project.supabase.co")
                .withProperty("homeport.auth.supabase.service-key", "service-key")
                .withProperty("homeport.media.mode", "r2")
                .withProperty("homeport.media.r2.endpoint", "https://account.r2.cloudflarestorage.com")
                .withProperty("homeport.media.r2.bucket", "homeport-media")
                .withProperty("homeport.media.r2.access-key-id", "id")
                .withProperty("homeport.media.r2.secret-access-key", "secret")
                .withProperty("homeport.media.r2.public-url", "https://files.example.org")
                .withProperty("homeport.push.mode", "off")
                .withProperty("homeport.email.mode", "off")
                .withProperty("homeport.public-url", "https://homeport-api.fly.dev");
    }

    @Test
    void theFirstDeployStartsWithSignInAndStorageAndTheRestSwitchedOff() {
        assertThatCode(() -> SettingsCheck.check(firstDeploy())).doesNotThrowAnyException();
    }

    @Test
    void pushNotificationsNeedNoKeyOfTheirOwn() {
        assertThatCode(() -> SettingsCheck.check(firstDeploy().withProperty("homeport.push.mode", "expo")))
                .doesNotThrowAnyException();
    }

    @Test
    void theLinkWithJourneyNeedsToKnowWhereJourneyIs() {
        assertThatThrownBy(() -> SettingsCheck.check(firstDeploy().withProperty("homeport.journey.mode", "http")))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("JOURNEY_API_URL: for the link with Journey (step 9)")
                .hasMessageContaining("HOMEPORT_JOURNEY_MODE=off");
        assertThatCode(() -> SettingsCheck.check(firstDeploy()
                        .withProperty("homeport.journey.mode", "http")
                        .withProperty("homeport.journey.http.url", "https://api.journey.example")))
                .doesNotThrowAnyException();
        assertThatCode(() -> SettingsCheck.check(firstDeploy().withProperty("homeport.journey.mode", "off")))
                .doesNotThrowAnyException();
    }

    @Test
    void everythingThatIsMissingIsNamedInOneListWithTheStepOfThePageItBelongsTo() {
        MockEnvironment nothingSet = new MockEnvironment()
                .withProperty("homeport.auth.mode", "supabase")
                .withProperty("homeport.media.mode", "r2")
                .withProperty("homeport.email.mode", "resend")
                .withProperty("homeport.email.from", "Homeport <hello@example.com>")
                .withProperty("homeport.apple.mode", "apple")
                .withProperty("homeport.journey.mode", "http");
        assertThatThrownBy(() -> SettingsCheck.check(nothingSet))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("SUPABASE_URL: for sign-in (step 1)")
                .hasMessageContaining("SUPABASE_SERVICE_KEY: for sign-in (step 1)")
                .hasMessageContaining("R2_ENDPOINT: for photos and files (step 2)")
                .hasMessageContaining("R2_PUBLIC_URL: for photos and files (step 2)")
                .hasMessageContaining("HOMEPORT_PUBLIC_URL: the https address people reach the API at (step 3)")
                .hasMessageContaining("APPLE_TEAM_ID: for \"Continue with Apple\" (step 5), or HOMEPORT_APPLE_MODE=off")
                .hasMessageContaining("APPLE_PRIVATE_KEY")
                .hasMessageContaining("RESEND_API_KEY: for email (step 7), or HOMEPORT_EMAIL_MODE=off")
                .hasMessageContaining("HOMEPORT_EMAIL_FROM: an address on your own domain, such as"
                        + " \"Homeport <hello@yourdomain.com>\" (email (step 7)")
                .hasMessageContaining("JOURNEY_API_URL: for the link with Journey (step 9)")
                .hasMessageContaining("docs/09-connect-services.md");
    }

    @Test
    void nothingIsAskedForWhatHomeportDoesNotHave() {
        // The app this code was started from had clips, a photo check and a reviewer's password. Homeport has none
        // of them: nothing about them is ever missing, whatever such a setting says.
        MockEnvironment leftovers = new MockEnvironment()
                .withProperty("homeport.auth.mode", "supabase")
                .withProperty("homeport.video.mode", "mux")
                .withProperty("homeport.moderation.mode", "rekognition")
                .withProperty("homeport.admin.password", "short");
        assertThatThrownBy(() -> SettingsCheck.check(leftovers))
                .hasMessageContaining("SUPABASE_URL")
                .hasMessageNotContaining("MUX")
                .hasMessageNotContaining("VIDEO")
                .hasMessageNotContaining("AWS")
                .hasMessageNotContaining("MODERATION")
                .hasMessageNotContaining("ADMIN")
                .hasMessageNotContaining("docs/08");
    }

    @Test
    void eachServiceThatIsSwitchedOnLaterNeedsItsOwnKeys() {
        MockEnvironment withEmail = firstDeploy().withProperty("homeport.email.mode", "resend");
        assertThatThrownBy(() -> SettingsCheck.check(withEmail))
                .hasMessageContaining("RESEND_API_KEY")
                .hasMessageNotContaining("APPLE_TEAM_ID");
        withEmail
                .withProperty("homeport.email.resend.api-key", "re_key")
                .withProperty("homeport.email.from", "Homeport <hello@yourdomain.com>");
        assertThatCode(() -> SettingsCheck.check(withEmail)).doesNotThrowAnyException();

        MockEnvironment withApple = firstDeploy().withProperty("homeport.apple.mode", "apple");
        assertThatThrownBy(() -> SettingsCheck.check(withApple))
                .hasMessageContaining("APPLE_KEY_ID")
                .hasMessageNotContaining("RESEND_API_KEY");

        // Links in emails and on shared pages must be https addresses people can open.
        MockEnvironment plain = firstDeploy().withProperty("homeport.public-url", "http://localhost:8080");
        assertThatThrownBy(() -> SettingsCheck.check(plain)).hasMessageContaining("HOMEPORT_PUBLIC_URL");
    }

    @Test
    void onADevelopersComputerNothingIsAsked() {
        MockEnvironment local = new MockEnvironment().withProperty("homeport.auth.mode", "local");
        local.setActiveProfiles("local");
        assertThatCode(() -> SettingsCheck.check(local)).doesNotThrowAnyException();
    }
}

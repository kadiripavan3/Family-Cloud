package app.homeport.api.auth;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

/** The stand-ins can't be switched on by a setting alone. */
class LocalModeGuardTest {

    @Test
    void localSignInWithoutTheLocalProfileStopsTheApiFromStarting() {
        MockEnvironment production = new MockEnvironment().withProperty("homeport.auth.mode", "local");
        assertThatThrownBy(() -> LocalModeGuard.check(production))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("homeport.auth.mode=local")
                .hasMessageContaining("'local' profile");

        MockEnvironment seeded = new MockEnvironment()
                .withProperty("homeport.seed.enabled", "true")
                .withProperty("homeport.media.mode", "local");
        assertThatThrownBy(() -> LocalModeGuard.check(seeded))
                .hasMessageContaining("homeport.seed.enabled")
                .hasMessageContaining("homeport.media.mode");
    }

    @Test
    void pushesAndEmailsThatOnlyGoToTheLogNeedTheLocalProfileToo() {
        MockEnvironment quiet = new MockEnvironment()
                .withProperty("homeport.push.mode", "local")
                .withProperty("homeport.email.mode", "local");
        assertThatThrownBy(() -> LocalModeGuard.check(quiet))
                .hasMessageContaining("homeport.push.mode=local")
                .hasMessageContaining("homeport.email.mode=local");
        MockEnvironment real = new MockEnvironment()
                .withProperty("homeport.push.mode", "expo")
                .withProperty("homeport.email.mode", "resend");
        assertThatCode(() -> LocalModeGuard.check(real)).doesNotThrowAnyException();
    }

    @Test
    void theStandInForJourneyNeedsTheLocalProfileAndItsSwitchKnowsThreeWords() {
        MockEnvironment sample = new MockEnvironment().withProperty("homeport.journey.mode", "local");
        assertThatThrownBy(() -> LocalModeGuard.check(sample))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("homeport.journey.mode=local");
        for (String real : new String[] {"http", "off"}) {
            MockEnvironment connected = new MockEnvironment().withProperty("homeport.journey.mode", real);
            assertThatCode(() -> LocalModeGuard.check(connected)).doesNotThrowAnyException();
        }
        MockEnvironment typo = new MockEnvironment().withProperty("homeport.journey.mode", "on");
        typo.setActiveProfiles("local");
        assertThatThrownBy(() -> LocalModeGuard.check(typo))
                .hasMessageContaining("homeport.journey.mode=on")
                .hasMessageContaining("http, off, local");
    }

    @Test
    void theSameSettingsAreFineOnADevelopersComputerAndInTests() {
        MockEnvironment local = new MockEnvironment().withProperty("homeport.auth.mode", "local");
        local.setActiveProfiles("local");
        assertThatCode(() -> LocalModeGuard.check(local)).doesNotThrowAnyException();
        MockEnvironment real = new MockEnvironment()
                .withProperty("homeport.auth.mode", "supabase")
                .withProperty("homeport.media.mode", "r2");
        assertThatCode(() -> LocalModeGuard.check(real)).doesNotThrowAnyException();
    }

    @Test
    void aSwitchSetToAWordNobodyKnowsStopsTheApiFromStartingAndSaysWhatItCanBe() {
        MockEnvironment typo = new MockEnvironment().withProperty("homeport.video.mode", "muxx");
        typo.setActiveProfiles("local");
        assertThatThrownBy(() -> LocalModeGuard.check(typo))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("homeport.video.mode=muxx")
                .hasMessageContaining("mux, off, local");
        // Switched off is a word it knows, with or without the local profile.
        MockEnvironment later = new MockEnvironment()
                .withProperty("homeport.video.mode", "off")
                .withProperty("homeport.push.mode", "off")
                .withProperty("homeport.email.mode", "off")
                .withProperty("homeport.moderation.mode", "off");
        assertThatCode(() -> LocalModeGuard.check(later)).doesNotThrowAnyException();
    }
}

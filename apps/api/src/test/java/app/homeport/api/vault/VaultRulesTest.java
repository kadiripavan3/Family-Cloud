package app.homeport.api.vault;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import app.homeport.api.common.ApiProblem;
import app.homeport.api.common.Sealed;
import java.time.LocalDate;
import java.util.Map;
import org.junit.jupiter.api.Test;

/**
 * The Vault's rules that need no database: the three small state machines, with every transition and every
 * "not allowed"; where a grant stands; the few words that describe an item; and what counts as scrambled text.
 */
class VaultRulesTest {

    private static String refusal(Runnable step) {
        try {
            step.run();
            return null;
        } catch (ApiProblem refused) {
            return refused.code();
        }
    }

    // ---------- emergency access ----------

    /** Every state against every event: where it leads, or the code of the sentence that refuses it. */
    @Test
    void emergencyAccessAllowsExactlyTheseStepsAndRefusesEveryOther() {
        Map<EmergencyState, Map<EmergencyState.Event, Object>> table = Map.of(
                EmergencyState.OFF,
                        Map.of(
                                EmergencyState.Event.SET,
                                EmergencyState.READY,
                                EmergencyState.Event.SWITCH_OFF,
                                EmergencyState.OFF,
                                EmergencyState.Event.SAY_NO,
                                "nothing_asked",
                                EmergencyState.Event.ASK,
                                "not_found",
                                EmergencyState.Event.READ,
                                "not_found",
                                EmergencyState.Event.WAIT_OVER,
                                EmergencyState.OFF),
                EmergencyState.READY,
                        Map.of(
                                EmergencyState.Event.SET, EmergencyState.READY,
                                EmergencyState.Event.SWITCH_OFF, EmergencyState.OFF,
                                EmergencyState.Event.SAY_NO, "nothing_asked",
                                EmergencyState.Event.ASK, EmergencyState.ASKED,
                                EmergencyState.Event.READ, "ask_first",
                                EmergencyState.Event.WAIT_OVER, EmergencyState.READY),
                EmergencyState.ASKED,
                        Map.of(
                                EmergencyState.Event.SET, EmergencyState.READY,
                                EmergencyState.Event.SWITCH_OFF, EmergencyState.OFF,
                                EmergencyState.Event.SAY_NO, EmergencyState.READY,
                                EmergencyState.Event.ASK, EmergencyState.ASKED,
                                EmergencyState.Event.READ, "not_yet",
                                EmergencyState.Event.WAIT_OVER, EmergencyState.OPEN),
                EmergencyState.OPEN,
                        Map.of(
                                EmergencyState.Event.SET, EmergencyState.READY,
                                EmergencyState.Event.SWITCH_OFF, EmergencyState.OFF,
                                EmergencyState.Event.SAY_NO, "already_open",
                                EmergencyState.Event.ASK, EmergencyState.OPEN,
                                EmergencyState.Event.READ, EmergencyState.OPEN,
                                EmergencyState.Event.WAIT_OVER, EmergencyState.OPEN));

        for (EmergencyState state : EmergencyState.values()) {
            for (EmergencyState.Event event : EmergencyState.Event.values()) {
                Object expected = table.get(state).get(event);
                String what = state + " then " + event;
                if (expected instanceof EmergencyState next) {
                    assertThat(state.after(event)).as(what).isEqualTo(next);
                } else {
                    assertThat(refusal(() -> state.after(event))).as(what).isEqualTo(expected);
                }
            }
        }
    }

    @Test
    void theEscrowIsReadOnlyOnceItIsOpenAndNoOtherStateLetsItBeRead() {
        for (EmergencyState state : EmergencyState.values()) {
            boolean readable = refusal(() -> state.after(EmergencyState.Event.READ)) == null;
            assertThat(readable).as(state.name()).isEqualTo(state == EmergencyState.OPEN);
        }
    }

    @Test
    void theClockOpensOnlyARequestThatIsRunning() {
        assertThat(EmergencyState.ASKED.after(EmergencyState.Event.WAIT_OVER)).isEqualTo(EmergencyState.OPEN);
        for (EmergencyState state :
                new EmergencyState[] {EmergencyState.OFF, EmergencyState.READY, EmergencyState.OPEN}) {
            assertThat(state.after(EmergencyState.Event.WAIT_OVER)).isEqualTo(state);
        }
    }

    // ---------- helpers ----------

    @Test
    void aHelperCanSayYesOrNoAndStepDownAndIsAskedAgainOnlyAfterANo() {
        assertThat(HelperState.ASKED.after(HelperState.Event.ACCEPT)).isEqualTo(HelperState.ACCEPTED);
        assertThat(HelperState.ASKED.after(HelperState.Event.DECLINE)).isEqualTo(HelperState.DECLINED);
        assertThat(HelperState.ASKED.after(HelperState.Event.ASK)).isEqualTo(HelperState.ASKED);

        assertThat(HelperState.ACCEPTED.after(HelperState.Event.ACCEPT)).isEqualTo(HelperState.ACCEPTED);
        assertThat(HelperState.ACCEPTED.after(HelperState.Event.DECLINE)).isEqualTo(HelperState.DECLINED);
        assertThat(HelperState.ACCEPTED.after(HelperState.Event.ASK)).isEqualTo(HelperState.ACCEPTED);

        assertThat(HelperState.DECLINED.after(HelperState.Event.ASK)).isEqualTo(HelperState.ASKED);
        assertThat(HelperState.DECLINED.after(HelperState.Event.DECLINE)).isEqualTo(HelperState.DECLINED);
        assertThat(refusal(() -> HelperState.DECLINED.after(HelperState.Event.ACCEPT)))
                .isEqualTo("already_declined");
    }

    // ---------- recovery ----------

    @Test
    void onlyAnOpenRecoveryDoesAnythingAndAnEndedOneStaysEnded() {
        assertThat(RecoveryState.OPEN.after(RecoveryState.Event.GIVE_SHARE)).isEqualTo(RecoveryState.OPEN);
        assertThat(RecoveryState.OPEN.after(RecoveryState.Event.FINISH)).isEqualTo(RecoveryState.DONE);
        assertThat(RecoveryState.OPEN.after(RecoveryState.Event.CANCEL)).isEqualTo(RecoveryState.CANCELLED);
        assertThat(RecoveryState.OPEN.after(RecoveryState.Event.LAPSE)).isEqualTo(RecoveryState.LAPSED);

        for (RecoveryState ended :
                new RecoveryState[] {RecoveryState.DONE, RecoveryState.CANCELLED, RecoveryState.LAPSED}) {
            // Nobody can pass a share on any more, whichever way it ended.
            assertThat(refusal(() -> ended.after(RecoveryState.Event.GIVE_SHARE)))
                    .as(ended.name())
                    .isEqualTo("recovery_over");
            // The clock running on changes nothing.
            assertThat(ended.after(RecoveryState.Event.LAPSE)).isEqualTo(ended);
        }
        // Saying the same thing twice is fine; turning one ending into another is not.
        assertThat(RecoveryState.DONE.after(RecoveryState.Event.FINISH)).isEqualTo(RecoveryState.DONE);
        assertThat(RecoveryState.CANCELLED.after(RecoveryState.Event.CANCEL)).isEqualTo(RecoveryState.CANCELLED);
        assertThat(refusal(() -> RecoveryState.DONE.after(RecoveryState.Event.CANCEL)))
                .isEqualTo("recovery_over");
        assertThat(refusal(() -> RecoveryState.CANCELLED.after(RecoveryState.Event.FINISH)))
                .isEqualTo("recovery_over");
        assertThat(refusal(() -> RecoveryState.LAPSED.after(RecoveryState.Event.FINISH)))
                .isEqualTo("recovery_over");
        assertThat(refusal(() -> RecoveryState.LAPSED.after(RecoveryState.Event.CANCEL)))
                .isEqualTo("recovery_over");
    }

    // ---------- grants ----------

    @Test
    void whereAGrantStands() {
        assertThat(GrantState.from(false, false, false, false)).isEqualTo(GrantState.WAITING);
        assertThat(GrantState.from(true, false, false, false)).isEqualTo(GrantState.WAITING);
        assertThat(GrantState.from(true, true, false, false)).isEqualTo(GrantState.READY);
        // Used up wins over everything: the key is gone.
        assertThat(GrantState.from(true, false, true, false)).isEqualTo(GrantState.USED);
        assertThat(GrantState.from(true, false, true, true)).isEqualTo(GrantState.USED);
        // Stopped, whether or not the key has been erased yet.
        assertThat(GrantState.from(true, true, false, true)).isEqualTo(GrantState.STOPPED);
        assertThat(GrantState.from(true, false, false, true)).isEqualTo(GrantState.STOPPED);
    }

    // ---------- a few words on an item ----------

    @Test
    void theLineUnderAnItemSaysWhatItIsAndWhenAnIdRunsOut() {
        LocalDate today = LocalDate.of(2026, 11, 11);

        assertThat(VaultGlance.of(VaultCategory.LOGIN, "netflix.com", null, today))
                .isEqualTo("Login · netflix.com");
        assertThat(VaultGlance.of(VaultCategory.CODE, " home ", null, today)).isEqualTo("Code · home");
        assertThat(VaultGlance.of(VaultCategory.WIFI, "Lind-Home", null, today)).isEqualTo("Wi‑Fi · Lind-Home");
        assertThat(VaultGlance.of(VaultCategory.CARD, "", null, today)).isEqualTo("Card");
        assertThat(VaultGlance.of(VaultCategory.SECRET, null, null, today)).isEqualTo("Secret");

        // The two passports of the screens.
        assertThat(VaultGlance.of(VaultCategory.ID, "", LocalDate.of(2031, 3, 14), today))
                .isEqualTo("ID · expires 14 Mar 2031");
        assertThat(VaultGlance.of(VaultCategory.ID, "", LocalDate.of(2027, 8, 2), today))
                .isEqualTo("Expires 2 Aug 2027 · renew soon");

        // A year ahead is still "soon"; a day more is not.
        assertThat(VaultGlance.of(VaultCategory.ID, "", today.plusDays(365), today))
                .endsWith("renew soon");
        assertThat(VaultGlance.of(VaultCategory.ID, "", today.plusDays(366), today))
                .startsWith("ID · expires");
        assertThat(VaultGlance.of(VaultCategory.ID, "", today, today)).isEqualTo("Expires 11 Nov 2026 · renew soon");
        assertThat(VaultGlance.of(VaultCategory.ID, "", today.minusDays(1), today))
                .isEqualTo("Expired 10 Nov 2026");

        assertThat(VaultGlance.renewSoon(null, today)).isFalse();
        assertThat(VaultGlance.renewSoon(today.plusDays(365), today)).isTrue();
        assertThat(VaultGlance.renewSoon(today.plusDays(366), today)).isFalse();
        assertThat(VaultGlance.renewSoon(today.minusDays(40), today)).isTrue();
    }

    @Test
    void todayShowsAnIdFromSixtyDaysBeforeItRunsOutUntilTwoWeeksAfter() {
        LocalDate today = LocalDate.of(2026, 11, 11);

        assertThat(VaultGlance.onToday(today.plusDays(61), today)).isFalse();
        assertThat(VaultGlance.onToday(today.plusDays(60), today)).isTrue();
        assertThat(VaultGlance.onToday(today, today)).isTrue();
        assertThat(VaultGlance.onToday(today.minusDays(14), today)).isTrue();
        assertThat(VaultGlance.onToday(today.minusDays(15), today)).isFalse();

        assertThat(VaultGlance.countdown(today.plusDays(23), today)).isEqualTo("Runs out in 23 days");
        assertThat(VaultGlance.countdown(today.plusDays(2), today)).isEqualTo("Runs out in 2 days");
        assertThat(VaultGlance.countdown(today.plusDays(1), today)).isEqualTo("Runs out tomorrow");
        assertThat(VaultGlance.countdown(today, today)).isEqualTo("Runs out today");
        assertThat(VaultGlance.countdown(today.minusDays(1), today)).isEqualTo("Ran out yesterday");
        assertThat(VaultGlance.countdown(today.minusDays(3), today)).isEqualTo("Ran out 3 days ago");
    }

    // ---------- what counts as scrambled ----------

    @Test
    void onlyBase64UrlWithoutPaddingLooksScrambled() {
        for (String good : new String[] {"AA", "abc", "A-_9", "sample-item", "c2VhbGVk", "A".repeat(43)}) {
            assertThat(Sealed.looksSealed(good)).as(good).isTrue();
        }
        for (String bad : new String[] {
            "", "A", "ABCDE", "abc=", "ab+c", "ab/c", "ab c", "abc\n", "{\"a\":1}", "hunter2!", "päss", "ab.cd"
        }) {
            assertThat(Sealed.looksSealed(bad)).as("\"" + bad + "\"").isFalse();
        }
        assertThat(Sealed.looksSealed(null)).isFalse();
    }

    @Test
    void everyKindOfScrambledTextHasItsOwnCeilingAndASentenceForWhatIsRefused() {
        assertThat(Sealed.item("A".repeat(Sealed.ITEM_CHARS))).hasSize(87_382);
        assertThat(refusal(() -> Sealed.item("A".repeat(Sealed.ITEM_CHARS + 1))))
                .isEqualTo("too_large");
        assertThat(Sealed.key("A".repeat(512))).hasSize(512);
        assertThat(refusal(() -> Sealed.key("A".repeat(514)))).isEqualTo("too_large");
        assertThat(refusal(() -> Sealed.key("not scrambled"))).isEqualTo("not_sealed");
        assertThat(refusal(() -> Sealed.key(""))).isEqualTo("not_sealed");
        assertThat(refusal(() -> Sealed.key(null))).isEqualTo("not_sealed");
        assertThat(Sealed.keyOrNull(null)).isNull();
        assertThat(Sealed.note(null)).isNull();
        assertThat(refusal(() -> Sealed.note("A".repeat(Sealed.NOTE_CHARS + 2))))
                .isEqualTo("too_large");
        assertThat(refusal(() -> Sealed.card("A".repeat(Sealed.CARD_CHARS + 2))))
                .isEqualTo("too_large");

        // The marker of the sample data is not something a phone may send.
        assertThat(refusal(() -> Sealed.item(Sealed.SAMPLE))).isEqualTo("not_sealed");

        // A public key is exactly 32 bytes.
        assertThat(Sealed.publicKey("A".repeat(43))).hasSize(43);
        assertThat(refusal(() -> Sealed.publicKey("A".repeat(42)))).isEqualTo("not_a_key");
        assertThat(refusal(() -> Sealed.publicKey("A".repeat(44)))).isEqualTo("not_a_key");
        assertThat(refusal(() -> Sealed.publicKey("=".repeat(43)))).isEqualTo("not_a_key");

        assertThatThrownBy(() -> Sealed.key("abc=")).hasMessageContaining("scrambled");
    }

    @Test
    void theWordsOfTheVaultAreReadBackFromTheirCodes() {
        assertThat(VaultCategory.of("wifi")).isEqualTo(VaultCategory.WIFI);
        assertThat(VaultCategory.WIFI.code()).isEqualTo("wifi");
        assertThat(VaultAccess.of(" Use ")).isEqualTo(VaultAccess.USE);
        assertThat(VaultHealth.read("leaked")).isEqualTo(VaultHealth.LEAKED);
        assertThat(refusal(() -> VaultCategory.of("passwords"))).isEqualTo("invalid_category");
        assertThat(refusal(() -> VaultAccess.of("edit"))).isEqualTo("invalid_access");
        assertThat(refusal(() -> VaultHealth.of("strong"))).isEqualTo("invalid_health");
    }
}

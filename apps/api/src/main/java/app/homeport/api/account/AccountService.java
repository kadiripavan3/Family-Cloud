package app.homeport.api.account;

import app.homeport.api.common.ApiProblem;
import app.homeport.api.media.MediaService;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

/** A person's own settings, and deleting their account. */
@Service
public class AccountService {

    public record SettingsResponse(
            @Schema(description = "A push when something is shared with you or changes in a circle")
            boolean notifyActivity,

            @Schema(description = "The Sunday summary, as a push")
            boolean weeklySummary,

            @Schema(description = "Also send the Sunday summary by email")
            boolean summaryEmail,

            @Schema(
                    description = "Hide details in notifications: a push says that a bill is due, not which or how"
                            + " much. A push about the Vault never names the item, whatever this says.")
            boolean hideDetails) {}

    /** A change to the settings. A field that is left out stays as it is, so an older version of the app can't switch off what it doesn't know. */
    public record SettingsChange(
            Boolean notifyActivity, Boolean weeklySummary, Boolean summaryEmail, Boolean hideDetails) {
        SettingsResponse on(SettingsResponse now) {
            return new SettingsResponse(
                    notifyActivity == null ? now.notifyActivity() : notifyActivity,
                    weeklySummary == null ? now.weeklySummary() : weeklySummary,
                    summaryEmail == null ? now.summaryEmail() : summaryEmail,
                    hideDetails == null ? now.hideDetails() : hideDetails);
        }
    }

    /** What the You screen says about a person at a glance. */
    public record OverviewResponse(
            @Schema(description = "The names of the circles they are in, in the order they joined")
            List<String> circles,

            @Schema(description = "Pages and lists they wrote, in every circle")
            int notes,

            @Schema(description = "How much their uploads take, in bytes")
            long bytesKept,

            @Schema(description = "The kinds of phone that are signed in for notifications: ios, android, web")
            List<String> phones) {}

    /** What someone has until they change anything: everything on except email, and pushes say what they are about. */
    public static final SettingsResponse DEFAULTS = new SettingsResponse(true, true, false, false);

    private static final Logger log = LoggerFactory.getLogger(AccountService.class);

    private final AccountStore accounts;
    private final MediaService media;
    private final List<SignInAccounts> signIns;
    private final AppleSignIn apple;
    private final TransactionTemplate transaction;
    private final boolean removeSignIn;

    AccountService(
            AccountStore accounts,
            MediaService media,
            List<SignInAccounts> signIns,
            AppleSignIn apple,
            TransactionTemplate transaction,
            @Value("${homeport.accounts.remove-sign-in:true}") boolean removeSignIn) {
        this.accounts = accounts;
        this.media = media;
        this.signIns = signIns;
        this.apple = apple;
        this.transaction = transaction;
        this.removeSignIn = removeSignIn;
    }

    /** Someone signed in with Apple: what is needed to tell Apple when they delete their account is kept. */
    public void signedInWithApple(UUID me, String authorizationCode) {
        if (authorizationCode == null || authorizationCode.isBlank() || authorizationCode.length() > 2000) {
            throw ApiProblem.badRequest("apple_code_refused", "Apple didn't accept that sign-in. Sign in again.");
        }
        apple.remember(me, authorizationCode.trim());
    }

    public SettingsResponse settings(UUID me) {
        return accounts.settings(me).orElse(DEFAULTS);
    }

    public OverviewResponse overview(UUID me) {
        return accounts.overview(me);
    }

    @Transactional
    public SettingsResponse save(UUID me, SettingsChange change) {
        accounts.saveSettings(me, change.on(settings(me)));
        return settings(me);
    }

    /** What became of the sign-in when an account was deleted. */
    public enum SignInOutcome {
        /** Only Homeport was deleted: the sign-in, and Journey with it, are untouched. */
        KEPT,
        /** The sign-in is gone too, and with it the way into Journey. */
        REMOVED,
        /** "Journey too" was asked for, but the sign-in is removed where both apps can be asked: in Journey. */
        LEFT_TO_JOURNEY;

        @com.fasterxml.jackson.annotation.JsonValue
        public String code() {
            return app.homeport.api.common.Codes.of(this);
        }
    }

    public record AccountDeletedResponse(
            SignInOutcome signIn,

            @Schema(description = "What happened, in a sentence to show as it is")
            String message) {}

    /**
     * Deletes the Homeport account for good: the profile, what the person kept, and their uploads (the files
     * follow within a minute). Circles other people are still in stay, without this person's own things.
     *
     * <p>The sign-in is shared with Journey, so the person chooses. <b>Only Homeport</b> never touches the
     * sign-in: Journey goes on as it was. <b>Journey too</b> removes the sign-in here only when this API is
     * told that it may ({@code homeport.accounts.remove-sign-in}); with the two apps on one sign-in service
     * that is decided where both can be asked, so otherwise the answer says that Journey's own "Delete
     * account" does that part. When the sign-in is removed and the sign-in service can't be reached, it is
     * tried again until it is gone.
     */
    public AccountDeletedResponse delete(UUID me, boolean journeyToo) {
        transaction.executeWithoutResult(status -> {
            accounts.roomToDeleteAnAccount();
            media.deleteAllOwnedBy(me);
            accounts.deleteProfile(me);
            accounts.rememberDeleted(me);
        });
        if (journeyToo && removeSignIn) {
            removeSignIn(me);
            return new AccountDeletedResponse(
                    SignInOutcome.REMOVED,
                    "Your account is deleted, with the sign-in you shared with Journey. Nothing of it is left.");
        }
        // Nothing more to do about the sign-in from here: it stays, and nothing tries to remove it later.
        accounts.signInRemoved(me);
        return journeyToo
                ? new AccountDeletedResponse(
                        SignInOutcome.LEFT_TO_JOURNEY,
                        "Your Homeport account is deleted. The sign-in is shared with Journey, so it is still there:"
                                + " use Delete account in Journey to remove it and your journeys.")
                : new AccountDeletedResponse(
                        SignInOutcome.KEPT,
                        "Your Homeport account is deleted. Your sign-in is untouched, so Journey goes on as it was.");
    }

    /**
     * True for a sign-in that belongs to an account deleted since: one made before the account was deleted, on a
     * phone that is still signed in. It is refused, so a phone left signed in can't bring the account back. A
     * sign-in made after the deletion is a person coming back and starts a new account: with "only Homeport"
     * the sign-in they share with Journey is kept, and it must not lock them out of Homeport for good.
     *
     * @param signedInAt when this sign-in was made (a token says so to the second); unknown counts as before
     */
    public boolean wasDeleted(UUID userId, Instant signedInAt) {
        return accounts.deletedAt(userId)
                .map(deleted -> signedInAt == null || !signedInAt.isAfter(deleted.truncatedTo(ChronoUnit.SECONDS)))
                .orElse(false);
    }

    /** Removes the sign-ins of deleted accounts that couldn't be removed at the time. Returns how many went. */
    public int removeSignInsStillWaiting() {
        int removed = 0;
        for (UUID id : accounts.takeSignInsToRemove(50)) {
            removed += removeSignIn(id) ? 1 : 0;
        }
        accounts.forgetDeletedBefore(30);
        return removed;
    }

    private boolean removeSignIn(UUID userId) {
        try {
            apple.forget(userId); // Apple asks to be told; see AppleSignIn
            signIns.forEach(signIn -> signIn.remove(userId));
            accounts.signInRemoved(userId);
            return true;
        } catch (RuntimeException unreachable) {
            log.error(
                    "The sign-in of deleted account {} couldn't be removed; it will be tried again: {}",
                    userId,
                    unreachable.toString());
            return false;
        }
    }
}

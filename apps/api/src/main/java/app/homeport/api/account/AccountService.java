package app.homeport.api.account;

import app.homeport.api.common.ApiProblem;
import app.homeport.api.media.MediaService;
import io.swagger.v3.oas.annotations.media.Schema;
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
            boolean summaryEmail) {}

    /** A change to the settings. A field that is left out stays as it is, so an older version of the app can't switch off what it doesn't know. */
    public record SettingsChange(Boolean notifyActivity, Boolean weeklySummary, Boolean summaryEmail) {
        SettingsResponse on(SettingsResponse now) {
            return new SettingsResponse(
                    notifyActivity == null ? now.notifyActivity() : notifyActivity,
                    weeklySummary == null ? now.weeklySummary() : weeklySummary,
                    summaryEmail == null ? now.summaryEmail() : summaryEmail);
        }
    }

    /** What someone has until they change anything: everything on except email. */
    public static final SettingsResponse DEFAULTS = new SettingsResponse(true, true, false);

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

    @Transactional
    public SettingsResponse save(UUID me, SettingsChange change) {
        accounts.saveSettings(me, change.on(settings(me)));
        return settings(me);
    }

    /**
     * Deletes the Homeport account for good: the profile, what the person kept, and their uploads (the files
     * follow within a minute). Circles other people are still in stay, without this person's own things.
     *
     * <p>The sign-in is shared with Journey. It is removed here only when this API is told that it may
     * ({@code homeport.accounts.remove-sign-in}); with the two apps on one sign-in service, that is decided
     * where both can be asked. Then, if the sign-in service can't be reached, it is tried again until it is gone.
     */
    public void delete(UUID me) {
        transaction.executeWithoutResult(status -> {
            accounts.roomToDeleteAnAccount();
            media.deleteAllOwnedBy(me);
            accounts.deleteProfile(me);
            accounts.rememberDeleted(me);
        });
        if (removeSignIn) {
            removeSignIn(me);
        } else {
            accounts.signInRemoved(me);
        }
    }

    /** True when the account was deleted a while ago and its sign-in is, or should soon be, gone. */
    public boolean wasDeleted(UUID userId) {
        return accounts.wasDeleted(userId);
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

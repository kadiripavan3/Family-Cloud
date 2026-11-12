package app.homeport.api.account;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Every few minutes: the sign-ins of deleted accounts that couldn't be removed at the time (the sign-in
 * service was down) are tried again. Safe in every copy of the API at once: each takes its own rows.
 */
@Component
class AccountUpkeep {

    private final AccountService accounts;

    AccountUpkeep(AccountService accounts) {
        this.accounts = accounts;
    }

    @Scheduled(initialDelayString = "PT2M", fixedDelayString = "${homeport.accounts.upkeep-every:PT5M}")
    void everyFewMinutes() {
        accounts.removeSignInsStillWaiting();
    }
}

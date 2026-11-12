package app.homeport.api.vault;

import app.homeport.api.common.Jobs;
import java.time.LocalDate;
import java.time.ZoneOffset;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * What the Vault does by itself. Every half minute: the clock's part of emergency access and recovery (a
 * wait that is over opens, a recovery older than seven days lapses, a key shared until a moment that has
 * passed is erased), then the pushes that are waiting go out. Safe in every copy of the API at once: each
 * statement takes its own rows.
 */
@Component
class VaultUpkeep {

    private static final Logger log = LoggerFactory.getLogger(VaultUpkeep.class);

    private final EmergencyService emergencies;
    private final RecoveryService recoveries;
    private final VaultItemService items;
    private final VaultNotices notices;
    private final Jobs jobs;

    VaultUpkeep(
            EmergencyService emergencies,
            RecoveryService recoveries,
            VaultItemService items,
            VaultNotices notices,
            Jobs jobs) {
        this.emergencies = emergencies;
        this.recoveries = recoveries;
        this.items = items;
        this.notices = notices;
        this.jobs = jobs;
    }

    @Scheduled(initialDelayString = "PT30S", fixedDelayString = "${homeport.vault.upkeep-every:PT30S}")
    void everyHalfMinute() {
        step("opening emergency access that is due", emergencies::openDue);
        step("ending recoveries that have lapsed", recoveries::lapseDue);
        step("erasing keys that have stopped working", items::eraseStopped);
        step("pushing notices", notices::deliverDue);
    }

    /** Each step stands alone: one that fails says so in the log and doesn't hold the others up. */
    private static void step(String what, Runnable work) {
        try {
            work.run();
        } catch (RuntimeException failed) {
            log.error("The Vault's upkeep failed at: {}", what, failed);
        }
    }

    @Scheduled(cron = "0 50 3 * * *", zone = "UTC")
    void nightly() {
        jobs.run("vault_notices_cleanup", LocalDate.now(ZoneOffset.UTC).toString(), notices::forgetOld);
    }
}

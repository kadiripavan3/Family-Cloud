package app.homeport.api.notify;

import app.homeport.api.common.Jobs;
import java.time.LocalDate;
import java.time.ZoneOffset;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Every minute, the emails that are waiting go out. Safe in every copy of the API at once: each takes its own. */
@Component
class EmailDelivery {

    private final EmailOutbox emails;
    private final Jobs jobs;

    EmailDelivery(EmailOutbox emails, Jobs jobs) {
        this.emails = emails;
        this.jobs = jobs;
    }

    @Scheduled(initialDelayString = "PT1M", fixedDelayString = "${homeport.email.deliver-every:PT1M}")
    void everyMinute() {
        emails.deliverDue();
    }

    @Scheduled(cron = "${homeport.email.cleanup-cron:0 55 3 * * *}", zone = "UTC")
    void nightly() {
        jobs.run("email_cleanup", LocalDate.now(ZoneOffset.UTC).toString(), emails::forgetOld);
    }
}

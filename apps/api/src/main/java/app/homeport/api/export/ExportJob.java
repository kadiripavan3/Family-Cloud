package app.homeport.api.export;

import app.homeport.api.common.Jobs;
import java.time.LocalDate;
import java.time.ZoneOffset;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Every minute, the exports that wait are made. Once a night, the ones whose week is over are forgotten. */
@Component
class ExportJob {

    private static final Logger log = LoggerFactory.getLogger(ExportJob.class);

    private final ExportService exports;
    private final Jobs jobs;

    ExportJob(ExportService exports, Jobs jobs) {
        this.exports = exports;
        this.jobs = jobs;
    }

    @Scheduled(initialDelayString = "PT45S", fixedDelayString = "${homeport.export.make-every:PT1M}")
    void everyMinute() {
        try {
            int made = exports.makeWaiting();
            if (made > 0) {
                log.info("Made {} exports.", made);
            }
        } catch (RuntimeException failed) {
            log.error("Making exports failed; it will be tried again.", failed);
        }
    }

    @Scheduled(cron = "${homeport.export.cleanup-cron:0 30 3 * * *}", zone = "UTC")
    void nightly() {
        jobs.run("export_cleanup", LocalDate.now(ZoneOffset.UTC).toString(), exports::forgetExpired);
    }
}

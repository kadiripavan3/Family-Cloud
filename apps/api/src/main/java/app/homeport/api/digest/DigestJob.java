package app.homeport.api.digest;

import app.homeport.api.common.Jobs;
import app.homeport.api.digest.DigestService.SummaryResponse;
import app.homeport.api.notify.EmailOutbox;
import app.homeport.api.notify.Outbox;
import app.homeport.api.notify.Push;
import app.homeport.api.notify.PushKind;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Sends the Sunday summary: a push that opens the summary page, and an email for people who asked for one.
 *
 * <p>It goes out on each person's own Sunday evening (from six o'clock, by the time zone of the phone they
 * used last; people without a phone on record count as UTC), once for each circle they are in. The job runs
 * every hour and takes whoever's turn it is. "Has had this week's" is written per person and circle, in the
 * same transaction as the push and the email, so a run that is cut short (a deploy) is simply continued by
 * the next one, and nobody gets it twice. A week with nothing in it sends nothing.
 */
@Component
public class DigestJob {

    private static final Logger log = LoggerFactory.getLogger(DigestJob.class);
    static final int AT_ONCE = 500;

    /** One person and one circle whose Sunday evening it is. */
    private record Turn(UUID userId, UUID circleId, String week, LocalDate sunday, boolean push, boolean email) {}

    private final DigestService weeks;
    private final DigestMailer mailer;
    private final Outbox outbox;
    private final EmailOutbox emails;
    private final JdbcClient jdbc;
    private final TransactionTemplate transaction;
    private final Jobs jobs;

    DigestJob(
            DigestService weeks,
            DigestMailer mailer,
            Outbox outbox,
            EmailOutbox emails,
            JdbcClient jdbc,
            TransactionTemplate transaction,
            Jobs jobs) {
        this.weeks = weeks;
        this.mailer = mailer;
        this.outbox = outbox;
        this.emails = emails;
        this.jdbc = jdbc;
        this.transaction = transaction;
        this.jobs = jobs;
    }

    @Scheduled(cron = "${homeport.summary.cron:0 5 * * * *}", zone = "UTC")
    void hourly() {
        Instant now = Instant.now();
        jobs.run("sunday_summary", now.truncatedTo(ChronoUnit.HOURS).toString(), () -> {
            int told = sendDue(now);
            if (told > 0) {
                log.info("The Sunday summary went out {} times.", told);
            }
        });
    }

    /**
     * Sends the summary to everyone whose Sunday evening it is at {@code now} and who hasn't had this week's
     * of that circle. Returns how many summaries went out.
     */
    public int sendDue(Instant now) {
        int told = 0;
        for (Turn turn : whoseTurn(now)) {
            try {
                Boolean sent = transaction.execute(status -> send(turn));
                told += Boolean.TRUE.equals(sent) ? 1 : 0;
            } catch (RuntimeException failed) {
                // One week that can't be put together must not hold up everyone else's.
                log.error(
                        "The summary for {} in {} couldn't be made: {}",
                        turn.userId(),
                        turn.circleId(),
                        failed.toString());
            }
        }
        return told;
    }

    /** One person and one circle, in one transaction: the mark that they have had this week's, the push and the email. */
    private boolean send(Turn turn) {
        boolean first = jdbc.sql("""
                        insert into summaries_sent (user_id, circle_id, week) values (:user, :circle, :week)
                        on conflict do nothing
                        """)
                        .param("user", turn.userId())
                        .param("circle", turn.circleId())
                        .param("week", turn.week())
                        .update()
                > 0;
        if (!first) {
            return false;
        }
        SummaryResponse week = weeks.week(turn.circleId(), turn.userId(), turn.sunday());
        if (!week.anything()) {
            return false; // nothing happened that this person may see
        }
        if (turn.push()) {
            outbox.tell(Push.to(
                            turn.userId(),
                            PushKind.WEEKLY_SUMMARY,
                            "Your week in " + week.circleName(),
                            week.inShort().isEmpty() ? "Open to see it" : week.inShort(),
                            "/summary/" + turn.circleId() + "?week=" + week.from())
                    .about(turn.circleId(), null)
                    .once("summary:" + turn.userId() + ":" + turn.circleId() + ":" + turn.week()));
        }
        if (turn.email()) {
            emails.queue(turn.userId(), mailer.write(turn.userId(), week));
        }
        return true;
    }

    /**
     * The people whose own Sunday evening it is (from 18:00 on Sunday until Monday noon, so an hour that was
     * missed is caught up), with each circle they are in, who want the summary some way and haven't had this
     * week's. For each, the name of the week ("2026-W46") and its Sunday.
     */
    private List<Turn> whoseTurn(Instant now) {
        return jdbc.sql("""
            select person, circle, push, email, to_char(local_time - interval '18 hours', 'IYYY-"W"IW') as week,
              cast(local_time - interval '18 hours' as date) as sunday
            from (
              select m.user_id as person, m.circle_id as circle, coalesce(s.weekly_summary, true) as push,
                coalesce(s.summary_email, false) as email,
                (cast(:now as timestamptz) at time zone coalesce(z.time_zone, 'UTC')) as local_time
              from members m left join settings s on s.user_id = m.user_id
              left join lateral (select d.time_zone from devices d where d.user_id = m.user_id
                                 order by d.seen_at desc limit 1) z on true
              where m.user_id is not null and m.status = 'joined'
                and (coalesce(s.weekly_summary, true) or coalesce(s.summary_email, false))) t
            where ((extract(isodow from local_time) = 7 and extract(hour from local_time) >= 18)
                or (extract(isodow from local_time) = 1 and extract(hour from local_time) < 12))
              and not exists (select 1 from summaries_sent ss where ss.user_id = person and ss.circle_id = circle
                    and ss.week = to_char(local_time - interval '18 hours', 'IYYY-"W"IW'))
            order by person, circle limit :limit
            """)
                .param("now", Timestamp.from(now))
                .param("limit", AT_ONCE)
                .query((rs, n) -> new Turn(
                        rs.getObject("person", UUID.class),
                        rs.getObject("circle", UUID.class),
                        rs.getString("week"),
                        rs.getObject("sunday", LocalDate.class),
                        rs.getBoolean("push"),
                        rs.getBoolean("email")))
                .list();
    }
}

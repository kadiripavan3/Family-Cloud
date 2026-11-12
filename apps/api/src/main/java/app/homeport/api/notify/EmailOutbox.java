package app.homeport.api.notify;

import app.homeport.api.notify.EmailSender.Email;
import java.time.Duration;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/**
 * Emails on their way out. Whoever wants to write to someone puts the email here, in the same transaction as
 * the reason for it; a job sends what is waiting, a couple a second (email services take only so many), and
 * tries again later when the service is busy or can't be reached. An email the service refuses for what it
 * is (a dead address, say) is not tried again.
 */
@Component
public class EmailOutbox {

    private static final Logger log = LoggerFactory.getLogger(EmailOutbox.class);
    static final int TRIES = 6;
    static final int AT_ONCE = 100;

    /** What is written to someone, before it is known where to send it. */
    public record Letter(String subject, String html, String text, String sendOnceKey) {}

    private record Waiting(UUID id, UUID userId, Letter letter, int attempts) {}

    private final JdbcClient jdbc;
    private final EmailAddresses addresses;
    private final EmailSender sender;
    private final Duration pause;

    EmailOutbox(
            JdbcClient jdbc,
            EmailAddresses addresses,
            EmailSender sender,
            @Value("${homeport.email.pause:PT0.5S}") Duration pause) {
        this.jdbc = jdbc;
        this.addresses = addresses;
        this.sender = sender;
        this.pause = pause;
    }

    /** Puts an email in line. The same key twice is one email. */
    public void queue(UUID userId, Letter letter) {
        jdbc.sql("""
            insert into emails (user_id, subject, html, body, send_once_key) values (:user, :subject, :html, :body, :key)
            on conflict (send_once_key) do nothing
            """)
                .param("user", userId)
                .param("subject", letter.subject())
                .param("html", letter.html())
                .param("body", letter.text())
                .param("key", letter.sendOnceKey())
                .update();
    }

    /** Sends what is due. Returns how many went out. No transaction is open while the email service is called. */
    public int deliverDue() {
        int sent = 0;
        for (Waiting one : take()) {
            Optional<String> to = addresses.of(one.userId());
            if (to.isEmpty()) {
                done(one.id(), "gave_up"); // the sign-in service knows no address for this person
                continue;
            }
            try {
                Letter letter = one.letter();
                sender.send(new Email(to.get(), letter.subject(), letter.html(), letter.text(), letter.sendOnceKey()));
                done(one.id(), "sent");
                sent++;
            } catch (EmailSender.Refused refused) {
                log.warn(
                        "An email for {} was refused and won't be tried again: {}", one.userId(), refused.getMessage());
                done(one.id(), "refused");
            } catch (RuntimeException later) {
                if (one.attempts() >= TRIES) {
                    log.error(
                            "An email for {} couldn't be sent after {} tries: {}",
                            one.userId(),
                            TRIES,
                            later.toString());
                    done(one.id(), "gave_up");
                } else {
                    log.warn("An email for {} will be tried again: {}", one.userId(), later.toString());
                }
            }
            rest();
        }
        return sent;
    }

    /**
     * Takes emails that are due. Each is put off as it is taken, a little longer each time, so another copy
     * of the API doesn't take it too and one that fails is tried again later.
     */
    private List<Waiting> take() {
        return jdbc.sql("""
            update emails set attempts = attempts + 1,
              next_try_at = now() + make_interval(mins => least(5 * power(2, attempts)::int, 360))
            where id in (select id from emails where status = 'pending' and next_try_at <= now()
                         order by next_try_at limit :limit for update skip locked)
            returning id, user_id, subject, html, body, send_once_key, attempts
            """)
                .param("limit", AT_ONCE)
                .query((rs, n) -> new Waiting(
                        rs.getObject("id", UUID.class),
                        rs.getObject("user_id", UUID.class),
                        new Letter(
                                rs.getString("subject"),
                                rs.getString("html"),
                                rs.getString("body"),
                                rs.getString("send_once_key")),
                        rs.getInt("attempts")))
                .list();
    }

    private void done(UUID id, String status) {
        jdbc.sql("update emails set status = :status, done_at = now() where id = :id")
                .param("status", status)
                .param("id", id)
                .update();
    }

    /** Emails that went out, or never will, more than a week ago are of no use to anyone. */
    public int forgetOld() {
        return jdbc.sql("delete from emails where status <> 'pending' and done_at < now() - interval '7 days'")
                .update();
    }

    private void rest() {
        if (pause.isZero() || pause.isNegative()) {
            return;
        }
        try {
            Thread.sleep(pause);
        } catch (InterruptedException stopping) {
            Thread.currentThread().interrupt();
        }
    }
}

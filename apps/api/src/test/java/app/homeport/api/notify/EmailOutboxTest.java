package app.homeport.api.notify;

import static org.assertj.core.api.Assertions.assertThat;

import app.homeport.api.ApiTest;
import app.homeport.api.notify.EmailOutbox.Letter;
import app.homeport.api.notify.EmailSender.Email;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/** Emails wait in line, go out once, and are tried again when the email service is busy, not when it says no. */
class EmailOutboxTest extends ApiTest {

    /** An email service that does what the test tells it to. */
    private static final class Scripted implements EmailSender {
        final List<Email> sent = new ArrayList<>();
        final List<Boolean> insideTransaction = new ArrayList<>();
        RuntimeException next;

        @Override
        public void send(Email email) {
            insideTransaction.add(TransactionSynchronizationManager.isActualTransactionActive());
            if (next != null) {
                RuntimeException failure = next;
                next = null;
                throw failure;
            }
            sent.add(email);
        }
    }

    @Autowired
    EmailAddresses addresses;

    private final Scripted service = new Scripted();

    private EmailOutbox outbox() {
        return new EmailOutbox(jdbc, addresses, service, Duration.ZERO);
    }

    private UUID nora() throws Exception {
        person("nora");
        return jdbc.sql("select id from profiles where display_name = 'nora'")
                .query(UUID.class)
                .single();
    }

    @Test
    void anEmailGoesOutOnceToTheAddressThePersonSignsInWith() throws Exception {
        UUID nora = nora();
        EmailOutbox outbox = outbox();
        Letter letter = new Letter("This week: 2 new entries", "<p>Hi Nora</p>", "Hi Nora", "digest-nora-2026-W46");
        outbox.queue(nora, letter);
        outbox.queue(nora, letter); // the same key twice is one email

        assertThat(outbox.deliverDue()).isEqualTo(1);
        assertThat(outbox.deliverDue()).isZero();

        assertThat(service.sent).hasSize(1);
        assertThat(service.sent.get(0).to()).isEqualTo("nora@example.com");
        assertThat(service.sent.get(0).sendOnceKey()).isEqualTo("digest-nora-2026-W46");
        assertThat(service.insideTransaction).containsOnly(false);
        assertThat(status()).containsExactly("sent");
    }

    @Test
    void aBusyServiceIsAskedAgainLaterAndARefusalIsFinal() throws Exception {
        UUID nora = nora();
        EmailOutbox outbox = outbox();
        outbox.queue(nora, new Letter("One", "<p>1</p>", "1", "key-1"));

        service.next = new IllegalStateException("429 slow down");
        assertThat(outbox.deliverDue()).isZero();
        assertThat(status()).containsExactly("pending");
        // Not due again yet; a few minutes later it is, and goes.
        assertThat(outbox.deliverDue()).isZero();
        assertThat(service.insideTransaction).hasSize(1);
        jdbc.sql("update emails set next_try_at = now()").update();
        assertThat(outbox.deliverDue()).isEqualTo(1);
        assertThat(status()).containsExactly("sent");

        // The service looked at this one and said no: it is not tried again.
        outbox.queue(nora, new Letter("Two", "<p>2</p>", "2", "key-2"));
        service.next = new EmailSender.Refused("The address doesn't exist", null);
        assertThat(outbox.deliverDue()).isZero();
        jdbc.sql("update emails set next_try_at = now()").update();
        assertThat(outbox.deliverDue()).isZero();
        assertThat(status()).containsExactlyInAnyOrder("sent", "refused");

        // One that keeps failing is given up on after six tries, and says so.
        outbox.queue(nora, new Letter("Three", "<p>3</p>", "3", "key-3"));
        for (int i = 0; i < 6; i++) {
            service.next = new IllegalStateException("still down");
            jdbc.sql("update emails set next_try_at = now() where status = 'pending'")
                    .update();
            outbox.deliverDue();
        }
        assertThat(status()).containsExactlyInAnyOrder("sent", "refused", "gave_up");

        // Old ones are forgotten after a week.
        jdbc.sql("update emails set done_at = now() - interval '8 days'").update();
        assertThat(outbox.forgetOld()).isEqualTo(3);
    }

    private List<String> status() {
        return jdbc.sql("select status from emails").query(String.class).list();
    }
}

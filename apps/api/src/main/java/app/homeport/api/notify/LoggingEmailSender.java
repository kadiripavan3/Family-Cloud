package app.homeport.api.notify;

import java.util.ArrayDeque;
import java.util.Deque;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * The stand-in for the email service: each email's subject and plain text are written to the API's log. It
 * also keeps the last few, so tests can look at what would have been sent.
 */
@Component
@ConditionalOnProperty(name = "homeport.email.mode", havingValue = "local")
public class LoggingEmailSender implements EmailSender {

    private static final Logger log = LoggerFactory.getLogger(LoggingEmailSender.class);
    private static final int KEPT = 50;

    private final Deque<Email> sent = new ArrayDeque<>();

    @Override
    public synchronized void send(Email email) {
        log.info("Email to {}: {}\n{}", email.to(), email.subject(), email.text());
        sent.addLast(email);
        if (sent.size() > KEPT) {
            sent.removeFirst();
        }
    }

    /** The most recent emails, oldest first. */
    public synchronized List<Email> sent() {
        return List.copyOf(sent);
    }

    public synchronized void clear() {
        sent.clear();
    }
}

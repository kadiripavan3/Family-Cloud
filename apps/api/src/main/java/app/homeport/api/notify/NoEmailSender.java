package app.homeport.api.notify;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * For a place where the API runs before there is an email service ({@code journey.email.mode=off}): nothing
 * is sent, and the log says so when the API starts. The weekly digest still goes out as a push. Unlike the
 * stand-in that writes emails to the log, this is allowed anywhere, because it pretends nothing.
 */
@Component
@ConditionalOnProperty(name = "homeport.email.mode", havingValue = "off")
class NoEmailSender implements EmailSender {

    private static final Logger log = LoggerFactory.getLogger(NoEmailSender.class);

    NoEmailSender() {
        log.warn("Email is switched off (journey.email.mode=off). The weekly digest goes out as a push only.");
    }

    @Override
    public void send(Email email) {
        // Dropped on purpose.
    }
}

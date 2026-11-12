package app.homeport.api.notify;

import java.util.Collection;
import java.util.List;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * Pushes switched off ({@code journey.push.mode=off}): for running the API before the app has its push
 * credentials. Everything else works; messages that would have been pushed are dropped.
 */
@Component
@ConditionalOnProperty(name = "homeport.push.mode", havingValue = "off")
class NoPushSender implements PushSender {

    @Override
    public Handed send(List<PushMessage> messages) {
        return Handed.NOTHING;
    }

    @Override
    public Outcome outcomes(Collection<String> ticketIds) {
        return Outcome.NOTHING;
    }
}

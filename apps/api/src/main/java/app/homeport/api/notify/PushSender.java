package app.homeport.api.notify;

import java.util.Collection;
import java.util.List;
import java.util.Set;

/**
 * Delivers pushes to phones. In local mode they are written to the log; with {@code journey.push.mode=expo}
 * they go to the Expo Push Service, which passes them on to Apple and Google; with {@code off} nothing is sent.
 */
public interface PushSender {

    /** The most messages one call takes. */
    int PER_CALL = 100;

    /** The service's own id for a push it accepted, and the device it was for. */
    record Ticket(String id, String token) {}

    /**
     * What the service said straight away: the device tokens it already knows are gone for good (the app was
     * removed), and a ticket for each push it accepted, to ask about later.
     */
    record Handed(Set<String> gone, List<Ticket> tickets) {
        public static final Handed NOTHING = new Handed(Set.of(), List.of());
    }

    /**
     * What became of pushes handed over earlier: the tickets the service has an answer for, and among them
     * the ones whose device is gone for good.
     */
    record Outcome(Set<String> answered, Set<String> gone) {
        public static final Outcome NOTHING = new Outcome(Set.of(), Set.of());
    }

    /**
     * Hands over one call's worth of messages (at most {@link #PER_CALL}). Throws when the service can't be
     * reached or refuses the call; none of these messages count as sent then, and they are tried again later.
     */
    Handed send(List<PushMessage> messages);

    /** Asks what became of pushes handed over a while ago. */
    Outcome outcomes(Collection<String> ticketIds);
}

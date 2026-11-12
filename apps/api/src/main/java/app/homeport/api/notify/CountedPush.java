package app.homeport.api.notify;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

/**
 * Words for a push that says what stands when it is sent: "Alex added 19 photos" counts the photos this
 * reader may see at that moment, not the ones there were when the first arrived. Activity implements it for
 * the lines it keeps.
 */
public interface CountedPush {

    record Words(String title, String body) {}

    /** What the push about this line says to this person now, or nothing when there is nothing left to tell them. */
    Optional<Words> words(UUID lineId, UUID userId, Instant since);
}

package app.homeport.api.journey;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.UUID;

/**
 * What happened through the link with Journey, said once (as a Spring event, inside the transaction it
 * happened in where there is one) for whoever keeps the record of a circle's days: a line in Activity, a push.
 * This place sends no push and writes no Activity line itself.
 */
public sealed interface JourneyHappened {

    UUID circleId();

    /** The member who did it. */
    UUID memberId();

    /**
     * A journey was kept, or more of it came home.
     *
     * @param pageId its book in Notes; null when only its photos were kept
     * @param first true the first time; false when entries added since were brought
     */
    record Kept(
            UUID circleId,
            UUID memberId,
            UUID keptId,
            UUID pageId,
            UUID albumId,
            String title,
            boolean first,
            int entries,
            int shots)
            implements JourneyHappened {}

    /** A draft made from the Library left home and became a journey. Only its writer is concerned. */
    record Told(UUID circleId, UUID memberId, UUID draftId, UUID journeyId, String title, int shots)
            implements JourneyHappened {}

    /** A trip that was planned here became a journey. */
    record TripBecameJourney(UUID circleId, UUID memberId, UUID folderId, UUID journeyId, String title)
            implements JourneyHappened {}

    /**
     * A goodnight arrived for the circle. It is meant to be seen at bedtime: a push for it goes out at
     * {@code bedtime} on {@code forDay} (by the clock at home), to everyone who may see the thing.
     *
     * @param replyTo the goodnight this one answers, when it is one sent back
     */
    record GoodnightArrived(
            UUID circleId, UUID memberId, UUID thingId, String title, LocalDate forDay, LocalTime bedtime, UUID replyTo)
            implements JourneyHappened {}
}

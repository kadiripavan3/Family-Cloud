package app.homeport.api.home;

import java.util.Optional;
import java.util.UUID;

/**
 * A few words a place adds to a circle's line in the circle switcher: Money says "you're owed €64". A place
 * that has something worth saying there implements this; Home asks them all and never knows what they hold.
 */
public interface SwitcherSource {

    /** What this place says about this circle to this person, or nothing. Short: it shares a line with others. */
    Optional<String> line(UUID circleId, UUID me);
}

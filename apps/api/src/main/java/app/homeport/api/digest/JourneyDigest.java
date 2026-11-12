package app.homeport.api.digest;

import java.time.LocalDate;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * Where "From Journey" will come from: the journeys of the people in the circle that moved this week ("Alex ·
 * Lofoten by bike · Day 6 of 9 · 4 new entries"). The link between the two apps is not built yet
 * (docs/04-journey-link.md), so this brings nothing and the summary has no such section. When the link
 * exists, it answers here with a {@link Section} and nothing else in the summary changes.
 */
@Component
class JourneyDigest implements DigestSource {

    @Override
    public Part week(UUID me, UUID circleId, LocalDate from, LocalDate to) {
        return Part.nothing();
    }
}

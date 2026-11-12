package app.homeport.api.board.templates;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * Who has something on in the calendar on a day, for the Saturday jar's "All four free". Plan can implement
 * this; until it does, the jar doesn't say whether everyone is free.
 */
public interface FreeDay {

    /** The members with something in a circle's calendar on that day, as far as this person may see. */
    List<UUID> busy(UUID circleId, UUID viewer, LocalDate day);
}

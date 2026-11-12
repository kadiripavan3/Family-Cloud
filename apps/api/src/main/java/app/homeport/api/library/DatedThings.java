package app.homeport.api.library;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * What the Library asks of a place that keeps things with days (Plan, for its events): when do these things
 * happen? With it, a passport linked to a trip can say that it runs out too soon after the trip. The Library
 * works without anyone answering; a place that can answer implements this and is found by itself.
 */
public interface DatedThings {

    /** The first and the last day of something that happens. */
    record Days(LocalDate from, LocalDate to) {}

    /** The days of those of these things that have days. The rest are left out. Who may see each was checked before. */
    Map<UUID, Days> daysOf(List<UUID> thingIds);
}

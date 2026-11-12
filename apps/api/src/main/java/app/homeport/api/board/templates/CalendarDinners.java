package app.homeport.api.board.templates;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * Dinners that are in the calendar ("Dinner at Grandma Astrid's"), as the weekly meal plan shows them on
 * their day with "From the calendar". Plan implements this once it has events; until then the meal plan
 * shows only its own meals.
 */
public interface CalendarDinners {

    record Dinner(UUID eventId, LocalDate day, String title) {}

    /** The dinners in a circle's calendar between two days (both counted) that this person may see. */
    List<Dinner> between(UUID circleId, UUID viewer, LocalDate from, LocalDate to);
}

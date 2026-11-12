package app.homeport.api.plan;

import java.util.Optional;
import java.util.UUID;

/**
 * Where a goal reads its number when nobody types it in: the "Saved" cell of a sheet, the days of a
 * challenge in Journey. The place that owns that number implements this, and Spring finds it; Plan never
 * looks into another place's tables. Until a place does, a goal that names it shows what was put in by hand.
 */
public interface GoalNumber {

    /** Which kind of reference this reads. */
    GoalSource source();

    /**
     * The number as it stands now, for this viewer.
     *
     * @param ref what the goal stored to say where the number is; its form is this reader's own business
     * @return nothing when it can't be read: it is gone, or it isn't shared with this person
     */
    Optional<Reading> read(UUID circleId, String ref, UUID me);

    /**
     * @param number how far, in the goal's own unit (cents for money)
     * @param words where it comes from, to finish "Reads …": “Saved” in Norway budget
     */
    record Reading(long number, String words) {}
}

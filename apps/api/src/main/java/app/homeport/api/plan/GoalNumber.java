package app.homeport.api.plan;

import app.homeport.api.thing.ThingKind;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Where a goal reads its number when nobody types it in: the "Saved" cell of a sheet, the days of a
 * challenge in Journey. The place that owns that number implements this, and Spring finds it; Plan never
 * looks into another place's tables. Until a place does, a goal that names it shows what was put in by hand.
 *
 * <p><b>One number, kept in one place.</b> A goal that reads its number never keeps a second count of its
 * own. Where the number is a plain sum of lines (the rows of the table a sheet's "Saved" adds up), the place
 * hands those lines over ({@link #lines}): the goal shows them as who put in what, "Add money" on the goal
 * writes a line there ({@link #add}), and taking one back removes it there ({@link #remove}). So the goal and
 * the sheet can never disagree. Where it is anything else (a formula over several columns, a count of days in
 * Journey), it can only be changed where it is kept, and the goal says so.
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
     * @param thingId the thing it is read from, for the goal's row to open: the sheet. Null when it is no
     *     thing here (a challenge in Journey)
     */
    record Reading(long number, String words, UUID thingId, ThingKind thingKind) {

        /** A number read from something that is no thing here. */
        public Reading(long number, String words) {
            this(number, words, null, null);
        }
    }

    /**
     * One line of what a number adds up: who put in how much, and when.
     *
     * @param memberId who it is by, when the line says; null when it doesn't
     * @param day the day it is for, when the line says; null when it doesn't
     */
    record Line(UUID id, UUID memberId, long amount, String note, LocalDate day) {}

    /**
     * The lines a number is the sum of.
     *
     * @param all every line that adds something, the latest first. Short by nature: a table holds 2,000 rows
     * @param canAdd true when this viewer may write a line there
     */
    record Lines(List<Line> all, boolean canAdd) {}

    /**
     * The lines the number is the sum of, for this viewer, when it is nothing but a sum of lines. Empty when
     * it is anything else, or can't be read.
     */
    default Optional<Lines> lines(UUID circleId, String ref, UUID me) {
        return Optional.empty();
    }

    /**
     * Writes a line where the number counts it, as this person: what "Add money" on the goal does. Only asked
     * of a reader whose {@link #lines} said the viewer can add. Sending the same clientId again writes one line.
     *
     * @return the line's id
     */
    default UUID add(
            UUID circleId, String ref, UUID me, UUID memberId, long amount, String note, LocalDate day, UUID clientId) {
        throw new UnsupportedOperationException("This number has no lines to add to");
    }

    /**
     * Takes a line back, when the id is one of this reader's lines: the row is removed where it is kept, by
     * that place's own rules of who may. True when it was one of this reader's.
     */
    default boolean remove(UUID lineId, UUID me) {
        return false;
    }
}

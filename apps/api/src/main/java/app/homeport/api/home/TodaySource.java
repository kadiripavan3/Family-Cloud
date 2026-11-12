package app.homeport.api.home;

import app.homeport.api.thing.ThingKind;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * What one place brings to Today. Plan brings events and reminders, Money brings bills that are due, the
 * Library brings what is new. Each place has one of these; Home asks them all and never knows what they hold.
 */
public interface TodaySource {

    /**
     * The button a line has when there is something to do right from it. What it says and what it does are
     * two things: a share of a split to pay says "Pay" and a couple's says "Settle", and both settle up.
     *
     * @param act what kind of act it is, for the app to know what to call: {@code pay} marks the signed-in
     *     person's share of a bill as paid ({@code PUT /v1/bills/{id}/paid}); {@code remind} reminds whoever
     *     owes in a split ({@code PUT /v1/splits/{id}/reminders/{memberId}}, for each person the split says
     *     owes you); {@code settle} opens the split to settle up ({@code POST /v1/splits/{id}/payments})
     */
    record TodayAction(
            @Schema(description = "What the button says: Pay, Remind, Settle")
            String label,

            @Schema(
                    description = "What kind of act it is. pay: mark your share of the bill paid (PUT"
                            + " /v1/bills/{id}/paid with dueOn). remind: remind whoever owes you in the split (PUT"
                            + " /v1/splits/{id}/reminders/{memberId} for each of them). settle: open the split to"
                            + " settle up (POST /v1/splits/{id}/payments).")
            String act) {

        /** Marks your share of a bill as paid. */
        public static final TodayAction PAY = new TodayAction("Pay", "pay");
    }

    /**
     * For something that is due rather than on: the day, and what Activity says about it when the day is
     * near ("Electricity is due tomorrow, €84.20 · Your half is €42.10").
     *
     * @param amount how much, to the cent, when it is money
     * @param note the small line for Activity; the line's own note when left out
     */
    record TodayDue(
            LocalDate on,
            @Schema(nullable = true) String amount,
            @Schema(nullable = true) String note) {}

    /** One line of the day's list: an event with its time, a job with its tick, a bill with its amount. */
    record TodayItem(
            UUID thingId,
            ThingKind kind,
            String title,

            @Schema(description = "The small line under the title: Alex is taking her")
            String note,

            @Schema(nullable = true, description = "What stands in front: 15:30, or €84. Null for a job with a tick.")
            String lead,

            @Schema(
                    nullable = true,
                    description = "For something that can be ticked: whether it is done. Null otherwise.")
            Boolean done,

            @Schema(description = "Sorts the day: minutes since midnight, or 1440 for something with no time")
            int minute,

            @Schema(description = "Pictures of the people it concerns, two at most")
            List<String> avatarUrls,

            @Schema(nullable = true, description = "Its button, when there is something to do right here: Pay")
            TodayAction action,

            @Schema(description = "True for something that comes round again: the repeat mark")
            boolean repeats,

            @Schema(
                    nullable = true,
                    description = "For a bill or a reminder: when it is due, and how Activity says it. For a reminder"
                            + " that is done: the due day that was ticked, to send back when taking the tick away.")
            TodayDue due,

            @Schema(
                    description = "For a reminder: true when the signed-in person may tick it here, or, for a line"
                            + " that is done, take its tick away again (PUT /v1/reminders/{id}/done, with due.on as"
                            + " dueOn). False for everything else, which is ticked where it is kept.")
            boolean canTick,

            @Schema(
                    nullable = true,
                    description = "When this line is a job that is also kept as another thing (a job on the chore"
                            + " wheel that has its reminder in Plan): that thing. Today lists such a pair once, so a"
                            + " line that names another is only here when the other isn't on the list.")
            UUID sameAs) {

        /** A line with no button, that doesn't repeat and isn't due: what most places bring. */
        public TodayItem(
                UUID thingId,
                ThingKind kind,
                String title,
                String note,
                String lead,
                Boolean done,
                int minute,
                List<String> avatarUrls) {
            this(thingId, kind, title, note, lead, done, minute, avatarUrls, null, false, null, false, null);
        }

        public TodayItem with(TodayAction button, boolean comesRound, TodayDue when) {
            return new TodayItem(
                    thingId,
                    kind,
                    title,
                    note,
                    lead,
                    done,
                    minute,
                    avatarUrls,
                    button,
                    comesRound,
                    when,
                    canTick,
                    sameAs);
        }

        /** Says whether the signed-in person may tick the line here (or take its tick away, when it is done). */
        public TodayItem tickedHere(boolean mayTick) {
            return new TodayItem(
                    thingId, kind, title, note, lead, done, minute, avatarUrls, action, repeats, due, mayTick, sameAs);
        }

        /** Says that this line is the same job as another thing: Today lists the two once. */
        public TodayItem alsoKeptAs(UUID otherThing) {
            return new TodayItem(
                    thingId,
                    kind,
                    title,
                    note,
                    lead,
                    done,
                    minute,
                    avatarUrls,
                    action,
                    repeats,
                    due,
                    canTick,
                    otherThing);
        }
    }

    /** A card in "New in the library" and its cousins: something that arrived lately. */
    record FreshCard(
            UUID thingId,
            ThingKind kind,
            String title,
            String note,
            @Schema(nullable = true) String imageUrl,

            @Schema(nullable = true, description = "A small label on the picture: 19 new")
            String pill) {}

    /**
     * A card at the top of Today that is more than a line in the day's list: whose turn it is to choose
     * tonight, a date both said yes to, what the kitty holds, the question of the week. A kind of circle's
     * own Today is mostly these.
     */
    record TodayCard(
            @Schema(
                    nullable = true,
                    description =
                            "Null for a card about something that isn't a thing here: someone's journey in Journey")
            UUID thingId,

            @Schema(nullable = true) ThingKind kind,

            @Schema(description = "A word the app can pick a look by: the template's code for a board, else the kind")
            String look,

            @Schema(description = "A 3D emoji for the card") String emoji,
            String title,

            @Schema(description = "The line under the title")
            String line,

            @Schema(nullable = true, description = "A number or a few words shown large: €64, 3 sleeps")
            String figure,

            @Schema(nullable = true) String imageUrl,

            @Schema(nullable = true, description = "What its button says, when it has one: Shake, Answer, Settle up")
            String action,

            @Schema(description = "Sorts the cards: lower comes first")
            int order) {}

    /** What is on for this person in this circle on this day, in any order. */
    default List<TodayItem> today(UUID me, UUID circleId, LocalDate day) {
        return List.of();
    }

    /** The cards this place puts at the top of Today for this person, a handful at most. */
    default List<TodayCard> cards(UUID me, UUID circleId, LocalDate day) {
        return List.of();
    }

    /** What arrived lately that this person may see, newest first, a handful at most. */
    default List<FreshCard> fresh(UUID me, UUID circleId) {
        return List.of();
    }
}

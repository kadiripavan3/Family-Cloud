package app.homeport.api.notify;

import app.homeport.api.thing.ThingKind;
import java.util.UUID;

/**
 * Someone asked the app to remind someone else of something: "Nudge" on a reminder they gave away, "Nudge"
 * next to whoever hasn't answered in find-a-date, "Remind" next to what someone owes in a split. The place it
 * happened in has written down that it was asked (so it can be shown, and isn't asked again too soon) and
 * publishes one of these as a Spring event. Whoever tells people things listens for it: the places build no
 * sending of their own.
 *
 * <p>It is published inside the transaction that wrote the nudge down, where there is one. Listen after that
 * transaction is through ({@code @TransactionalEventListener} with {@code fallbackExecution = true}), so
 * nobody is told about something that was taken back, and nothing outside is waited on with it open.
 *
 * @param circleId the circle it happened in
 * @param thingId the thing it is about (the reminder, the find-a-date board, the split): what opens from the message
 * @param thingKind that thing's kind, for the address the app opens ({@code /<kind>/<id>})
 * @param byMemberId who asks
 * @param toMemberId whom: a member of the same circle, who may be someone without a phone
 * @param title what the message is headed with: the thing's name
 * @param sentence the sentence to show, written for the person it goes to: "A gentle nudge from Nora."
 * @param code which nudge this is, one of the constants here
 * @param pushed true when the place has handed a push to their phones itself already (a reminder's nudge
 *     does, so that it can say when the phone couldn't be reached): keep it, but don't push it again
 */
public record Nudge(
        UUID circleId,
        UUID thingId,
        ThingKind thingKind,
        UUID byMemberId,
        UUID toMemberId,
        String title,
        String sentence,
        String code,
        boolean pushed) {

    /** "Nudge" on a reminder someone else has. */
    public static final String REMINDER = "reminder_nudge";

    /** "Nudge" next to someone who hasn't answered in find-a-date. */
    public static final String FIND_DATE = "find_date_nudge";

    /** "Remind" next to what someone owes in a split. */
    public static final String SPLIT = "split_remind";
}

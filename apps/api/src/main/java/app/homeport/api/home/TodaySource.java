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
            List<String> avatarUrls) {}

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

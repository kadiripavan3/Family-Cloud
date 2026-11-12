package app.homeport.api.digest;

import app.homeport.api.thing.ThingKind;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * What one place has to say about a person's week in a circle, for the Sunday summary: a number or two, the
 * week's best picture, what next week holds. Each place has one of these; the summary asks them all and
 * never knows what they keep. A place tells only what this person may see.
 *
 * <p>This is also where the other app comes in. "From Journey" on the summary is a {@link Section} that the
 * link with Journey brings ({@code JourneyDigest}) in a week in which something came through it.
 */
public interface DigestSource {

    /** One of the numbers across the summary: "86" over "photos". */
    record Stat(
            String figure,
            String label,

            @Schema(description = "Sorts the numbers: lower comes first")
            int order) {}

    /** The picture at the top: the week's most loved photo. */
    record Hero(
            UUID thingId,
            ThingKind kind,
            @Schema(nullable = true) String imageUrl,

            @Schema(description = "The pill on the picture: Most loved")
            String pill,

            String title,
            @Schema(nullable = true) String line) {}

    /** A row of the summary: something next week holds, or something from elsewhere. */
    record Row(
            @Schema(nullable = true) UUID thingId,
            @Schema(nullable = true) ThingKind kind,
            @Schema(nullable = true) String emoji,
            @Schema(nullable = true) String imageUrl,
            String title,
            String line,

            @Schema(nullable = true, description = "The day it is on, when it has one: rows are read in this order")
            LocalDate day) {}

    /** A group of rows under a title of its own: From Journey. */
    record Section(String title, List<Row> rows) {}

    /** What one place brings. Any part can be empty. */
    record Part(List<Stat> stats, Hero hero, List<Row> nextWeek, List<Section> sections) {

        public static Part nothing() {
            return new Part(List.of(), null, List.of(), List.of());
        }

        public static Part of(List<Stat> stats, Hero hero, List<Row> nextWeek) {
            return new Part(stats, hero, nextWeek, List.of());
        }
    }

    /**
     * This place's part of one person's week in one circle.
     *
     * @param from the Monday the week starts on
     * @param to the Sunday it ends on. Next week is the seven days after it.
     */
    Part week(UUID me, UUID circleId, LocalDate from, LocalDate to);
}

package app.homeport.api.activity;

import app.homeport.api.thing.ThingKind;
import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * How a kind of thing is drawn in a line of Activity when it has more to show than its title: a bill its
 * emoji, a photo or an album its picture. A place that has such a thing implements this and is found by
 * itself; Activity never looks into a place's tables.
 */
public interface LineLooks {

    record Look(
            @Schema(nullable = true) String emoji,
            @Schema(nullable = true) String imageUrl) {}

    /** The kinds of thing this can draw. */
    Set<ThingKind> kinds();

    /** The look of each of these things that has one. They are all of these kinds, and the viewer may see every one. */
    Map<UUID, Look> looks(List<UUID> thingIds, UUID me);
}

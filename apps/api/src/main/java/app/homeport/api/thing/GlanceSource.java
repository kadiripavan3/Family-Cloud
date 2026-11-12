package app.homeport.api.thing;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Where a thing stands, in a few words: "4 of 9 done", "€84 · due tomorrow", "Sat 5 Dec, 14:00". Shown
 * wherever things of mixed kinds are listed: a search result, a link from one thing to another, a person's
 * page, a live block in a page. Each kind that has something to say has one of these.
 */
public interface GlanceSource {

    ThingKind kind();

    /** The line for each of these things. They are all of this kind, and the viewer may see every one of them. */
    Map<UUID, String> glances(List<UUID> thingIds, UUID me);
}

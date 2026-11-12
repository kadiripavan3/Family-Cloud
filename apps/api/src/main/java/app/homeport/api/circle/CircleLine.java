package app.homeport.api.circle;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * A few words a place adds under a circle's name in the list of someone's circles: "you're owed €64" in the
 * circle switcher. The circle doesn't know the places; a place that has such a line implements this and is
 * found by itself, as a place brings its lines to Today through {@code TodaySource}.
 *
 * <p>It is asked for all of a person's circles at once (twenty at most), and answers only from what that
 * person may see.
 */
public interface CircleLine {

    /**
     * The line for each of these circles this place has something to say about, for this person. The words
     * follow others on the same line ("Friends · 5 people · you're owed €64"), so they start small.
     *
     * @param me the signed-in person, who is in every one of these circles
     * @return by circle id; a circle with nothing to say is left out
     */
    Map<UUID, String> lines(UUID me, List<UUID> circleIds);
}

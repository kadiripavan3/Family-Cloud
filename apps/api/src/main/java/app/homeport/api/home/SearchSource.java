package app.homeport.api.home;

import app.homeport.api.thing.Place;
import java.util.List;
import java.util.UUID;

/**
 * How one place answers a search inside what it keeps (the words of a page, the text in a scan). Titles are
 * searched for every kind without this; a source adds what only it can find.
 *
 * <p>A source is told who is looking, and looks only through what that person may see: its query joins
 * {@code things t} with {@code Rules.sees("t", ":me")} before its limit, so the handful it may return isn't
 * used up by things the person would never be shown (forty newer pages that are someone else's alone must
 * not hide the one page they may read). It also keeps its own secrets inside a thing the viewer may see: a
 * line of a list that is kept from them, a letter they haven't opened. Home checks every id once more
 * before it answers.
 */
public interface SearchSource {

    Place place();

    /** A match inside a thing, with the words around it to show under the title. */
    record Found(UUID thingId, String snippet) {}

    /**
     * @param me who is looking: the signed-in person
     * @param words what the person typed, as they typed it
     */
    List<Found> find(UUID circleId, UUID me, String words, int limit);
}

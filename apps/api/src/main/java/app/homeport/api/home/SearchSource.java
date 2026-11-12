package app.homeport.api.home;

import app.homeport.api.thing.Place;
import java.util.List;
import java.util.UUID;

/**
 * How one place answers a search inside what it keeps (the words of a page, the text in a scan). Titles are
 * searched for every kind without this; a source adds what only it can find.
 *
 * <p>A source is told who is asking, and looks only through what that person may see: its query joins
 * {@code things t} with {@code Rules.sees("t", ":me")}, so the handful it may return isn't used up by things
 * the person would never be shown, and a part of a thing that is kept from them (a line of a list hidden from
 * one person) is neither found nor quoted. Home checks every id once more before it answers.
 */
public interface SearchSource {

    Place place();

    /** A match inside a thing, with the words around it to show under the title. */
    record Found(UUID thingId, String snippet) {}

    /**
     * @param me the signed-in person who is searching
     * @param words what the person typed, as they typed it
     */
    List<Found> find(UUID me, UUID circleId, String words, int limit);
}

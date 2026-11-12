package app.homeport.api.home;

import app.homeport.api.thing.Place;
import java.util.List;
import java.util.UUID;

/**
 * How one place answers a search inside what it keeps (the words of a page, the text in a scan). Titles are
 * searched for every kind without this; a source adds what only it can find. It returns ids only: who may
 * see each one is checked afterwards, in one place, for all of them.
 */
public interface SearchSource {

    Place place();

    /** A match inside a thing, with the words around it to show under the title. */
    record Found(UUID thingId, String snippet) {}

    /** @param words what the person typed, as they typed it */
    List<Found> find(UUID circleId, String words, int limit);
}

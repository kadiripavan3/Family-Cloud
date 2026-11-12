package app.homeport.api.home;

import app.homeport.api.thing.Place;
import java.util.List;
import java.util.UUID;

/**
 * How one place answers a search inside what it keeps (the words of a page, the text in a scan). Titles are
 * searched for every kind without this; a source adds what only it can find. It returns ids only: who may
 * see each thing is checked afterwards, in one place, for all of them.
 *
 * <p>What a source is trusted with is its own secrets inside a thing the viewer may see: a line of a list
 * that is kept from them, a letter they haven't opened. It is told who is looking, and finds for that
 * person only what they may read there.
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

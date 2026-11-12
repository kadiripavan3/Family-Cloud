package app.homeport.api.guest;

import app.homeport.api.thing.ThingKind;
import java.util.List;
import java.util.UUID;

/**
 * How one kind of thing is shown to a guest on a pass. Each kind that can go on a pass has one; a kind
 * without one can't be put on a pass. A guest sees less than a member: the words of a page, a photo, a door
 * code once, never a password itself.
 */
public interface GuestView {

    ThingKind kind();

    /** What the guest reads under the thing's title. Called only for a thing that is on an open pass. */
    Card show(UUID thingId);

    /**
     * @param label what it is, in a word or two: "Page", "Door code"
     * @param text what the guest reads, or null when the title says it all
     * @param imageUrls pictures the guest is shown under it: a photo, the photos of an album
     */
    record Card(String label, String text, List<String> imageUrls) {

        public Card(String label, String text) {
            this(label, text, List.of());
        }
    }
}

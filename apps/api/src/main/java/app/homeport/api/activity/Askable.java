package app.homeport.api.activity;

import app.homeport.api.thing.ThingKind;
import java.util.UUID;

/**
 * A kind of thing someone can know exists without being able to open it, and so can ask its owner to see:
 * today, an item in the Vault. The place that has such a kind implements this. Asking, answering and the
 * lines in Activity are the same for every kind; what "can't open" means is the place's own business.
 */
public interface Askable {

    ThingKind kind();

    /** Where the thing is, to end "asks to see Bank card PIN …": "in the Vault". */
    String where();

    /** True when this member, who may see that the thing exists, has no way to open it right now. */
    boolean shutFor(UUID thingId, UUID memberId);
}

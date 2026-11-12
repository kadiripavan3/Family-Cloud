package app.homeport.api.notify;

/**
 * News that isn't one row per person when it happens, because working out who hears of it would slow down
 * whoever caused it (a batch of photos, told to everyone who may see one of them). Whoever keeps such news
 * implements this; the delivery job asks for it to be turned into pushes just before it sends.
 */
public interface PushFeed {

    /** Turns what is due to be told into pushes in the {@link Outbox}. Returns how many were told. */
    int announce();
}

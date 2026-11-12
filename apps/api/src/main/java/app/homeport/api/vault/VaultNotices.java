package app.homeport.api.vault;

import app.homeport.api.notify.Outbox;
import app.homeport.api.notify.Push;
import app.homeport.api.notify.PushDelivery;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * What the Vault has to tell someone at once: someone asked for your Vault, a recovery of your Vault was
 * started, someone asks you to be their helper. Whoever has the news says it here in the same transaction as
 * the reason for it; it goes into the one outbox every push leaves through ({@link Outbox}), and is sent to
 * every phone of that person a few seconds later, with no transaction open while the push service is called.
 *
 * <p>These are about someone's safety, so the switch for everyday pushes doesn't silence them. They say who
 * and what, never anything that is kept in the Vault. The app shows the same news from the Vault's own state
 * ({@code GET /v1/vault/attention}), so nothing depends on a push arriving.
 */
@Component
public class VaultNotices {

    private final Outbox outbox;
    private final PushDelivery delivery;

    VaultNotices(Outbox outbox, PushDelivery delivery) {
        this.outbox = outbox;
        this.delivery = delivery;
    }

    /**
     * Puts news for one person in line.
     *
     * @param url where in the app the push opens, such as {@code /vault/emergency}
     */
    public void tell(UUID userId, String kind, String title, String body, String url) {
        outbox.tell(Push.safety(userId, kind, title, body, url));
    }

    /** Sends what is waiting, without waiting for the next half minute. Returns how many messages were handled. */
    public int deliverDue() {
        return delivery.deliverDue();
    }
}

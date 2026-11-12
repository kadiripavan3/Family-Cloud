package app.homeport.api.vault;

import app.homeport.api.notify.DeviceStore;
import app.homeport.api.notify.PushMessage;
import app.homeport.api.notify.PushSender;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/**
 * What the Vault has to tell someone at once: someone asked for your Vault, a recovery of your Vault was
 * started, someone asks you to be their helper. Whoever has the news writes it here in the same transaction
 * as the reason for it; a job pushes what is waiting to every phone of that person a few seconds later, with
 * no transaction open while the push service is called.
 *
 * <p>These are about someone's safety, so the switch for everyday pushes doesn't silence them. They say who
 * and what, never anything that is kept in the Vault. The app shows the same news from the Vault's own state
 * ({@code GET /v1/vault/attention}), so nothing depends on a push arriving.
 */
@Component
public class VaultNotices {

    private static final Logger log = LoggerFactory.getLogger(VaultNotices.class);
    static final int TRIES = 6;

    private record Waiting(UUID id, UUID userId, String kind, String title, String body, String url, int attempts) {}

    private final JdbcClient jdbc;
    private final DeviceStore devices;
    private final PushSender pushes;

    VaultNotices(JdbcClient jdbc, DeviceStore devices, PushSender pushes) {
        this.jdbc = jdbc;
        this.devices = devices;
        this.pushes = pushes;
    }

    /**
     * Puts news for one person in line.
     *
     * @param url where in the app the push opens, such as {@code /vault/emergency}
     */
    public void tell(UUID userId, String kind, String title, String body, String url) {
        jdbc.sql(
                        "insert into vault_notices (user_id, kind, title, body, url) values (:user, :kind, :title, :body, :url)")
                .param("user", userId)
                .param("kind", kind)
                .param("title", title)
                .param("body", body)
                .param("url", url)
                .update();
    }

    /** Pushes what is waiting to every phone of the person it is for. Returns how many pushes went out. */
    public int deliverDue() {
        List<Waiting> due = take();
        if (due.isEmpty()) {
            return 0;
        }
        Map<UUID, List<String>> phones =
                devices.tokensOf(due.stream().map(Waiting::userId).distinct().toList());
        int sent = 0;
        for (Waiting one : due) {
            List<PushMessage> messages = new ArrayList<>();
            for (String token : phones.getOrDefault(one.userId(), List.of())) {
                messages.add(new PushMessage(token, one.title(), one.body(), one.url(), one.kind()));
            }
            try {
                for (int from = 0; from < messages.size(); from += PushSender.PER_CALL) {
                    PushSender.Handed handed =
                            pushes.send(messages.subList(from, Math.min(from + PushSender.PER_CALL, messages.size())));
                    devices.forget(handed.gone());
                }
                done(one.id()); // someone with no phone registered sees it in the app instead
                sent += messages.size();
            } catch (RuntimeException later) {
                if (one.attempts() >= TRIES) {
                    log.error(
                            "A Vault notice for {} couldn't be pushed after {} tries: {}",
                            one.userId(),
                            TRIES,
                            later.toString());
                    done(one.id());
                } else {
                    log.warn("A Vault notice for {} will be tried again: {}", one.userId(), later.toString());
                }
            }
        }
        return sent;
    }

    /**
     * Takes notices that are due. Each is put off as it is taken, a little longer each time, so another copy of
     * the API doesn't take it too and one that fails is tried again later.
     */
    private List<Waiting> take() {
        return jdbc.sql("""
            update vault_notices set attempts = attempts + 1,
              next_try_at = now() + make_interval(mins => least(power(2, attempts)::int, 60))
            where id in (select id from vault_notices where sent_at is null and next_try_at <= now()
                         order by next_try_at limit 100 for update skip locked)
            returning id, user_id, kind, title, body, url, attempts
            """)
                .query((rs, n) -> new Waiting(
                        rs.getObject("id", UUID.class),
                        rs.getObject("user_id", UUID.class),
                        rs.getString("kind"),
                        rs.getString("title"),
                        rs.getString("body"),
                        rs.getString("url"),
                        rs.getInt("attempts")))
                .list();
    }

    private void done(UUID id) {
        jdbc.sql("update vault_notices set sent_at = now() where id = :id")
                .param("id", id)
                .update();
    }

    /** A notice that went out a month ago is of no use to anyone. */
    public int forgetOld() {
        return jdbc.sql("delete from vault_notices where sent_at < now() - interval '30 days'")
                .update();
    }
}

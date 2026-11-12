package app.homeport.api.plan;

import app.homeport.api.common.Rules;
import app.homeport.api.notify.DeviceStore;
import app.homeport.api.notify.PushMessage;
import app.homeport.api.notify.PushSender;
import app.homeport.api.notify.PushSender.Handed;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/**
 * Pushes about one event or reminder: who may hear of it, and handing them to the push service. A person
 * hears of a thing only if they may see it at that moment and haven't switched notifications off.
 */
@Component
class PlanPushes {

    /** A person's newest phones get the push; nobody has more than a handful. */
    static final int PHONES_EACH = 10;

    private final JdbcClient jdbc;
    private final DeviceStore devices;
    private final PushSender sender;

    PlanPushes(JdbcClient jdbc, DeviceStore devices, PushSender sender) {
        this.jdbc = jdbc;
        this.devices = devices;
        this.sender = sender;
    }

    /**
     * Which of these members a push about this thing may go to right now: the ones with a sign-in of their
     * own who may see it and want to hear. Their user ids.
     */
    List<UUID> mayHear(UUID thingId, Collection<UUID> memberIds) {
        if (memberIds.isEmpty()) {
            return List.of();
        }
        return jdbc.sql("""
            select distinct m.user_id from members m join things t on t.id = :thing and t.circle_id = m.circle_id
            where m.id in (:members) and m.user_id is not null and m.status = 'joined'
              and coalesce((select s.notify_activity from settings s where s.user_id = m.user_id), true)
              and\s""" + Rules.sees("t", "m.user_id"))
                .param("thing", thingId)
                .param("members", memberIds)
                .query(UUID.class)
                .list();
    }

    /** One push for each phone of these people. */
    List<PushMessage> messages(List<UUID> userIds, String title, String body, String url, String kind) {
        Map<UUID, List<String>> tokens = devices.tokensOf(userIds);
        List<PushMessage> messages = new ArrayList<>();
        for (UUID user : userIds) {
            tokens.getOrDefault(user, List.of()).stream()
                    .limit(PHONES_EACH)
                    .forEach(token -> messages.add(new PushMessage(token, title, body, url, kind)));
        }
        return messages;
    }

    /**
     * Hands pushes to the push service, a call's worth at a time. Never call this with a transaction open:
     * the service is another company's server. Throws when the service can't be reached.
     */
    void send(List<PushMessage> messages) {
        for (int from = 0; from < messages.size(); from += PushSender.PER_CALL) {
            Handed handed = sender.send(messages.subList(from, Math.min(from + PushSender.PER_CALL, messages.size())));
            devices.forget(handed.gone());
        }
    }
}

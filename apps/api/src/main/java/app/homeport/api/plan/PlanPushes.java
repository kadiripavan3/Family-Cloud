package app.homeport.api.plan;

import app.homeport.api.common.Rules;
import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/**
 * Who may hear of one event or reminder when it is due: the people with a sign-in of their own who may see
 * it at that moment and haven't switched notifications off. (The outbox checks the same again when it
 * sends; asking here first keeps rows out of it that would only be dropped.)
 */
@Component
class PlanPushes {

    private final JdbcClient jdbc;

    PlanPushes(JdbcClient jdbc) {
        this.jdbc = jdbc;
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
}

package app.homeport.api.notify;

import app.homeport.api.common.Rules;
import app.homeport.api.common.Sql;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/**
 * The outbox of pushes: one row per message for one person. Rows are written here when something happens
 * (in the same transaction as the thing itself), and read here when they are due to be sent. Whether the
 * person may still be told is decided when it is sent ({@link #lockDue}), because a lot can change in the
 * minutes in between.
 */
@Repository
public class OutboxStore {

    /**
     * A message that is due, in the words this person gets, and whether it may still be sent.
     *
     * @param hidesDetails true when this person hides details: a batch that is worded afresh keeps to that
     */
    public record Due(
            UUID id,
            UUID userId,
            String kind,
            String title,
            String body,
            String url,
            UUID lineId,
            Instant since,
            boolean hidesDetails,
            boolean deliverable) {}

    /** Someone of a circle who has a sign-in of their own and so can be pushed to, with the time zone of their newest phone. */
    public record Reachable(UUID memberId, UUID userId, String name, ZoneId zone) {}

    private final JdbcClient jdbc;

    OutboxStore(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /** Those of these members who have joined with a sign-in of their own. Children, pets and people who left have no phone to tell. */
    public Map<UUID, Reachable> reachable(Collection<UUID> memberIds) {
        if (memberIds.isEmpty()) {
            return Map.of();
        }
        return jdbc
                .sql("""
                    select m.id, m.user_id, m.name, (select d.time_zone from devices d where d.user_id = m.user_id
                                                     order by d.seen_at desc limit 1) as zone
                    from members m where m.id in (:members) and m.user_id is not null and m.status = 'joined'
                    """)
                .param("members", memberIds)
                .query((rs, n) -> new Reachable(
                        rs.getObject("id", UUID.class),
                        rs.getObject("user_id", UUID.class),
                        rs.getString("name"),
                        zone(rs.getString("zone"))))
                .list()
                .stream()
                .collect(Collectors.toMap(Reachable::memberId, Function.identity()));
    }

    /** The name of a member, whoever they are: for "Lea reminds you". */
    public String nameOf(UUID memberId) {
        return jdbc.sql("select name from members where id = :id")
                .param("id", memberId)
                .query(String.class)
                .optional()
                .orElse("Someone");
    }

    private static ZoneId zone(String name) {
        try {
            return name == null ? ZoneOffset.UTC : ZoneId.of(name);
        } catch (RuntimeException unknown) {
            return ZoneOffset.UTC;
        }
    }

    /**
     * Queues one push, unless it is one that is never pushed: the person's own change, a second of its kind
     * about the same thing within the hour, or a key that was told before. True when a row was written.
     */
    boolean insert(Push push) {
        return jdbc.sql("""
            insert into pushes (user_id, kind, circle_id, thing_id, actor_id, line_id, since, title, body,
              quiet_title, quiet_body, url, always, once_key, send_after)
            select :user, :kind, cast(:circle as uuid), cast(:thing as uuid), cast(:actor as uuid), cast(:line as uuid),
              cast(:since as timestamptz), :title, :body, cast(:quietTitle as text), cast(:quietBody as text), :url,
              :always, cast(:once as text), coalesce(cast(:after as timestamptz), now())
            where not exists (select 1 from members a where a.id = cast(:actor as uuid) and a.user_id = :user)
              and (:always or cast(:once as text) is not null or cast(:thing as uuid) is null or not exists (
                    select 1 from pushes told where told.user_id = :user and told.kind = :kind
                      and told.thing_id = cast(:thing as uuid) and told.status <> 'skipped'
                      and told.created_at > now() - interval '1 hour'))
            on conflict (once_key) do nothing
            """)
                        .param("user", push.userId())
                        .param("kind", push.kind())
                        .param("circle", text(push.circleId()))
                        .param("thing", text(push.thingId()))
                        .param("actor", text(push.actorId()))
                        .param("line", text(push.lineId()))
                        .param("since", Sql.timestamp(push.since()))
                        .param("title", push.title())
                        .param("body", push.body())
                        .param("quietTitle", push.quietTitle())
                        .param("quietBody", push.quietBody())
                        .param("url", push.url())
                        .param("always", push.always())
                        .param("once", push.onceKey())
                        .param("after", Sql.timestamp(push.sendAfter()))
                        .update()
                > 0;
    }

    private static String text(UUID id) {
        return id == null ? null : id.toString();
    }

    /**
     * The messages that are due, locked for this sender until the end of the (short) transaction it is called
     * in: another copy of the API skips them and takes the next ones. Each comes in the words this person
     * gets (the quiet ones for someone who hides details) and says whether it may still be sent: they
     * haven't switched pushes off since, they are still in the circle and haven't muted it, and they may
     * still see the thing it is about.
     */
    public List<Due> lockDue(int limit) {
        return jdbc.sql("""
            select p.id, p.user_id, p.kind, p.url, p.line_id, p.since, coalesce(s.hide_details, false) as hides,
              case when coalesce(s.hide_details, false) and p.quiet_title is not null then p.quiet_title else p.title end as title,
              case when coalesce(s.hide_details, false) and p.quiet_title is not null then coalesce(p.quiet_body, '') else p.body end as body,
              ((p.always or case p.kind when 'weekly_summary' then coalesce(s.weekly_summary, true)
                                         else coalesce(s.notify_activity, true) end)
               and (p.circle_id is null or exists (
                     select 1 from members m where m.circle_id = p.circle_id and m.user_id = p.user_id
                       and m.status = 'joined' and (p.always or not m.muted)))
               and (p.thing_id is null or exists (select 1 from things t where t.id = p.thing_id and %s))) as deliverable
            from pushes p left join settings s on s.user_id = p.user_id
            where p.status = 'pending' and p.send_after <= now()
            order by p.send_after, p.id
            limit :limit
            for update of p skip locked
            """.formatted(Rules.sees("t", "p.user_id")))
                .param("limit", limit)
                .query((rs, n) -> new Due(
                        rs.getObject("id", UUID.class),
                        rs.getObject("user_id", UUID.class),
                        rs.getString("kind"),
                        rs.getString("title"),
                        rs.getString("body"),
                        rs.getString("url"),
                        rs.getObject("line_id", UUID.class),
                        Sql.instant(rs, "since"),
                        rs.getBoolean("hides"),
                        rs.getBoolean("deliverable")))
                .list();
    }

    /** Taken by this sender: the push service is about to be called for these. */
    public void markSending(Collection<UUID> ids) {
        mark(ids, "status = 'sending', claimed_at = now()");
    }

    public void markSent(Collection<UUID> ids) {
        mark(ids, "status = 'sent', sent_at = now()");
    }

    /** Not sent and never will be: switched off, muted, no longer visible, or no phone to send it to. */
    public void markSkipped(Collection<UUID> ids) {
        mark(ids, "status = 'skipped'");
    }

    /** The push service couldn't be reached: try again later, a little later each time, and give up after a few tries. */
    public void retryLater(Collection<UUID> ids, int maxAttempts) {
        if (!ids.isEmpty()) {
            jdbc.sql("""
                update pushes set attempts = attempts + 1, claimed_at = null,
                  status = case when attempts + 1 >= :max then 'skipped' else 'pending' end,
                  send_after = now() + make_interval(mins => 5 * (attempts + 1))
                where id in (:ids)
                """).param("ids", ids).param("max", maxAttempts).update();
        }
    }

    /**
     * Messages that were taken long ago and never marked as sent: the API stopped in between. They are tried
     * again, like any other message that couldn't be sent. Returns how many there were.
     */
    public int putBackStuck(Duration after, int maxAttempts) {
        List<UUID> stuck = jdbc.sql(
                        "select id from pushes where status = 'sending' and claimed_at < now() - make_interval(secs => :after)")
                .param("after", after.toSeconds())
                .query(UUID.class)
                .list();
        retryLater(stuck, maxAttempts);
        return stuck.size();
    }

    /** Messages that were sent or skipped long ago are of no use to anyone. Returns how many were removed. */
    public int forgetOlderThan(int days) {
        int gone = 0;
        int step;
        do {
            // A few thousand at a time, so no single statement runs long however much has piled up.
            step = jdbc.sql("""
                delete from pushes where id in (
                  select id from pushes
                  where status <> 'pending' and created_at < now() - make_interval(days => :days) limit 5000)
                """).param("days", days).update();
            gone += step;
        } while (step == 5000);
        return gone;
    }

    private void mark(Collection<UUID> ids, String change) {
        if (!ids.isEmpty()) {
            jdbc.sql("update pushes set " + change + " where id in (:ids)")
                    .param("ids", ids)
                    .update();
        }
    }
}

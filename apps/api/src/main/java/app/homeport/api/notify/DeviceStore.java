package app.homeport.api.notify;

import java.time.Duration;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** Reads and writes the devices that asked for pushes. */
@Repository
public class DeviceStore {

    /** A person whose newest device is in this time zone, with the hour they want reminders at. */
    private final JdbcClient jdbc;

    DeviceStore(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Remembers a device for a person. A phone has one token: if someone else was signed in on it before, it
     * is theirs no longer.
     */
    public void register(UUID userId, String token, DevicePlatform platform, String timeZone) {
        jdbc.sql("""
            insert into devices (token, user_id, platform, time_zone) values (:token, :user, :platform, :zone)
            on conflict (token) do update set user_id = excluded.user_id, platform = excluded.platform,
              time_zone = excluded.time_zone, seen_at = now()
            """)
                .param("token", token)
                .param("user", userId)
                .param("platform", platform.code())
                .param("zone", timeZone)
                .update();
    }

    /** Keeps a person's newest phones and forgets the rest. */
    public void keepNewest(UUID userId, int howMany) {
        jdbc.sql("""
            delete from devices where user_id = :user and token not in (
              select token from devices where user_id = :user order by seen_at desc, token limit :keep)
            """).param("user", userId).param("keep", howMany).update();
    }

    /** Forgets a device, if it is this person's. */
    public void forget(UUID userId, String token) {
        jdbc.sql("delete from devices where token = :token and user_id = :user")
                .param("token", token)
                .param("user", userId)
                .update();
    }

    /** Forgets devices the push service says no longer exist. */
    public void forget(Collection<String> tokens) {
        if (!tokens.isEmpty()) {
            jdbc.sql("delete from devices where token in (:tokens)")
                    .param("tokens", tokens)
                    .update();
        }
    }

    /** Each person's device tokens. */
    public Map<UUID, List<String>> tokensOf(Collection<UUID> userIds) {
        if (userIds.isEmpty()) {
            return Map.of();
        }
        record Row(UUID userId, String token) {}
        return jdbc
                .sql("select user_id, token from devices where user_id in (:users) order by seen_at desc")
                .param("users", userIds)
                .query((rs, n) -> new Row(rs.getObject("user_id", UUID.class), rs.getString("token")))
                .list()
                .stream()
                .collect(Collectors.groupingBy(Row::userId, Collectors.mapping(Row::token, Collectors.toList())));
    }

    /** Remembers what the push service gave back for each push it accepted, to ask about later. */
    public void remember(List<PushSender.Ticket> tickets) {
        for (PushSender.Ticket ticket : tickets) {
            jdbc.sql("insert into push_tickets (id, token) values (:id, :token) on conflict do nothing")
                    .param("id", ticket.id())
                    .param("token", ticket.token())
                    .update();
        }
    }

    /** Tickets old enough for the push service to know what became of them, oldest first: ticket id to device token. */
    public Map<String, String> ticketsOlderThan(Duration age, int limit) {
        record Row(String id, String token) {}
        return jdbc
                .sql("""
                    select id, token from push_tickets where created_at < now() - make_interval(secs => :age)
                    order by created_at limit :limit
                    """)
                .param("age", age.toSeconds())
                .param("limit", limit)
                .query((rs, n) -> new Row(rs.getString("id"), rs.getString("token")))
                .list()
                .stream()
                .collect(Collectors.toMap(Row::id, Row::token, (first, second) -> first, LinkedHashMap::new));
    }

    /** These tickets have been answered (or are too old to ever be). Returns how many were removed. */
    public int forgetTickets(Collection<String> ids) {
        return ids.isEmpty()
                ? 0
                : jdbc.sql("delete from push_tickets where id in (:ids)")
                        .param("ids", ids)
                        .update();
    }

    /** The push service keeps its answers for about a day; a ticket older than that will never be answered. */
    public int forgetTicketsOlderThan(Duration age) {
        return jdbc.sql("delete from push_tickets where created_at < now() - make_interval(secs => :age)")
                .param("age", age.toSeconds())
                .update();
    }
}

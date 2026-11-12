package app.homeport.api.plan;

import app.homeport.api.common.Keyset;
import app.homeport.api.common.Rules;
import app.homeport.api.common.Sql;
import app.homeport.api.thing.ThingStore;
import app.homeport.api.thing.ThingStore.ThingRow;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** Reads and writes goals and what was put into them. Who may read one is decided by the thing it is. */
@Repository
public class GoalStore {

    /** What a goal has besides its name. Money is in cents. */
    public record GoalRow(
            UUID id,
            String blurb,
            String emoji,
            String coverKey,
            GoalUnit unit,
            String currency,
            String unitWords,
            long target,
            HowFar how,
            UUID stepsListId,
            GoalSource sourceKind,
            String sourceRef,
            String sourceWords,
            LocalDate startsOn,
            LocalDate targetOn) {}

    /** A goal together with the thing it is, as one viewer sees it. */
    public record Goal(ThingRow thing, GoalRow detail) {}

    /** Something someone put in (or took out, when the amount is below zero). */
    public record EntryRow(
            UUID id, UUID goalId, UUID memberId, long amount, String note, LocalDate onDay, Instant createdAt) {}

    static final String COLUMNS = """
        g.blurb, g.emoji, cm.storage_key as cover_key, g.unit, g.currency, g.unit_words, g.target, g.how,
        g.steps_list_id, g.source_kind, g.source_ref, g.source_words, g.starts_on, g.target_on\s""";

    static final String TABLES = """
        from things t join goals g on g.thing_id = t.id
        left join media cm on cm.id = g.cover_media_id and cm.status = 'ready'\s""";

    private final JdbcClient jdbc;

    GoalStore(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    static GoalRow row(ResultSet rs) throws SQLException {
        return new GoalRow(
                rs.getObject("id", UUID.class),
                rs.getString("blurb"),
                rs.getString("emoji"),
                rs.getString("cover_key"),
                GoalUnit.read(rs.getString("unit")),
                rs.getString("currency"),
                rs.getString("unit_words"),
                rs.getLong("target"),
                HowFar.read(rs.getString("how")),
                rs.getObject("steps_list_id", UUID.class),
                GoalSource.read(rs.getString("source_kind")),
                rs.getString("source_ref"),
                rs.getString("source_words"),
                rs.getObject("starts_on", LocalDate.class),
                rs.getObject("target_on", LocalDate.class));
    }

    private static EntryRow entry(ResultSet rs, int n) throws SQLException {
        return new EntryRow(
                rs.getObject("id", UUID.class),
                rs.getObject("thing_id", UUID.class),
                rs.getObject("member_id", UUID.class),
                rs.getLong("amount"),
                rs.getString("note"),
                rs.getObject("on_day", LocalDate.class),
                Sql.instant(rs, "created_at"));
    }

    public void insert(UUID id, GoalRow g, UUID coverMediaId) {
        bind(jdbc.sql("""
            insert into goals (thing_id, blurb, emoji, cover_media_id, unit, currency, unit_words, target, how,
              steps_list_id, source_kind, source_ref, source_words, starts_on, target_on)
            values (:id, :blurb, :emoji, :cover, :unit, :currency, :unit_words, :target, :how, :steps, :source_kind,
              :source_ref, :source_words, :starts_on, :target_on)
            on conflict (thing_id) do nothing
            """), id, g).param("cover", coverMediaId).update();
    }

    /** Writes everything about a goal except its picture, which only changes when asked. */
    public void save(UUID id, GoalRow g, boolean changeCover, UUID coverMediaId) {
        bind(jdbc.sql("""
            update goals set blurb = :blurb, emoji = :emoji, unit = :unit, currency = :currency, unit_words = :unit_words,
              target = :target, how = :how, steps_list_id = :steps, source_kind = :source_kind, source_ref = :source_ref,
              source_words = :source_words, starts_on = :starts_on, target_on = :target_on,
              cover_media_id = case when :change_cover then cast(:cover as uuid) else cover_media_id end
            where thing_id = :id
            """), id, g)
                .param("change_cover", changeCover)
                .param("cover", coverMediaId == null ? null : coverMediaId.toString())
                .update();
    }

    private static JdbcClient.StatementSpec bind(JdbcClient.StatementSpec sql, UUID id, GoalRow g) {
        return sql.param("id", id)
                .param("blurb", g.blurb())
                .param("emoji", g.emoji())
                .param("unit", g.unit().code())
                .param("currency", g.currency())
                .param("unit_words", g.unitWords())
                .param("target", g.target())
                .param("how", g.how().code())
                .param("steps", g.stepsListId())
                .param(
                        "source_kind",
                        g.sourceKind() == null ? null : g.sourceKind().code())
                .param("source_ref", g.sourceRef())
                .param("source_words", g.sourceWords())
                .param("starts_on", g.startsOn())
                .param("target_on", g.targetOn());
    }

    /** The goal's own details. Who may see it is checked first, through the thing. */
    public Optional<GoalRow> find(UUID id) {
        return jdbc.sql("select t.id, " + COLUMNS + TABLES + " where t.id = :id")
                .param("id", id)
                .query((rs, n) -> row(rs))
                .optional();
    }

    /** The goals of a circle the viewer may see, in the order they were made. A hundred at most. */
    public List<Goal> in(UUID circleId, UUID me) {
        return jdbc.sql("select " + ThingStore.COLUMNS + ", " + COLUMNS + TABLES
                        + " where t.circle_id = :circle and t.kind = 'goal' and " + Rules.sees("t", ":me")
                        + " order by t.created_at, t.id limit 100")
                .param("circle", circleId)
                .param("me", me)
                .query((rs, n) -> new Goal(ThingStore.row(rs, n), row(rs)))
                .list();
    }

    /** These goals, as far as the viewer may see them. */
    public List<Goal> findAll(List<UUID> ids, UUID me) {
        if (ids.isEmpty()) {
            return List.of();
        }
        return jdbc.sql("select " + ThingStore.COLUMNS + ", " + COLUMNS + TABLES + " where t.id in (:ids) and "
                        + Rules.sees("t", ":me"))
                .param("ids", ids)
                .param("me", me)
                .query((rs, n) -> new Goal(ThingStore.row(rs, n), row(rs)))
                .list();
    }

    // ---------- what was put in ----------

    /** What was put into each of these goals, all together. */
    public Map<UUID, Long> sums(List<UUID> goalIds) {
        Map<UUID, Long> sums = new HashMap<>();
        if (goalIds.isEmpty()) {
            return sums;
        }
        jdbc.sql("select thing_id, sum(amount) as total from goal_entries where thing_id in (:ids) group by thing_id")
                .param("ids", goalIds)
                .query((rs, n) -> sums.put(rs.getObject("thing_id", UUID.class), rs.getLong("total")))
                .list();
        return sums;
    }

    /** Who put something into each of these goals, whoever began first coming first. */
    public Map<UUID, List<UUID>> givers(List<UUID> goalIds) {
        Map<UUID, List<UUID>> givers = new LinkedHashMap<>();
        if (goalIds.isEmpty()) {
            return givers;
        }
        jdbc.sql("""
            select thing_id, member_id from goal_entries where thing_id in (:ids) and member_id is not null and amount > 0
            group by thing_id, member_id order by thing_id, min(on_day), min(created_at), member_id
            """)
                .param("ids", goalIds)
                .query((rs, n) -> givers.computeIfAbsent(rs.getObject("thing_id", UUID.class), id -> new ArrayList<>())
                        .add(rs.getObject("member_id", UUID.class)))
                .list();
        return givers;
    }

    /** Adds what someone put in. Sending the same clientId again adds nothing and returns the row added the first time. */
    public UUID addEntry(UUID goalId, UUID memberId, long amount, String note, LocalDate day, UUID clientId) {
        return jdbc.sql("""
            insert into goal_entries (id, thing_id, member_id, amount, note, on_day, client_id)
            values (:id, :goal, :member, :amount, :note, :day, :client)
            on conflict (thing_id, client_id) do update set client_id = excluded.client_id
            returning id
            """)
                .param("id", UUID.randomUUID())
                .param("goal", goalId)
                .param("member", memberId)
                .param("amount", amount)
                .param("note", note)
                .param("day", day)
                .param("client", clientId)
                .query(UUID.class)
                .single();
    }

    public Optional<EntryRow> entry(UUID entryId) {
        return jdbc.sql("select * from goal_entries where id = :id")
                .param("id", entryId)
                .query(GoalStore::entry)
                .optional();
    }

    public void removeEntry(UUID entryId) {
        jdbc.sql("delete from goal_entries where id = :id").param("id", entryId).update();
    }

    /** What was put into a goal, the latest day first, a page at a time. */
    public List<EntryRow> entries(UUID goalId, Keyset page) {
        return jdbc.sql("""
            select * from goal_entries where thing_id = :goal
              and (cast(:day as date) is null
                   or (on_day, created_at, id) < (cast(:day as date), cast(:at as timestamptz), cast(:id as uuid)))
            order by on_day desc, created_at desc, id desc limit :limit
            """)
                .param("goal", goalId)
                .param("day", page.first() ? null : day(page))
                .param("at", page.first() ? null : Sql.timestamp(page.instant(1)))
                .param("id", page.first() ? null : page.uuid(2).toString())
                .param("limit", page.fetch())
                .query(GoalStore::entry)
                .list();
    }

    private static String day(Keyset page) {
        try {
            return LocalDate.parse(page.text(0)).toString();
        } catch (RuntimeException notADay) {
            throw Keyset.badCursor();
        }
    }

    /** What was put in during each month of a year: twelve numbers, January first. */
    public List<Long> months(UUID goalId, int year) {
        long[] months = new long[12];
        jdbc.sql("""
            select extract(month from on_day)::int as month, sum(amount) as total from goal_entries
            where thing_id = :goal and on_day >= make_date(cast(:year as int), 1, 1)
              and on_day < make_date(cast(:year as int) + 1, 1, 1)
            group by 1
            """)
                .param("goal", goalId)
                .param("year", year)
                .query((rs, n) -> months[rs.getInt("month") - 1] = rs.getLong("total"))
                .list();
        return java.util.Arrays.stream(months).boxed().toList();
    }
}

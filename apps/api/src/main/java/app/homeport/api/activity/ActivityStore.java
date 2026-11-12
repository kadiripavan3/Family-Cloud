package app.homeport.api.activity;

import app.homeport.api.activity.ActivityLog.Happened;
import app.homeport.api.common.Codes;
import app.homeport.api.common.Keyset;
import app.homeport.api.common.Rules;
import app.homeport.api.common.Sql;
import app.homeport.api.thing.Place;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Reads and writes the lines of Activity. Writing is one statement per line. Reading is where the promise
 * is kept: every query here that reads lines for someone shows a line about a thing only when
 * {@link Rules#sees} says that person may see the thing now.
 */
@Repository
public class ActivityStore {

    private static final JsonMapper JSON = new JsonMapper();

    /**
     * Lines read as one: everything of one kind that happened to one thing on one day, by anyone but the
     * reader, and said in the same words. Most are a single line; "Alex and Mia changed Groceries" is two.
     *
     * @param id the newest line's id: what the list is keyed and paged by
     * @param memberIds who did it, whoever was last first, each once
     * @param counts the lines' numbers added up
     */
    public record Folded(
            UUID id,
            ActivityKind kind,
            UUID thingId,
            LocalDate day,
            Instant at,
            List<UUID> memberIds,
            String who,
            String words,
            boolean namesThing,
            String note,
            Map<String, Long> counts,
            List<UUID> lineIds,
            UUID askId) {}

    /** Someone a line names, whether they are still in the circle or not. */
    public record Who(UUID memberId, UUID userId, String name, String avatarKey) {}

    /** How much of a batch one reader may see, and a few of it to name it by, newest first. */
    public record Batch(UUID lineId, int count, List<UUID> some) {}

    /** A burst of photos whose moment to be told has come. */
    public record Burst(UUID lineId, UUID circleId, UUID memberId, Instant since) {}

    private final JdbcClient jdbc;

    ActivityStore(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    // ---------- writing ----------

    /**
     * Keeps a line, or counts an existing one of the same person, thing, kind and day up. Nothing is kept
     * for a thing only its owner can see. Returns the line's id, or null when nothing was kept.
     */
    UUID insert(Happened h, UUID about, String foldKey, LocalDate day, Instant at) {
        return jdbc.sql("""
            insert into activity (id, circle_id, kind, member_id, who, thing_id, place, shown_to, only_for, words,
              names_thing, note, counts, day, fold_key, at, ask_id)
            select :id, :circle, :kind, cast(:member as uuid), :who, cast(:thing as uuid),
              (select t.place from things t where t.id = cast(:about as uuid)), :shown, cast(:only as uuid), :words,
              :names, :note, cast(:counts as jsonb), :day, :fold, :at, cast(:ask as uuid)
            where cast(:about as uuid) is null
               or exists (select 1 from things t where t.id = cast(:about as uuid) and t.audience <> 'me')
            on conflict (fold_key) do update set at = greatest(activity.at, excluded.at),
              words = case when excluded.words <> '' then excluded.words else activity.words end,
              names_thing = case when excluded.words <> '' then excluded.names_thing else activity.names_thing end,
              note = case when excluded.note <> '' then excluded.note else activity.note end,
              counts = (select coalesce(jsonb_object_agg(summed.key, summed.total), '{}') from (
                          select key, sum(value::bigint) as total from (
                            select * from jsonb_each_text(activity.counts)
                            union all select * from jsonb_each_text(excluded.counts)) parts group by key) summed)
            returning id
            """)
                .param("id", UUID.randomUUID())
                .param("circle", h.circleId())
                .param("kind", h.kind().code())
                .param("member", text(h.memberId()))
                .param("who", h.who() == null ? "" : h.who())
                .param("thing", text(h.thingId()))
                .param("about", text(about))
                .param("shown", Codes.of(h.shownTo()))
                .param("only", text(h.onlyFor()))
                .param("words", h.words() == null ? "" : h.words())
                .param("names", h.namesThing())
                .param("note", h.note() == null ? "" : h.note())
                .param("counts", JSON.writeValueAsString(h.counts()))
                .param("day", day)
                .param("fold", foldKey)
                .param("at", Sql.timestamp(at))
                .param("ask", text(h.askId()))
                .query(UUID.class)
                .optional()
                .orElse(null);
    }

    /**
     * Puts a photo into a batch. The first photo of a burst starts the wait after which the burst is told;
     * the ones that follow join it.
     */
    void addItem(UUID lineId, UUID thingId, Instant at, int waitMinutes) {
        int added = jdbc.sql("""
            insert into activity_items (line_id, thing_id, added_at) values (:line, :thing, :at)
            on conflict (line_id, thing_id) do nothing
            """)
                .param("line", lineId)
                .param("thing", thingId)
                .param("at", Sql.timestamp(at))
                .update();
        if (added > 0) {
            jdbc.sql("""
                update activity set burst_at = cast(:at as timestamptz),
                  push_after = cast(:at as timestamptz) + make_interval(mins => :wait)
                where id = :line and push_after is null and cast(:at as timestamptz) > now() - interval '1 hour'
                """)
                    .param("line", lineId)
                    .param("at", Sql.timestamp(at))
                    .param("wait", waitMinutes)
                    .update();
        }
    }

    private static String text(UUID id) {
        return id == null ? null : id.toString();
    }

    // ---------- reading ----------

    /**
     * What a line needs to be shown to this reader, as a condition on {@code a} (the line), {@code t} (its
     * thing, left-joined) and {@code mine} (the reader's own member): it wasn't the reader who did it; when
     * it is about a thing, they may see that thing now; when it is for some of the circle only, they are
     * among them; and of a batch they may see at least one.
     */
    private static final String SHOWN = """
          a.member_id is distinct from mine.id
          and (a.thing_id is null or %s)
          and (a.shown_to = 'circle' or (a.shown_to = 'adults' and mine.role in ('owner', 'adult'))
               or (a.shown_to = 'one' and a.only_for = mine.id))
          and (a.kind <> 'photos' or exists (
                select 1 from activity_items ai join things it on it.id = ai.thing_id
                where ai.line_id = a.id and %s))
        """.formatted(Rules.sees("t", ":me"), Rules.sees("it", ":me"));

    private static final String FROM = """
        from activity a left join things t on t.id = a.thing_id
        join members mine on mine.circle_id = a.circle_id and mine.user_id = :me and mine.status = 'joined'
        where a.circle_id = :circle and
        """;

    /**
     * A circle's lines for one reader, newest first, a page at a time, folded for reading. With a place,
     * only that place's; with {@code asks}, only asks and their answers.
     */
    public List<Folded> page(UUID circleId, UUID me, Place place, boolean asks, Keyset page) {
        return jdbc.sql("""
            select g.* from (
              select (array_agg(a.id order by a.at desc, a.id desc))[1] as id, a.kind, a.thing_id, a.day,
                max(a.at) as at, array_agg(a.member_id order by a.at desc, a.id desc) as members,
                max(a.who) as who, (array_agg(a.words order by a.at desc, a.id desc))[1] as words,
                (array_agg(a.names_thing order by a.at desc, a.id desc))[1] as names_thing,
                (array_agg(a.note order by a.at desc, a.id desc))[1] as note,
                jsonb_agg(a.counts) as counts, array_agg(a.id) as lines,
                (array_agg(a.ask_id))[1] as ask_id
            """ + FROM + SHOWN + """
                and (cast(:place as text) is null or a.place = :place)
                and (not :asks or a.kind in ('ask', 'ask_answered'))
              group by a.kind, a.thing_id, a.day, a.words,
                case when a.thing_id is null or a.kind in ('ask', 'ask_answered') then a.id end) g
            where (cast(:at as timestamptz) is null or (g.at, g.id) < (cast(:at as timestamptz), cast(:id as uuid)))
            order by g.at desc, g.id desc
            limit :limit
            """)
                .param("circle", circleId)
                .param("me", me)
                .param("place", place == null ? null : place.code())
                .param("asks", asks)
                .param("at", page.first() ? null : Sql.timestamp(page.instant(0)))
                .param("id", page.first() ? null : page.uuid(1).toString())
                .param("limit", page.fetch())
                .query(ActivityStore::folded)
                .list();
    }

    private static Folded folded(ResultSet rs, int n) throws SQLException {
        Map<String, Long> counts = new LinkedHashMap<>();
        for (JsonNode one : JSON.readTree(rs.getString("counts"))) {
            one.properties()
                    .forEach(count ->
                            counts.merge(count.getKey(), count.getValue().asLong(), Long::sum));
        }
        return new Folded(
                rs.getObject("id", UUID.class),
                ActivityKind.read(rs.getString("kind")),
                rs.getObject("thing_id", UUID.class),
                rs.getObject("day", LocalDate.class),
                Sql.instant(rs, "at"),
                uuids(rs, "members").stream()
                        .filter(java.util.Objects::nonNull)
                        .distinct()
                        .toList(),
                rs.getString("who"),
                rs.getString("words"),
                rs.getBoolean("names_thing"),
                rs.getString("note"),
                counts,
                uuids(rs, "lines"),
                rs.getObject("ask_id", UUID.class));
    }

    private static List<UUID> uuids(ResultSet rs, String column) throws SQLException {
        java.sql.Array array = rs.getArray(column);
        return array == null ? List.of() : java.util.Arrays.asList((UUID[]) array.getArray());
    }

    /**
     * How many lines are new to this reader since they last opened Activity here: what the dot on the tab
     * counts. It stops counting at a hundred, so it is cheap however much happened.
     */
    public int fresh(UUID circleId, UUID me) {
        return jdbc.sql("select count(*) from (select 1 " + FROM + SHOWN + """
                  and a.at > coalesce((select s.seen_at from activity_seen s where s.member_id = mine.id), mine.created_at)
                limit 100) new_lines
                """)
                .param("circle", circleId)
                .param("me", me)
                .query(Integer.class)
                .single();
    }

    /** When this member last opened Activity, or when they joined if they never have. */
    public Instant seenAt(UUID memberId) {
        return jdbc.sql("""
            select coalesce((select s.seen_at from activity_seen s where s.member_id = m.id), m.created_at)
            from members m where m.id = :member
            """)
                .param("member", memberId)
                .query(java.sql.Timestamp.class)
                .single()
                .toInstant();
    }

    public void seen(UUID memberId) {
        jdbc.sql("""
            insert into activity_seen (member_id) values (:member)
            on conflict (member_id) do update set seen_at = now()
            """).param("member", memberId).update();
    }

    /** For each of these batches: how many of its photos this person may see, added since a moment, and a few of them. */
    public Map<UUID, Batch> batches(Collection<UUID> lineIds, UUID userId, Instant since) {
        if (lineIds.isEmpty()) {
            return Map.of();
        }
        return jdbc
                .sql("""
                    select ai.line_id, count(*) as n, (array_agg(ai.thing_id order by ai.added_at desc, ai.thing_id))[1 : 60] as some
                    from activity_items ai join things it on it.id = ai.thing_id
                    where ai.line_id in (:lines) and (cast(:since as timestamptz) is null or ai.added_at >= :since) and
                    """ + Rules.sees("it", ":me") + " group by ai.line_id")
                .param("lines", lineIds)
                .param("me", userId)
                .param("since", Sql.timestamp(since))
                .query((rs, n) -> new Batch(rs.getObject("line_id", UUID.class), rs.getInt("n"), uuids(rs, "some")))
                .list()
                .stream()
                .collect(Collectors.toMap(Batch::lineId, Function.identity()));
    }

    /** The people these lines name, also the ones who have left since. */
    public Map<UUID, Who> who(Collection<UUID> memberIds) {
        if (memberIds.isEmpty()) {
            return Map.of();
        }
        return jdbc
                .sql("""
                    select m.id, m.user_id, m.name, av.storage_key as avatar_key
                    from members m left join media av on av.id = m.avatar_media_id and av.status = 'ready'
                    where m.id in (:members)
                    """)
                .param("members", memberIds)
                .query((rs, n) -> new Who(
                        rs.getObject("id", UUID.class),
                        rs.getObject("user_id", UUID.class),
                        rs.getString("name"),
                        rs.getString("avatar_key")))
                .list()
                .stream()
                .collect(Collectors.toMap(Who::memberId, Function.identity()));
    }

    /** One line, whoever asks: for wording the push about it. */
    public java.util.Optional<Burst> line(UUID lineId) {
        return jdbc.sql("select id, circle_id, member_id, burst_at from activity where id = :id")
                .param("id", lineId)
                .query((rs, n) -> new Burst(
                        rs.getObject("id", UUID.class),
                        rs.getObject("circle_id", UUID.class),
                        rs.getObject("member_id", UUID.class),
                        Sql.instant(rs, "burst_at")))
                .optional();
    }

    // ---------- muting ----------

    public boolean muted(UUID memberId) {
        return jdbc.sql("select muted from members where id = :member")
                .param("member", memberId)
                .query(Boolean.class)
                .single();
    }

    public void mute(UUID memberId, boolean muted) {
        jdbc.sql("update members set muted = :muted where id = :member")
                .param("member", memberId)
                .param("muted", muted)
                .update();
    }

    // ---------- telling a burst of photos ----------

    /**
     * Takes the bursts whose wait is over, so no other copy of the API takes them too. Each is marked as
     * told here; a photo added later starts a new burst.
     */
    public List<Burst> takeBursts(int limit) {
        return jdbc.sql("""
            update activity set push_after = null
            where id in (select id from activity where push_after <= now() order by push_after limit :limit
                         for update skip locked)
            returning id, circle_id, member_id, burst_at
            """)
                .param("limit", limit)
                .query((rs, n) -> new Burst(
                        rs.getObject("id", UUID.class),
                        rs.getObject("circle_id", UUID.class),
                        rs.getObject("member_id", UUID.class),
                        Sql.instant(rs, "burst_at")))
                .list();
    }

    /**
     * Who hears of a burst: everyone else in the circle with a sign-in of their own who may see at least one
     * of the photos that came with it. Their user ids.
     */
    public List<UUID> hearOfBurst(Burst burst) {
        return jdbc.sql("""
            select m.user_id from members m
            where m.circle_id = :circle and m.user_id is not null and m.status = 'joined'
              and m.id is distinct from cast(:actor as uuid)
              and exists (select 1 from activity_items ai join things it on it.id = ai.thing_id
                          where ai.line_id = :line and ai.added_at >= :since and\s""" + Rules.memberSees("it", "m") + ")")
                .param("circle", burst.circleId())
                .param("actor", text(burst.memberId()))
                .param("line", burst.lineId())
                .param("since", Sql.timestamp(burst.since()))
                .query(UUID.class)
                .list();
    }

    /** Lines from long ago are of no use to anyone: Activity is news, not a record. Returns how many went. */
    public int forgetOlderThan(int days) {
        return jdbc.sql("""
            delete from activity where id in (
              select id from activity where at < now() - make_interval(days => :days) limit 5000)
            """).param("days", days).update();
    }
}

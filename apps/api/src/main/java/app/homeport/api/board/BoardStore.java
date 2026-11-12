package app.homeport.api.board;

import app.homeport.api.circle.CircleKind;
import app.homeport.api.circle.MemberKind;
import app.homeport.api.circle.MemberStatus;
import app.homeport.api.circle.Role;
import app.homeport.api.common.Keyset;
import app.homeport.api.common.Rules;
import app.homeport.api.common.Sql;
import app.homeport.api.thing.ThingStore;
import app.homeport.api.thing.ThingStore.ThingRow;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import tools.jackson.databind.node.ObjectNode;

/**
 * Reads and writes boards and their entries. Who may see a board is decided by the thing it is; what a
 * person sees inside it is decided by the template's rules, never here.
 */
@Repository
public class BoardStore {

    /** A board as it is stored: which template it is, and its settings. */
    public record BoardRow(UUID thingId, Template template, ObjectNode settings) {}

    /** How many entries of one kind a member has on a board, and what their numbers add up to. */
    public record Tally(int count, long sum) {}

    private final JdbcClient jdbc;

    BoardStore(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    // ---------- boards ----------

    /** Stores a new board under its thing. A second send of the same create finds it there and changes nothing. */
    public boolean insert(UUID thingId, Template template, ObjectNode settings) {
        return jdbc.sql("""
            insert into boards (thing_id, template, settings) values (:id, :template, cast(:settings as jsonb))
            on conflict (thing_id) do nothing
            """)
                        .param("id", thingId)
                        .param("template", template.code())
                        .param("settings", Json.text(settings))
                        .update()
                == 1;
    }

    public Optional<BoardRow> find(UUID thingId) {
        return jdbc.sql("select thing_id, template, settings from boards where thing_id = :id")
                .param("id", thingId)
                .query(BoardStore::board)
                .optional();
    }

    public Map<UUID, BoardRow> findAll(Collection<UUID> thingIds) {
        if (thingIds.isEmpty()) {
            return Map.of();
        }
        return jdbc
                .sql("select thing_id, template, settings from boards where thing_id in (:ids)")
                .param("ids", thingIds)
                .query(BoardStore::board)
                .list()
                .stream()
                .collect(Collectors.toMap(BoardRow::thingId, b -> b));
    }

    private static BoardRow board(ResultSet rs, int n) throws SQLException {
        return new BoardRow(
                rs.getObject("thing_id", UUID.class),
                Template.read(rs.getString("template")),
                Json.read(rs.getString("settings")));
    }

    public void saveSettings(UUID thingId, ObjectNode settings) {
        jdbc.sql("update boards set settings = cast(:settings as jsonb) where thing_id = :id")
                .param("id", thingId)
                .param("settings", Json.text(settings))
                .update();
    }

    /**
     * The boards in a circle the viewer may see, last changed first, a page at a time. With a template, only
     * boards of that template.
     */
    public List<ThingRow> list(UUID circleId, UUID me, Template template, Keyset page) {
        return jdbc.sql("select " + ThingStore.COLUMNS + """
             from things t join boards b on b.thing_id = t.id
             where t.circle_id = :circle and t.kind = 'board'
               and (cast(:template as text) is null or b.template = :template)
               and (cast(:at as timestamptz) is null or (t.updated_at, t.id) < (cast(:at as timestamptz), cast(:id as uuid)))
               and\s""" + Rules.sees("t", ":me")
                        + " order by t.updated_at desc, t.id desc limit :limit")
                .param("circle", circleId)
                .param("me", me)
                .param("template", template == null ? null : template.code())
                .param("at", page.first() ? null : Sql.timestamp(page.instant(0)))
                .param("id", page.first() ? null : page.uuid(1).toString())
                .param("limit", page.fetch())
                .query(ThingStore::row)
                .list();
    }

    /** Every board in a circle the viewer may see: what Today and search walk through. A circle holds a few dozen. */
    public List<ThingRow> seenIn(UUID circleId, UUID me) {
        return jdbc.sql("select " + ThingStore.COLUMNS + """
             from things t where t.circle_id = :circle and t.kind = 'board' and\s""" + Rules.sees("t", ":me")
                        + " order by t.updated_at desc, t.id desc limit 200")
                .param("circle", circleId)
                .param("me", me)
                .query(ThingStore::row)
                .list();
    }

    /** A thing as it is, with no viewer: for a guest's page, where the pass decided what is shown. */
    public Optional<ThingRow> thingForNobody(UUID thingId) {
        return jdbc.sql("""
            select t.id, t.circle_id, t.owner_id, t.kind, t.place, t.title, t.audience, t.everyone_edits,
              t.created_at, t.updated_at, false as mine, false as can_edit
            from things t where t.id = :id and t.kind = 'board'
            """).param("id", thingId).query(ThingStore::row).optional();
    }

    /** True while a thing of any kind exists, whoever may see it. */
    public boolean thingExists(UUID thingId) {
        return jdbc.sql("select exists (select 1 from things where id = :id)")
                .param("id", thingId)
                .query(Boolean.class)
                .single();
    }

    /** The user behind a thing's owner, when they still have a sign-in: uploads made for the board are kept as theirs. */
    public Optional<UUID> ownerUser(UUID thingId) {
        return jdbc
                .sql("select m.user_id from things t join members m on m.id = t.owner_id where t.id = :id")
                .param("id", thingId)
                .query((rs, n) -> rs.getObject("user_id", UUID.class))
                .list()
                .stream()
                .filter(java.util.Objects::nonNull)
                .findFirst();
    }

    // ---------- people ----------

    public CircleKind circleKind(UUID circleId) {
        return CircleKind.read(jdbc.sql("select kind from circles where id = :id")
                .param("id", circleId)
                .query(String.class)
                .single());
    }

    /** Everyone who is or was in a circle, in the order the circle lists its people. */
    public List<Person> people(UUID circleId) {
        return jdbc.sql("""
            select m.id, m.user_id, m.name, m.kind, m.role, m.status, a.storage_key as avatar_key, m.birthday,
              m.created_at, m.left_at
            from members m left join media a on a.id = m.avatar_media_id and a.status = 'ready'
            where m.circle_id = :circle
            order by case when m.kind = 'pet' then 5 else array_position(array['owner','adult','teen','child','guest'], m.role) end,
              m.created_at, m.id
            """)
                .param("circle", circleId)
                .query((rs, n) -> new Person(
                        rs.getObject("id", UUID.class),
                        rs.getObject("user_id", UUID.class),
                        rs.getString("name"),
                        MemberKind.read(rs.getString("kind")),
                        Role.read(rs.getString("role")),
                        MemberStatus.read(rs.getString("status")),
                        rs.getString("avatar_key"),
                        rs.getObject("birthday", LocalDate.class),
                        Sql.instant(rs, "created_at"),
                        Sql.instant(rs, "left_at")))
                .list();
    }

    // ---------- entries ----------

    private static EntryRow entry(ResultSet rs, int n) throws SQLException {
        return new EntryRow(
                rs.getObject("id", UUID.class),
                rs.getObject("board_id", UUID.class),
                rs.getObject("parent_id", UUID.class),
                rs.getString("kind"),
                rs.getObject("author_id", UUID.class),
                rs.getObject("for_id", UUID.class),
                Json.read(rs.getString("doc")),
                rs.getObject("day", LocalDate.class),
                Sql.instant(rs, "opens_at"),
                Sql.instant(rs, "done_at"),
                rs.getObject("done_by", UUID.class),
                rs.getObject("media_id", UUID.class),
                (Long) rs.getObject("amount"),
                rs.getString("token"),
                rs.getDouble("position"),
                Sql.instant(rs, "created_at"),
                Sql.instant(rs, "updated_at"));
    }

    /**
     * The entries of a board, in their order, without the kinds the template counts instead of reading (a
     * chore wheel's ticks). A board holds {@link BoardRules#ceiling()} entries at most.
     */
    public List<EntryRow> entries(UUID boardId, Collection<String> exceptKinds, int ceiling) {
        return jdbc.sql("""
            select * from board_entries where board_id = :board and kind <> all (cast(:except as text[]))
            order by position, id limit :limit
            """)
                .param("board", boardId)
                .param("except", exceptKinds.toArray(String[]::new))
                .param("limit", ceiling)
                .query(BoardStore::entry)
                .list();
    }

    /** The entries of one kind whose day lies between two days (both counted), oldest first. */
    public List<EntryRow> between(UUID boardId, String kind, LocalDate from, LocalDate to) {
        return jdbc.sql("""
            select * from board_entries where board_id = :board and kind = :kind and day between :from and :to
            order by day, position, id limit 5000
            """)
                .param("board", boardId)
                .param("kind", kind)
                .param("from", from)
                .param("to", to)
                .query(BoardStore::entry)
                .list();
    }

    /** For each member a kind of entry is for: how many there are, and what their numbers add up to. */
    public Map<UUID, Tally> tallies(UUID boardId, String kind) {
        record Row(UUID member, Tally tally) {}
        return jdbc
                .sql("""
            select for_id, count(*) as n, coalesce(sum(amount), 0) as total from board_entries
            where board_id = :board and kind = :kind and for_id is not null group by for_id
            """)
                .param("board", boardId)
                .param("kind", kind)
                .query((rs, n) ->
                        new Row(rs.getObject("for_id", UUID.class), new Tally(rs.getInt("n"), rs.getLong("total"))))
                .list()
                .stream()
                .collect(Collectors.toMap(Row::member, Row::tally));
    }

    public Optional<EntryRow> entry(UUID entryId) {
        return jdbc.sql("select * from board_entries where id = :id")
                .param("id", entryId)
                .query(BoardStore::entry)
                .optional();
    }

    /** The entry a link for someone outside the circle ends in. */
    public Optional<EntryRow> byToken(String token) {
        return jdbc.sql("select * from board_entries where token = :token")
                .param("token", token)
                .query(BoardStore::entry)
                .optional();
    }

    /** The entry a clientId already made on this board, when the same add is sent a second time. */
    public Optional<UUID> sentBefore(UUID boardId, UUID clientId) {
        if (clientId == null) {
            return Optional.empty();
        }
        return jdbc.sql("select id from board_entries where board_id = :board and client_id = :client")
                .param("board", boardId)
                .param("client", clientId)
                .query(UUID.class)
                .optional();
    }

    public int count(UUID boardId) {
        return jdbc.sql("select count(*) from board_entries where board_id = :board")
                .param("board", boardId)
                .query(Integer.class)
                .single();
    }

    /**
     * Adds an entry. Sending the same clientId again adds nothing and returns the entry added the first time.
     * Left without a position, it goes to the end.
     */
    public UUID add(UUID boardId, EntryDraft draft, UUID clientId) {
        return jdbc.sql("""
            insert into board_entries (id, board_id, parent_id, kind, author_id, for_id, doc, day, opens_at, done_at,
              done_by, media_id, amount, token, client_id, position)
            values (:id, :board, :parent, :kind, :author, :for, cast(:doc as jsonb), :day, :opens, :done, :doneBy, :media,
              :amount, :token, :client,
              coalesce(cast(:position as double precision),
                       (select max(position) from board_entries where board_id = :board) + 1, 1))
            on conflict (board_id, client_id) do update set client_id = excluded.client_id
            returning id
            """)
                .param("id", UUID.randomUUID())
                .param("board", boardId)
                .param("parent", draft.parentId)
                .param("kind", draft.kind)
                .param("author", draft.authorId)
                .param("for", draft.forId)
                .param("doc", Json.text(draft.doc))
                .param("day", draft.day)
                .param("opens", Sql.timestamp(draft.opensAt))
                .param("done", Sql.timestamp(draft.doneAt))
                .param("doneBy", draft.doneBy)
                .param("media", draft.mediaId)
                .param("amount", draft.amount)
                .param("token", draft.token)
                .param("client", clientId)
                .param("position", draft.position)
                .query(UUID.class)
                .single();
    }

    public void save(UUID entryId, EntryDraft draft) {
        jdbc.sql("""
            update board_entries set parent_id = :parent, kind = :kind, author_id = :author, for_id = :for,
              doc = cast(:doc as jsonb), day = :day, opens_at = :opens, done_at = :done, done_by = :doneBy,
              media_id = :media, amount = :amount, token = :token,
              position = coalesce(cast(:position as double precision), position), updated_at = now()
            where id = :id
            """)
                .param("id", entryId)
                .param("parent", draft.parentId)
                .param("kind", draft.kind)
                .param("author", draft.authorId)
                .param("for", draft.forId)
                .param("doc", Json.text(draft.doc))
                .param("day", draft.day)
                .param("opens", Sql.timestamp(draft.opensAt))
                .param("done", Sql.timestamp(draft.doneAt))
                .param("doneBy", draft.doneBy)
                .param("media", draft.mediaId)
                .param("amount", draft.amount)
                .param("token", draft.token)
                .param("position", draft.position)
                .update();
    }

    /** Removes an entry and everything under it. Their files go with them (see the migration). */
    public void delete(UUID entryId) {
        jdbc.sql("delete from board_entries where id = :id")
                .param("id", entryId)
                .update();
    }

    /**
     * Entries anywhere in a circle's boards whose details may hold these words, newest first. Only a first
     * sieve: the template then says what of each one the viewer may read, and the words are looked for in that.
     */
    public List<EntryRow> mayHold(UUID circleId, UUID me, String words, int limit) {
        return jdbc.sql("""
            select e.* from board_entries e join things t on t.id = e.board_id
            where t.circle_id = :circle and t.kind = 'board' and cast(e.doc as text) ilike :pattern and\s""" + Rules.sees("t", ":me") + " order by e.created_at desc, e.id desc limit :limit")
                .param("circle", circleId)
                .param("me", me)
                .param("pattern", Sql.anywhere(words))
                .param("limit", limit)
                .query(BoardStore::entry)
                .list();
    }
}

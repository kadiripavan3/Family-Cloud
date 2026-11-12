package app.homeport.api.journey;

import app.homeport.api.common.Sql;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** Reads and writes drafts of journeys. A draft is its writer's alone: every read asks for it as them. */
@Repository
class TellStore {

    record DraftRow(
            UUID id,
            UUID circleId,
            UUID ownerId,
            String title,
            String sourceKind,
            UUID sourceId,
            String sourceTitle,
            JourneyVisibility visibility,
            boolean leaveOutChildren,
            boolean townOnly,
            boolean skipHome,
            String status,
            UUID journeyId,
            String openUrl,
            Instant updatedAt) {

        LeavingHome.Switches switches() {
            return new LeavingHome.Switches(leaveOutChildren, townOnly, skipHome);
        }
    }

    record DayRow(LocalDate day, String line, String place) {}

    record ItemRow(UUID itemId, LocalDate day, int position, boolean dropped, boolean backOn) {}

    private final JdbcClient jdbc;

    TellStore(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    private static DraftRow draft(ResultSet rs, int n) throws SQLException {
        return new DraftRow(
                rs.getObject("id", UUID.class),
                rs.getObject("circle_id", UUID.class),
                rs.getObject("owner_id", UUID.class),
                rs.getString("title"),
                rs.getString("source_kind"),
                rs.getObject("source_id", UUID.class),
                rs.getString("source_title"),
                JourneyVisibility.read(rs.getString("visibility")),
                rs.getBoolean("leave_out_children"),
                rs.getBoolean("town_only"),
                rs.getBoolean("skip_home"),
                rs.getString("status"),
                rs.getObject("journey_id", UUID.class),
                rs.getString("open_url"),
                Sql.instant(rs, "updated_at"));
    }

    /** A draft, for the person who is writing it. To everyone else it isn't there. */
    Optional<DraftRow> find(UUID id, UUID me) {
        return jdbc.sql("""
            select d.* from journey_drafts d join members o on o.id = d.owner_id
            where d.id = :id and o.user_id = :me and o.status = 'joined'
            """)
                .param("id", id)
                .param("me", me)
                .query(TellStore::draft)
                .optional();
    }

    Optional<UUID> sentBefore(UUID ownerId, UUID clientId) {
        return jdbc.sql("select id from journey_drafts where owner_id = :owner and client_id = :client")
                .param("owner", ownerId)
                .param("client", clientId)
                .query(UUID.class)
                .optional();
    }

    UUID insert(
            UUID circleId,
            UUID ownerId,
            String title,
            String sourceKind,
            UUID sourceId,
            String sourceTitle,
            UUID clientId) {
        return jdbc.sql("""
            insert into journey_drafts (id, circle_id, owner_id, title, source_kind, source_id, source_title, client_id)
            values (:id, :circle, :owner, :title, :kind, :source, :sourceTitle, :client)
            on conflict (owner_id, client_id) do update set client_id = excluded.client_id
            returning id
            """)
                .param("id", UUID.randomUUID())
                .param("circle", circleId)
                .param("owner", ownerId)
                .param("title", title)
                .param("kind", sourceKind)
                .param("source", sourceId)
                .param("sourceTitle", sourceTitle)
                .param("client", clientId)
                .query(UUID.class)
                .single();
    }

    void day(UUID draftId, LocalDate day, String line, String place) {
        jdbc.sql("""
            insert into journey_draft_days (draft_id, day, line, place) values (:draft, :day, :line, :place)
            on conflict (draft_id, day) do update set line = excluded.line
            """)
                .param("draft", draftId)
                .param("day", day)
                .param("line", line)
                .param("place", place)
                .update();
    }

    /** Makes sure a day has its row, with a first line, when something is moved onto it. */
    void dayIfNew(UUID draftId, LocalDate day, String line) {
        jdbc.sql("""
            insert into journey_draft_days (draft_id, day, line) values (:draft, :day, :line)
            on conflict (draft_id, day) do nothing
            """)
                .param("draft", draftId)
                .param("day", day)
                .param("line", line)
                .update();
    }

    void item(UUID draftId, UUID itemId, LocalDate day, int position) {
        jdbc.sql("""
            insert into journey_draft_items (draft_id, item_id, day, position) values (:draft, :item, :day, :position)
            on conflict (draft_id, item_id) do nothing
            """)
                .param("draft", draftId)
                .param("item", itemId)
                .param("day", day)
                .param("position", position)
                .update();
    }

    List<DayRow> days(UUID draftId) {
        return jdbc.sql("select day, line, place from journey_draft_days where draft_id = :draft order by day")
                .param("draft", draftId)
                .query((rs, n) ->
                        new DayRow(rs.getObject("day", LocalDate.class), rs.getString("line"), rs.getString("place")))
                .list();
    }

    List<ItemRow> items(UUID draftId) {
        return jdbc.sql("select * from journey_draft_items where draft_id = :draft order by day, position, item_id")
                .param("draft", draftId)
                .query((rs, n) -> new ItemRow(
                        rs.getObject("item_id", UUID.class),
                        rs.getObject("day", LocalDate.class),
                        rs.getInt("position"),
                        rs.getBoolean("dropped"),
                        rs.getBoolean("back_on")))
                .list();
    }

    void retitle(UUID draftId, String title) {
        jdbc.sql("update journey_drafts set title = :title, updated_at = now() where id = :id")
                .param("id", draftId)
                .param("title", title)
                .update();
    }

    void move(UUID draftId, UUID itemId, LocalDate day) {
        jdbc.sql("""
            update journey_draft_items set day = :day,
              position = (select coalesce(max(position), 0) + 1 from journey_draft_items where draft_id = :draft and day = :day)
            where draft_id = :draft and item_id = :item
            """)
                .param("draft", draftId)
                .param("item", itemId)
                .param("day", day)
                .update();
    }

    void drop(UUID draftId, List<UUID> itemIds, boolean dropped) {
        if (itemIds.isEmpty()) {
            return;
        }
        jdbc.sql("update journey_draft_items set dropped = :dropped where draft_id = :draft and item_id in (:items)")
                .param("draft", draftId)
                .param("items", itemIds)
                .param("dropped", dropped)
                .update();
    }

    void backOn(UUID draftId, List<UUID> itemIds, boolean on) {
        if (itemIds.isEmpty()) {
            return;
        }
        jdbc.sql("update journey_draft_items set back_on = :on where draft_id = :draft and item_id in (:items)")
                .param("draft", draftId)
                .param("items", itemIds)
                .param("on", on)
                .update();
    }

    void switches(UUID draftId, LeavingHome.Switches switches, JourneyVisibility visibility) {
        jdbc.sql("""
            update journey_drafts set leave_out_children = :children, town_only = :town, skip_home = :home,
              visibility = :visibility, updated_at = now() where id = :id
            """)
                .param("id", draftId)
                .param("children", switches.leaveOutChildren())
                .param("town", switches.townOnly())
                .param("home", switches.skipHome())
                .param("visibility", visibility.code())
                .update();
    }

    /** Marks a draft as on its way. False when it already is, or has gone: a draft leaves once. */
    boolean startPosting(UUID draftId) {
        return jdbc.sql(
                                "update journey_drafts set status = 'posting', updated_at = now() where id = :id and status in ('draft', 'failed')")
                        .param("id", draftId)
                        .update()
                == 1;
    }

    void posted(UUID draftId, UUID journeyId, String openUrl) {
        jdbc.sql("""
            update journey_drafts set status = 'posted', journey_id = :journey, open_url = :open, updated_at = now()
            where id = :id
            """)
                .param("id", draftId)
                .param("journey", journeyId)
                .param("open", openUrl)
                .update();
    }

    /** How long ago a draft last changed, in seconds. */
    long quietFor(UUID draftId) {
        return jdbc.sql("select extract(epoch from now() - updated_at)::bigint from journey_drafts where id = :id")
                .param("id", draftId)
                .query(Long.class)
                .single();
    }

    void failed(UUID draftId) {
        jdbc.sql(
                        "update journey_drafts set status = 'failed', updated_at = now() where id = :id and status = 'posting'")
                .param("id", draftId)
                .update();
    }

    void delete(UUID draftId) {
        jdbc.sql("delete from journey_drafts where id = :id")
                .param("id", draftId)
                .update();
    }

    /** How many journeys this member told from a circle in a week: for the Sunday summary. */
    List<String> toldBetween(UUID circleId, UUID ownerId, Instant from, Instant to) {
        return jdbc.sql("""
            select title from journey_drafts where circle_id = :circle and owner_id = :owner and status = 'posted'
              and updated_at >= :from and updated_at < :to order by updated_at limit 10
            """)
                .param("circle", circleId)
                .param("owner", ownerId)
                .param("from", Sql.timestamp(from))
                .param("to", Sql.timestamp(to))
                .query(String.class)
                .list();
    }
}

package app.homeport.api.journey;

import app.homeport.api.common.Rules;
import app.homeport.api.common.Sql;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** Reads and writes what makes a folder a trip. Who may see a trip is decided by the folder it is. */
@Repository
class TripStore {

    record TripRow(
            UUID folderId,
            LocalDate startsOn,
            LocalDate endsOn,
            UUID sheetId,
            UUID journeyId,
            String journeyOpenUrl,
            Instant becameAt,
            UUID keptId) {}

    private final JdbcClient jdbc;

    TripStore(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    Optional<TripRow> find(UUID folderId) {
        return jdbc.sql("select * from trips where folder_id = :id")
                .param("id", folderId)
                .query((rs, n) -> new TripRow(
                        rs.getObject("folder_id", UUID.class),
                        rs.getObject("starts_on", LocalDate.class),
                        rs.getObject("ends_on", LocalDate.class),
                        rs.getObject("sheet_id", UUID.class),
                        rs.getObject("journey_id", UUID.class),
                        rs.getString("journey_open_url"),
                        Sql.instant(rs, "became_at"),
                        rs.getObject("kept_id", UUID.class)))
                .optional();
    }

    /** A trip in a list: its folder's id and name, and its dates. */
    record TripLine(UUID folderId, String title, LocalDate startsOn, LocalDate endsOn, UUID journeyId, UUID keptId) {}

    /** The trips of a circle whose folder this person may see, the latest to start first. Fifty at most. */
    List<TripLine> list(UUID circleId, UUID me) {
        return jdbc.sql("select t.id, t.title, p.starts_on, p.ends_on, p.journey_id, p.kept_id"
                        + " from trips p join things t on t.id = p.folder_id where t.circle_id = :circle and "
                        + Rules.sees("t", ":me") + " order by p.starts_on desc, t.id limit 50")
                .param("circle", circleId)
                .param("me", me)
                .query((rs, n) -> new TripLine(
                        rs.getObject("id", UUID.class),
                        rs.getString("title"),
                        rs.getObject("starts_on", LocalDate.class),
                        rs.getObject("ends_on", LocalDate.class),
                        rs.getObject("journey_id", UUID.class),
                        rs.getObject("kept_id", UUID.class)))
                .list();
    }

    void save(UUID folderId, LocalDate startsOn, LocalDate endsOn, UUID sheetId) {
        jdbc.sql("""
            insert into trips (folder_id, starts_on, ends_on, sheet_id) values (:id, :starts, :ends, :sheet)
            on conflict (folder_id) do update set starts_on = excluded.starts_on, ends_on = excluded.ends_on,
              sheet_id = excluded.sheet_id
            """)
                .param("id", folderId)
                .param("starts", startsOn)
                .param("ends", endsOn)
                .param("sheet", sheetId)
                .update();
    }

    /** Writes down the journey a trip became. A trip becomes a journey once: true for the call that did it. */
    boolean became(UUID folderId, UUID journeyId, String openUrl) {
        return jdbc.sql("""
            update trips set journey_id = :journey, journey_open_url = :open, became_at = now()
            where folder_id = :id and journey_id is null
            """)
                        .param("id", folderId)
                        .param("journey", journeyId)
                        .param("open", openUrl)
                        .update()
                == 1;
    }

    void delete(UUID folderId) {
        jdbc.sql("delete from trips where folder_id = :id")
                .param("id", folderId)
                .update();
    }
}

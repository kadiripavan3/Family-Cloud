package app.homeport.api.journey;

import app.homeport.api.circle.CircleService;
import app.homeport.api.circle.CircleStore.CircleRow;
import app.homeport.api.common.ApiProblem;
import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.Optional;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

/**
 * The two things a circle says once for the link with Journey: where home is, so that photos taken there
 * stay home when a journey is told; when bedtime is, so that a goodnight from far away waits until then; and
 * which clock home keeps, so that someone in another time zone knows when bedtime at home is.
 * Everyone in the circle may read them; the people who run the circle change them.
 */
@Service
public class HomeSettings {

    static final LocalTime USUAL_BEDTIME = LocalTime.of(20, 0);
    static final int USUAL_RADIUS_M = 150;

    public record HomeSettingsResponse(
            UUID circleId,

            @Schema(nullable = true, description = "Where home is. Null until someone says.")
            Double homeLat,

            @Schema(nullable = true) Double homeLng,

            @Schema(description = "How far around that point still counts as home, in metres")
            int homeRadiusM,

            @Schema(
                    type = "string",
                    example = "20:00",
                    description = "When a goodnight is shown at home: 20:00 unless someone changes it")
            @JsonFormat(pattern = "HH:mm")
            LocalTime bedtime,

            @Schema(
                    nullable = true,
                    description = "The clock home keeps, such as Europe/Ljubljana. Null until someone says.")
            String timeZone,

            @Schema(description = "True when you may change these: you run the circle")
            boolean canChange) {}

    public record HomeSettingsChange(
            Double homeLat,
            Double homeLng,
            Boolean removeHome,
            Integer homeRadiusM,
            LocalTime bedtime,
            String timeZone) {}

    private final JdbcClient jdbc;
    private final CircleService circles;

    HomeSettings(JdbcClient jdbc, CircleService circles) {
        this.jdbc = jdbc;
        this.circles = circles;
    }

    private record Row(Double lat, Double lng, int radiusM, LocalTime bedtime, String timeZone) {}

    private Row row(UUID circleId) {
        return jdbc.sql(
                        "select home_lat, home_lng, home_radius_m, bedtime, time_zone from journey_circle_settings where circle_id = :id")
                .param("id", circleId)
                .query((rs, n) -> new Row(
                        (Double) rs.getObject("home_lat"),
                        (Double) rs.getObject("home_lng"),
                        rs.getInt("home_radius_m"),
                        rs.getObject("bedtime", LocalTime.class),
                        rs.getString("time_zone")))
                .optional()
                .orElse(new Row(null, null, USUAL_RADIUS_M, USUAL_BEDTIME, null));
    }

    /** Where home is, for the check before a journey leaves. Empty until the circle says. */
    public Optional<LeavingHome.Home> home(UUID circleId) {
        Row row = row(circleId);
        return row.lat() == null
                ? Optional.empty()
                : Optional.of(new LeavingHome.Home(row.lat(), row.lng(), row.radiusM()));
    }

    public LocalTime bedtime(UUID circleId) {
        return row(circleId).bedtime();
    }

    /** The clock home keeps. Empty until the circle says. */
    public Optional<ZoneId> zone(UUID circleId) {
        return Optional.ofNullable(row(circleId).timeZone()).map(ZoneId::of);
    }

    public HomeSettingsResponse get(UUID circleId, UUID me) {
        CircleRow circle = circles.require(circleId, me);
        Row row = row(circleId);
        return new HomeSettingsResponse(
                circleId,
                row.lat(),
                row.lng(),
                row.radiusM(),
                row.bedtime(),
                row.timeZone(),
                CircleService.runs(circle, circles.me(circleId, me)));
    }

    public HomeSettingsResponse change(UUID circleId, UUID me, HomeSettingsChange change) {
        CircleRow circle = circles.require(circleId, me);
        if (!CircleService.runs(circle, circles.me(circleId, me))) {
            throw new ApiProblem(
                    HttpStatus.FORBIDDEN,
                    "not_yours_to_change",
                    "Only the people who run this circle can change that.");
        }
        if ((change.homeLat() == null) != (change.homeLng() == null)) {
            throw ApiProblem.badRequest("invalid_place", "A place needs both its latitude and its longitude.");
        }
        Row now = row(circleId);
        boolean remove = Boolean.TRUE.equals(change.removeHome());
        String zone = now.timeZone();
        if (change.timeZone() != null) {
            try {
                zone = ZoneId.of(change.timeZone().trim()).getId();
            } catch (java.time.DateTimeException notAZone) {
                throw ApiProblem.badRequest("invalid_time_zone", "That isn't a time zone we know.");
            }
        }
        set(
                circleId,
                remove ? null : change.homeLat() != null ? change.homeLat() : now.lat(),
                remove ? null : change.homeLng() != null ? change.homeLng() : now.lng(),
                change.homeRadiusM() != null ? change.homeRadiusM() : now.radiusM(),
                change.bedtime() != null ? change.bedtime() : now.bedtime(),
                zone);
        return get(circleId, me);
    }

    /** Writes a circle's settings. For the sample data, and behind {@link #change}. */
    public void set(UUID circleId, Double lat, Double lng, int radiusM, LocalTime bedtime, String timeZone) {
        jdbc.sql("""
            insert into journey_circle_settings (circle_id, home_lat, home_lng, home_radius_m, bedtime, time_zone)
            values (:id, :lat, :lng, :radius, :bedtime, :zone)
            on conflict (circle_id) do update set home_lat = excluded.home_lat, home_lng = excluded.home_lng,
              home_radius_m = excluded.home_radius_m, bedtime = excluded.bedtime, time_zone = excluded.time_zone,
              updated_at = now()
            """)
                .param("id", circleId)
                .param("lat", lat)
                .param("lng", lng)
                .param("radius", radiusM)
                .param("bedtime", bedtime)
                .param("zone", timeZone)
                .update();
    }
}

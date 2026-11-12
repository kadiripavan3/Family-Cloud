package app.homeport.api.plan;

import app.homeport.api.common.ApiProblem;
import app.homeport.api.common.Sql;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.DateTimeException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.jdbc.core.simple.JdbcClient;

/** What the stores of Plan share: reading and writing how something repeats, and a time of day with its time zone. */
final class PlanSql {

    private PlanSql() {}

    /** When something with a day and no time counts as due: nine in the morning, where it is. */
    static final LocalTime MORNING = LocalTime.of(9, 0);

    /** The columns every thing that repeats has. */
    static Recurrence repeat(ResultSet rs) throws SQLException {
        String unit = rs.getString("repeat_unit");
        if (unit == null) {
            return null;
        }
        Set<Weekday> days =
                Sql.strings(rs, "repeat_days").stream().map(Weekday::read).collect(Collectors.toSet());
        return new Recurrence(
                Recurrence.Unit.read(unit),
                rs.getInt("repeat_every"),
                days,
                rs.getObject("repeat_until", LocalDate.class));
    }

    /** Binds :unit, :every, :days and :until for a rule, or for none. */
    static JdbcClient.StatementSpec repeat(JdbcClient.StatementSpec sql, Recurrence repeat) {
        return sql.param("unit", repeat == null ? null : repeat.unit().code())
                .param("every", repeat == null ? 1 : repeat.every())
                .param(
                        "days",
                        repeat == null
                                ? new String[0]
                                : repeat.days().stream()
                                        .sorted()
                                        .map(Weekday::code)
                                        .toArray(String[]::new))
                .param("until", repeat == null ? null : repeat.until());
    }

    static LocalTime time(ResultSet rs, String column) throws SQLException {
        return rs.getObject(column, LocalTime.class);
    }

    /** The time zone a phone named. One the API doesn't know is the phone's mistake, said plainly. */
    static ZoneId zone(String name) {
        try {
            return ZoneId.of(name.trim());
        } catch (DateTimeException | NullPointerException unknown) {
            throw ApiProblem.badRequest("invalid_time_zone", "We don't know that time zone.");
        }
    }

    /** A time zone from a database column: it was checked when it was written. */
    static ZoneId storedZone(String name) {
        try {
            return ZoneId.of(name);
        } catch (DateTimeException unknown) {
            return ZoneOffset.UTC;
        }
    }

    /** The moment a day and a time on the clock are, where the thing happens. With no time: the start of the day. */
    static Instant moment(LocalDate day, LocalTime time, String timeZone) {
        return day.atTime(time == null ? LocalTime.MIDNIGHT : time)
                .atZone(storedZone(timeZone))
                .toInstant();
    }
}

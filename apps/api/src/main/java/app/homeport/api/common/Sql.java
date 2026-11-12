package app.homeport.api.common;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;

/** Small helpers for reading and writing PostgreSQL values with plain SQL. */
public final class Sql {

    private Sql() {}

    /**
     * The database stops a statement after five seconds. Work that is allowed to take longer (a nightly job, a
     * delete that takes a whole journey or account with it) runs this first, inside its own transaction: it
     * lifts the limit to two minutes until that transaction ends.
     */
    public static final String ROOM_FOR_A_JOB = "set local statement_timeout = '120s'";

    /**
     * What someone typed, as a pattern that finds it anywhere in a text. Their words are matched as they are:
     * % and _ mean themselves, not "anything".
     */
    public static String anywhere(String words) {
        return "%" + words.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%";
    }

    public static Instant instant(ResultSet rs, String column) throws SQLException {
        Timestamp value = rs.getTimestamp(column);
        return value == null ? null : value.toInstant();
    }

    public static Timestamp timestamp(Instant value) {
        return value == null ? null : Timestamp.from(value);
    }

    public static List<String> strings(ResultSet rs, String column) throws SQLException {
        java.sql.Array array = rs.getArray(column);
        return array == null ? List.of() : List.of((String[]) array.getArray());
    }

    /** A PostgreSQL array literal. Only for values already reduced to letters, digits and hyphens. */
    public static String arrayLiteral(List<String> values) {
        return "{" + String.join(",", values) + "}";
    }
}

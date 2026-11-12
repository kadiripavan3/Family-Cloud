package app.homeport.api.list;

import app.homeport.api.common.ApiProblem;
import app.homeport.api.common.Codes;
import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/**
 * How often a line comes back: milk, every week. A ticked line that repeats is never cleared away; it
 * unticks itself in time for the same day next week (after six days), or next month (after four weeks less
 * a day).
 */
public enum Repeats {
    WEEKLY,
    MONTHLY;

    @JsonValue
    public String code() {
        return Codes.of(this);
    }

    @JsonCreator
    public static Repeats of(String code) {
        return Codes.parse(
                Repeats.class,
                code,
                () -> ApiProblem.badRequest("invalid_repeat", "Choose every week or every month."));
    }

    /** From a database column. */
    public static Repeats read(String code) {
        return Codes.read(Repeats.class, code);
    }
}

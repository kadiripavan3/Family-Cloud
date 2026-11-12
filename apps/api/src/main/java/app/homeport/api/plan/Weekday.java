package app.homeport.api.plan;

import app.homeport.api.common.ApiProblem;
import app.homeport.api.common.Codes;
import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;
import java.time.DayOfWeek;

/** A day of the week, as the API says it: mon, tue, wed, thu, fri, sat, sun. The week starts on Monday. */
public enum Weekday {
    MON("Monday"),
    TUE("Tuesday"),
    WED("Wednesday"),
    THU("Thursday"),
    FRI("Friday"),
    SAT("Saturday"),
    SUN("Sunday");

    private final String full;

    Weekday(String full) {
        this.full = full;
    }

    /** "Thursday". */
    public String full() {
        return full;
    }

    /** "Thu". */
    public String brief() {
        return full.substring(0, 3);
    }

    public DayOfWeek day() {
        return DayOfWeek.of(ordinal() + 1);
    }

    public static Weekday of(DayOfWeek day) {
        return values()[day.getValue() - 1];
    }

    @JsonValue
    public String code() {
        return Codes.of(this);
    }

    @JsonCreator
    public static Weekday of(String code) {
        return Codes.parse(
                Weekday.class, code, () -> ApiProblem.badRequest("invalid_weekday", "That isn't a day of the week."));
    }

    /** From a database column. */
    public static Weekday read(String code) {
        return Codes.read(Weekday.class, code);
    }
}

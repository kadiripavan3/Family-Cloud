package app.homeport.api.jot;

import app.homeport.api.common.ApiProblem;
import app.homeport.api.common.Codes;
import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/** What a jot with a day or a time becomes when the words don't say: a reminder or an event. */
public enum TimedAs {
    REMINDER,
    EVENT;

    @JsonValue
    public String code() {
        return Codes.of(this);
    }

    @JsonCreator
    public static TimedAs of(String code) {
        return Codes.parse(
                TimedAs.class, code, () -> ApiProblem.badRequest("invalid_timed_as", "Choose a reminder or an event."));
    }

    /** From a database column. */
    public static TimedAs read(String code) {
        return Codes.read(TimedAs.class, code);
    }
}

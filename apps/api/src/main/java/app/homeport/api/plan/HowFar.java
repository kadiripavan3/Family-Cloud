package app.homeport.api.plan;

import app.homeport.api.common.ApiProblem;
import app.homeport.api.common.Codes;
import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/**
 * Where a goal's number comes from: what people put in by hand, the ticks of its list of steps, or a number
 * read from somewhere else.
 */
public enum HowFar {
    NUMBER,
    TICKS,
    SOURCE;

    @JsonValue
    public String code() {
        return Codes.of(this);
    }

    @JsonCreator
    public static HowFar of(String code) {
        return Codes.parse(
                HowFar.class,
                code,
                () -> ApiProblem.badRequest(
                        "invalid_how", "Choose a number, a list of steps or a number from elsewhere."));
    }

    /** From a database column. */
    public static HowFar read(String code) {
        return Codes.read(HowFar.class, code);
    }
}

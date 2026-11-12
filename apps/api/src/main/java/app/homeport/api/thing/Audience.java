package app.homeport.api.thing;

import app.homeport.api.common.ApiProblem;
import app.homeport.api.common.Codes;
import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/** Who a thing is shared with: only its owner, some people chosen by name, or everyone in the circle. */
public enum Audience {
    ME,
    SOME,
    CIRCLE;

    @JsonValue
    public String code() {
        return Codes.of(this);
    }

    @JsonCreator
    public static Audience of(String code) {
        return Codes.parse(
                Audience.class,
                code,
                () -> ApiProblem.badRequest("invalid_audience", "Choose only you, some people or everyone."));
    }

    /** From a database column. */
    public static Audience read(String code) {
        return Codes.read(Audience.class, code);
    }
}

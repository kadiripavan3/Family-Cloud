package app.homeport.api.list;

import app.homeport.api.common.ApiProblem;
import app.homeport.api.common.Codes;
import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/** What someone last did in a list: "Alex is adding", "Alex is ticking things off". */
public enum Did {
    ADDED,
    TICKED;

    @JsonValue
    public String code() {
        return Codes.of(this);
    }

    @JsonCreator
    public static Did of(String code) {
        return Codes.parse(
                Did.class, code, () -> ApiProblem.badRequest("invalid_did", "That isn't something we keep."));
    }

    /** From a database column. */
    public static Did read(String code) {
        return Codes.read(Did.class, code);
    }
}

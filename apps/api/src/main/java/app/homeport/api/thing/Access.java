package app.homeport.api.thing;

import app.homeport.api.common.ApiProblem;
import app.homeport.api.common.Codes;
import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/** What one person may do with a thing shared with some people. */
public enum Access {
    EDIT,
    VIEW,
    NONE;

    @JsonValue
    public String code() {
        return Codes.of(this);
    }

    @JsonCreator
    public static Access of(String code) {
        return Codes.parse(
                Access.class,
                code,
                () -> ApiProblem.badRequest("invalid_access", "Choose can edit, can view or can't see it."));
    }

    /** From a database column. */
    public static Access read(String code) {
        return Codes.read(Access.class, code);
    }
}

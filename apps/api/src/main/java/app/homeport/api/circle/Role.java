package app.homeport.api.circle;

import app.homeport.api.common.ApiProblem;
import app.homeport.api.common.Codes;
import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/** What someone is in a circle. It decides what they see to begin with. */
public enum Role {
    OWNER,
    ADULT,
    TEEN,
    CHILD,
    GUEST;

    @JsonValue
    public String code() {
        return Codes.of(this);
    }

    @JsonCreator
    public static Role of(String code) {
        return Codes.parse(
                Role.class, code, () -> ApiProblem.badRequest("invalid_role", "Choose a role from the list."));
    }

    /** From a database column. */
    public static Role read(String code) {
        return Codes.read(Role.class, code);
    }
}

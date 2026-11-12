package app.homeport.api.jot;

import app.homeport.api.common.ApiProblem;
import app.homeport.api.common.Codes;
import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/**
 * What a name in a line means: the thing is for them, it is given to them to do, they come along, or it is
 * simply about them.
 */
public enum PersonRole {
    FOR,
    GIVEN_TO,
    WITH,
    ABOUT;

    @JsonValue
    public String code() {
        return Codes.of(this);
    }

    @JsonCreator
    public static PersonRole of(String code) {
        return Codes.parse(
                PersonRole.class,
                code,
                () -> ApiProblem.badRequest("invalid_role", "That isn't something a name can mean."));
    }

    /** From a database column. */
    public static PersonRole read(String code) {
        return Codes.read(PersonRole.class, code);
    }
}

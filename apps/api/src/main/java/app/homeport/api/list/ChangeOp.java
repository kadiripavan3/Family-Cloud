package app.homeport.api.list;

import app.homeport.api.common.ApiProblem;
import app.homeport.api.common.Codes;
import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/** One change in a queue of changes a phone kept while it had no signal: to a line of a list, or a block of a page. */
public enum ChangeOp {
    ADD,
    CHANGE,
    REMOVE;

    @JsonValue
    public String code() {
        return Codes.of(this);
    }

    @JsonCreator
    public static ChangeOp of(String code) {
        return Codes.parse(
                ChangeOp.class, code, () -> ApiProblem.badRequest("invalid_change", "That isn't a change we know."));
    }

    /** From a database column. */
    public static ChangeOp read(String code) {
        return Codes.read(ChangeOp.class, code);
    }
}

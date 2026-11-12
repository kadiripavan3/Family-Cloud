package app.homeport.api.plan;

import app.homeport.api.common.ApiProblem;
import app.homeport.api.common.Codes;
import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/** What someone said to an event: going, maybe, or can't. No answer yet is no value at all. */
public enum Answer {
    GOING,
    MAYBE,
    CANT;

    @JsonValue
    public String code() {
        return Codes.of(this);
    }

    @JsonCreator
    public static Answer of(String code) {
        return Codes.parse(
                Answer.class, code, () -> ApiProblem.badRequest("invalid_answer", "Choose going, maybe or can't."));
    }

    /** From a database column. */
    public static Answer read(String code) {
        return Codes.read(Answer.class, code);
    }
}

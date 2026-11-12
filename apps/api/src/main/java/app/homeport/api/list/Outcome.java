package app.homeport.api.list;

import app.homeport.api.common.ApiProblem;
import app.homeport.api.common.Codes;
import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/**
 * What became of one change that was sent late. A change is never an error for the ones after it: each gets
 * its own answer, and the phone can drop it from its queue whatever the answer is.
 */
public enum Outcome {
    /** It is in. Also when it was in already: sending a change twice is fine. */
    DONE,
    /** What it was about was removed in the meantime, so there was nothing left to change. */
    GONE,
    /** It can't be done as sent (the sentence says why). Sending it again won't help. */
    REFUSED;

    @JsonValue
    public String code() {
        return Codes.of(this);
    }

    @JsonCreator
    public static Outcome of(String code) {
        return Codes.parse(
                Outcome.class, code, () -> ApiProblem.badRequest("invalid_outcome", "That isn't an outcome we know."));
    }

    /** From a database column. */
    public static Outcome read(String code) {
        return Codes.read(Outcome.class, code);
    }
}

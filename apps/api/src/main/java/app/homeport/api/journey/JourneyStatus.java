package app.homeport.api.journey;

import app.homeport.api.common.ApiProblem;
import app.homeport.api.common.Codes;
import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/** Where a journey stands in Journey: being told, resting, or finished. The words are Journey's own. */
public enum JourneyStatus {
    ACTIVE,
    PAUSED,
    COMPLETED;

    @JsonValue
    public String code() {
        return Codes.of(this);
    }

    @JsonCreator
    public static JourneyStatus of(String code) {
        return Codes.parse(
                JourneyStatus.class,
                code,
                () -> ApiProblem.badRequest("invalid_status", "A journey is active, paused or completed."));
    }

    /** From a database column, or from Journey's own answer. */
    public static JourneyStatus read(String code) {
        return Codes.read(JourneyStatus.class, code);
    }
}

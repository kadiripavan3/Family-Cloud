package app.homeport.api.plan;

import app.homeport.api.common.ApiProblem;
import app.homeport.api.common.Codes;
import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/** The places a goal can read its number from: a cell of a sheet in Money, or the days of a challenge in Journey. */
public enum GoalSource {
    SHEET,
    JOURNEY;

    @JsonValue
    public String code() {
        return Codes.of(this);
    }

    @JsonCreator
    public static GoalSource of(String code) {
        return Codes.parse(
                GoalSource.class,
                code,
                () -> ApiProblem.badRequest("invalid_source", "Choose a sheet or a challenge in Journey."));
    }

    /** From a database column. */
    public static GoalSource read(String code) {
        return Codes.read(GoalSource.class, code);
    }
}

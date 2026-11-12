package app.homeport.api.plan;

import app.homeport.api.common.ApiProblem;
import app.homeport.api.common.Codes;
import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/** What a goal counts: money, in cents with a currency, or a plain number of something (books, stars, days). */
public enum GoalUnit {
    MONEY,
    COUNT;

    @JsonValue
    public String code() {
        return Codes.of(this);
    }

    @JsonCreator
    public static GoalUnit of(String code) {
        return Codes.parse(
                GoalUnit.class, code, () -> ApiProblem.badRequest("invalid_unit", "Choose money or a number."));
    }

    /** From a database column. */
    public static GoalUnit read(String code) {
        return Codes.read(GoalUnit.class, code);
    }
}

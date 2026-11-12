package app.homeport.api.money.sheet;

import app.homeport.api.common.ApiProblem;
import app.homeport.api.common.Codes;
import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/** What stands under a column, in the row of totals: its sum, its average, how many rows have it, or how many are ticked. */
public enum Summary {
    NONE,
    SUM,
    AVG,
    COUNT,
    MIN,
    MAX,
    TICKED;

    @JsonValue
    public String code() {
        return Codes.of(this);
    }

    @JsonCreator
    public static Summary of(String code) {
        return Codes.parse(
                Summary.class,
                code,
                () -> ApiProblem.badRequest(
                        "invalid_summary",
                        "Choose a sum, an average, a count, the smallest, the largest or the ticked ones."));
    }

    /** From a database column. */
    public static Summary read(String code) {
        return Codes.read(Summary.class, code);
    }
}

package app.homeport.api.money.sheet;

import app.homeport.api.common.ApiProblem;
import app.homeport.api.common.Codes;
import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/**
 * What a column of a sheet holds. A column has a kind so that a cost can't be typed as a word; a formula
 * column holds nothing itself and is worked out from the others.
 */
public enum ColumnKind {
    TEXT,
    NUMBER,
    MONEY,
    DATE,
    TICK,
    CHOICE,
    PERSON,
    FORMULA;

    @JsonValue
    public String code() {
        return Codes.of(this);
    }

    @JsonCreator
    public static ColumnKind of(String code) {
        return Codes.parse(
                ColumnKind.class,
                code,
                () -> ApiProblem.badRequest(
                        "invalid_column",
                        "A column holds text, a number, money, a date, a tick, a choice, a person or a formula."));
    }

    /** From a database column. */
    public static ColumnKind read(String code) {
        return Codes.read(ColumnKind.class, code);
    }
}

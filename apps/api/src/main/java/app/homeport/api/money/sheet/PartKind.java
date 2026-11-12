package app.homeport.api.money.sheet;

import app.homeport.api.common.ApiProblem;
import app.homeport.api.common.Codes;
import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/** What one chip of a formula is, so the app can draw each kind its own way. */
public enum PartKind {
    FUNCTION,
    COLUMN,
    SIGN,
    NUMBER,
    TEXT,
    WORDS,
    BRACKET;

    @JsonValue
    public String code() {
        return Codes.of(this);
    }

    @JsonCreator
    public static PartKind of(String code) {
        return Codes.parse(
                PartKind.class, code, () -> ApiProblem.badRequest("invalid_part", "That isn't a part of a formula."));
    }

    /** From a database column. */
    public static PartKind read(String code) {
        return Codes.read(PartKind.class, code);
    }
}

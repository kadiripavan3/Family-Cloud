package app.homeport.api.money.sheet;

import app.homeport.api.common.ApiProblem;
import app.homeport.api.common.Codes;
import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/** What one cell, total or answer holds: one of the kinds of value, nothing yet, or a sentence saying why it can't be worked out. */
public enum CellKind {
    EMPTY,
    TEXT,
    NUMBER,
    MONEY,
    DATE,
    TICK,
    PERSON,
    PROBLEM;

    @JsonValue
    public String code() {
        return Codes.of(this);
    }

    @JsonCreator
    public static CellKind of(String code) {
        return Codes.parse(
                CellKind.class, code, () -> ApiProblem.badRequest("invalid_cell", "That isn't a kind of cell."));
    }

    /** From a database column. */
    public static CellKind read(String code) {
        return Codes.read(CellKind.class, code);
    }
}

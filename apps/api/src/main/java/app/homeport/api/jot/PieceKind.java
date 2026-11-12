package app.homeport.api.jot;

import app.homeport.api.common.ApiProblem;
import app.homeport.api.common.Codes;
import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/**
 * What a piece of a line was read as: a day, a time, a person, when to remind, how it repeats, which list,
 * how many, or a code.
 */
public enum PieceKind {
    DAY,
    TIME,
    PERSON,
    REMIND,
    REPEAT,
    LIST,
    AMOUNT,
    CODE;

    @JsonValue
    public String code() {
        return Codes.of(this);
    }

    @JsonCreator
    public static PieceKind of(String code) {
        return Codes.parse(
                PieceKind.class,
                code,
                () -> ApiProblem.badRequest("invalid_piece", "That isn't a piece of a reading."));
    }

    /** From a database column. */
    public static PieceKind read(String code) {
        return Codes.read(PieceKind.class, code);
    }
}

package app.homeport.api.jot;

import app.homeport.api.common.ApiProblem;
import app.homeport.api.common.Codes;
import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/** What kind of secret a line looks like: a door or PIN code, a password, a bank account number, a card number. */
public enum CodeKind {
    CODE,
    PASSWORD,
    IBAN,
    CARD;

    @JsonValue
    public String code() {
        return Codes.of(this);
    }

    @JsonCreator
    public static CodeKind of(String code) {
        return Codes.parse(
                CodeKind.class, code, () -> ApiProblem.badRequest("invalid_code_kind", "That isn't a kind of code."));
    }

    /** From a database column. */
    public static CodeKind read(String code) {
        return Codes.read(CodeKind.class, code);
    }
}

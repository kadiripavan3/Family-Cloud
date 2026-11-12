package app.homeport.api.jot;

import app.homeport.api.common.ApiProblem;
import app.homeport.api.common.Codes;
import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/**
 * What happens to a jot that looks like a code or a password: ask first, keep it in the Vault (the phone does
 * that; the API can't read the Vault), or treat it as a note like any other.
 */
public enum CodesGo {
    ASK,
    VAULT,
    NOTE;

    @JsonValue
    public String code() {
        return Codes.of(this);
    }

    @JsonCreator
    public static CodesGo of(String code) {
        return Codes.parse(
                CodesGo.class,
                code,
                () -> ApiProblem.badRequest("invalid_codes", "Choose ask first, the Vault or a note."));
    }

    /** From a database column. */
    public static CodesGo read(String code) {
        return Codes.read(CodesGo.class, code);
    }
}

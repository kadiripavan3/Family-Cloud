package app.homeport.api.vault;

import app.homeport.api.common.ApiProblem;
import app.homeport.api.common.Codes;
import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/**
 * How good a password is, as far as the phone could tell. The phone works it out and sends the word: the API
 * can't read the password, so it can't know. Nothing sets "leaked" yet: that needs a leak-checking service.
 */
public enum VaultHealth {
    OK,
    WEAK,
    REUSED,
    LEAKED;

    @JsonValue
    public String code() {
        return Codes.of(this);
    }

    @JsonCreator
    public static VaultHealth of(String code) {
        return Codes.parse(
                VaultHealth.class,
                code,
                () -> ApiProblem.badRequest("invalid_health", "That isn't something a password can be."));
    }

    /** From a database column. */
    public static VaultHealth read(String code) {
        return Codes.read(VaultHealth.class, code);
    }
}

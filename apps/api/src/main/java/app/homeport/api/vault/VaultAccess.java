package app.homeport.api.vault;

import app.homeport.api.common.ApiProblem;
import app.homeport.api.common.Codes;
import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/**
 * What someone may do with a Vault item that was shared with them. "Use" means the app fills it in or copies
 * it once without showing it: a rule the app keeps, not something the scrambling can enforce, because a
 * phone that can fill a password in holds it for that moment.
 */
public enum VaultAccess {
    USE,
    SEE,
    CHANGE;

    @JsonValue
    public String code() {
        return Codes.of(this);
    }

    @JsonCreator
    public static VaultAccess of(String code) {
        return Codes.parse(
                VaultAccess.class,
                code,
                () -> ApiProblem.badRequest("invalid_access", "Choose can use, can see or can change."));
    }

    /** From a database column. */
    public static VaultAccess read(String code) {
        return Codes.read(VaultAccess.class, code);
    }
}

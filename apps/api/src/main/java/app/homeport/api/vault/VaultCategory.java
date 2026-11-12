package app.homeport.api.vault;

import app.homeport.api.common.ApiProblem;
import app.homeport.api.common.Codes;
import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/** The six drawers of the Vault. */
public enum VaultCategory {
    LOGIN("Login"),
    CARD("Card"),
    ID("ID"),
    WIFI("Wi‑Fi"),
    CODE("Code"),
    SECRET("Secret");

    private final String label;

    VaultCategory(String label) {
        this.label = label;
    }

    /** The word a person reads: "Login" in "Login · netflix.com". */
    public String label() {
        return label;
    }

    @JsonValue
    public String code() {
        return Codes.of(this);
    }

    @JsonCreator
    public static VaultCategory of(String code) {
        return Codes.parse(
                VaultCategory.class,
                code,
                () -> ApiProblem.badRequest(
                        "invalid_category", "Choose a login, a card, an ID, Wi‑Fi, a code or a secret."));
    }

    /** From a database column. */
    public static VaultCategory read(String code) {
        return Codes.read(VaultCategory.class, code);
    }
}

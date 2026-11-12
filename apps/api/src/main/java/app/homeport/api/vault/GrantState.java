package app.homeport.api.vault;

import app.homeport.api.common.ApiProblem;
import app.homeport.api.common.Codes;
import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/**
 * Where one person stands with one Vault item they may see.
 *
 * <ul>
 *   <li>{@code READY}: the API holds the item's key wrapped for them and will hand it out.
 *   <li>{@code WAITING}: they should have it, but the owner's phone hasn't wrapped the key for them yet (they
 *       joined later, or set up their Vault later).
 *   <li>{@code USED}: it was shared to be opened once, and it has been.
 *   <li>{@code STOPPED}: it was shared until a moment that has passed.
 * </ul>
 */
public enum GrantState {
    READY,
    WAITING,
    USED,
    STOPPED;

    /**
     * @param granted there is a row for this person and this item
     * @param hasKey the row holds a wrapped key
     * @param used a once-only key was handed out
     * @param stopped the moment it stops working has passed
     */
    public static GrantState from(boolean granted, boolean hasKey, boolean used, boolean stopped) {
        if (!granted) {
            return WAITING;
        }
        if (used) {
            return USED;
        }
        if (stopped) {
            return STOPPED;
        }
        return hasKey ? READY : WAITING;
    }

    @JsonValue
    public String code() {
        return Codes.of(this);
    }

    @JsonCreator
    public static GrantState of(String code) {
        return Codes.parse(GrantState.class, code, () -> ApiProblem.badRequest("invalid_state", "That isn't a state."));
    }

    /** From a database column. */
    public static GrantState read(String code) {
        return Codes.read(GrantState.class, code);
    }
}

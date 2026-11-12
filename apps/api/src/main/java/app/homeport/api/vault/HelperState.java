package app.homeport.api.vault;

import app.homeport.api.common.ApiProblem;
import app.homeport.api.common.Codes;
import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/**
 * Where a request to be someone's Vault helper stands. Only someone who said yes is given a share of the
 * Vault key to keep.
 */
public enum HelperState {
    ASKED,
    ACCEPTED,
    DECLINED;

    /** What can happen: the owner asks (or asks again), the helper says yes or no. Removing a helper deletes the row. */
    public enum Event {
        ASK,
        ACCEPT,
        DECLINE
    }

    /** Where this event leads from here, or the sentence for the person who tried when it isn't allowed. */
    public HelperState after(Event event) {
        return switch (event) {
            // Asking someone who already said yes changes nothing; asking after a no asks again.
            case ASK -> this == ACCEPTED ? ACCEPTED : ASKED;
            case ACCEPT ->
                switch (this) {
                    case ASKED, ACCEPTED -> ACCEPTED;
                    case DECLINED ->
                        throw ApiProblem.conflict(
                                "already_declined",
                                "You said no to this. They can ask you again if you changed your mind.");
                };
            // Someone who said yes can step down later: their share is thrown away.
            case DECLINE -> DECLINED;
        };
    }

    @JsonValue
    public String code() {
        return Codes.of(this);
    }

    @JsonCreator
    public static HelperState of(String code) {
        return Codes.parse(
                HelperState.class, code, () -> ApiProblem.badRequest("invalid_state", "That isn't a state."));
    }

    /** From a database column. */
    public static HelperState read(String code) {
        return Codes.read(HelperState.class, code);
    }
}

package app.homeport.api.vault;

import app.homeport.api.common.ApiProblem;
import app.homeport.api.common.Codes;
import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/**
 * Where a recovery stands: getting back into a Vault on a new phone with the help of two helpers. Only an
 * open one does anything; once it has ended, in whichever way, it stays ended and a new one has to be started.
 */
public enum RecoveryState {
    /** Started by the owner. Helpers can pass their shares on; the owner's new phone can fetch them. */
    OPEN,
    /** The new phone rebuilt the Vault key and closed it. */
    DONE,
    /** The owner cancelled it (perhaps because they never started it). */
    CANCELLED,
    /** Seven days went by. */
    LAPSED;

    /** What can happen: a helper passes a share on, the owner finishes or cancels, the clock runs out. */
    public enum Event {
        GIVE_SHARE,
        FINISH,
        CANCEL,
        LAPSE
    }

    /** Where this event leads from here, or the sentence for the person who tried when it isn't allowed. */
    public RecoveryState after(Event event) {
        if (this == OPEN) {
            return switch (event) {
                case GIVE_SHARE -> OPEN;
                case FINISH -> DONE;
                case CANCEL -> CANCELLED;
                case LAPSE -> LAPSED;
            };
        }
        // Finishing what is finished, cancelling what is cancelled and the clock running on change nothing.
        if (event == Event.LAPSE
                || (this == DONE && event == Event.FINISH)
                || (this == CANCELLED && event == Event.CANCEL)) {
            return this;
        }
        throw ApiProblem.conflict(
                "recovery_over",
                switch (this) {
                    case DONE -> "That recovery is finished. Start a new one if you need to.";
                    case CANCELLED -> "That recovery was cancelled. Start a new one if you need to.";
                    default -> "That recovery ran out after 7 days. Start a new one.";
                });
    }

    @JsonValue
    public String code() {
        return Codes.of(this);
    }

    @JsonCreator
    public static RecoveryState of(String code) {
        return Codes.parse(
                RecoveryState.class, code, () -> ApiProblem.badRequest("invalid_state", "That isn't a state."));
    }

    /** From a database column. */
    public static RecoveryState read(String code) {
        return Codes.read(RecoveryState.class, code);
    }
}

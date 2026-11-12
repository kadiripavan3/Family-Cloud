package app.homeport.api.vault;

import app.homeport.api.common.ApiProblem;
import app.homeport.api.common.Codes;
import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;
import org.springframework.http.HttpStatus;

/**
 * "If something happens": where one person's emergency access stands, and what may happen next.
 *
 * <pre>
 *            the owner turns it on            the trusted person asks          the wait is over
 *   OFF  ───────────────────────────▶  READY ───────────────────────▶ ASKED ───────────────────▶ OPEN
 *    ▲                                  ▲  ▲                            │                          │
 *    │   the owner switches it off      │  └── the owner says no ───────┘                          │
 *    └──────────── from any state       └───── the owner changes anything (from ASKED or OPEN) ────┘
 * </pre>
 *
 * The trusted person is handed the escrow only in {@code OPEN}. Anything the owner does (a no, a change,
 * switching it off) ends a request that is running: whoever is at their phone doesn't need emergency access.
 */
public enum EmergencyState {
    /** Not switched on: there is no trusted person and no escrow. */
    OFF,
    /** Switched on. Nobody has asked. */
    READY,
    /** The trusted person asked. The owner was told and can say no until the wait is over. */
    ASKED,
    /** The wait ended without a no. The API hands the escrow to the trusted person. */
    OPEN;

    /** What can happen. The first three are the owner's, the next two the trusted person's, the last the clock's. */
    public enum Event {
        /** The owner turns it on, or changes the person, the wait, the items or the note. */
        SET,
        SWITCH_OFF,
        SAY_NO,
        ASK,
        /** The trusted person reads the escrow. */
        READ,
        WAIT_OVER
    }

    /**
     * Where this event leads from here. An event that isn't allowed here throws the sentence for the person
     * who tried; the clock's event simply changes nothing where it has nothing to do.
     */
    public EmergencyState after(Event event) {
        return switch (event) {
            case SET -> READY;
            case SWITCH_OFF -> OFF;
            case SAY_NO ->
                switch (this) {
                    case ASKED -> READY;
                    case OPEN ->
                        throw ApiProblem.conflict(
                                "already_open",
                                "The time to say no is over, and it has opened. Switch it off to stop it from here on.");
                    case OFF, READY ->
                        throw ApiProblem.conflict(
                                "nothing_asked", "Nobody has asked, so there is nothing to say no to.");
                };
            case ASK ->
                switch (this) {
                    case READY, ASKED -> ASKED; // asking again doesn't start the clock again
                    case OPEN -> OPEN;
                    case OFF -> throw gone();
                };
            case READ ->
                switch (this) {
                    case OPEN -> OPEN;
                    case ASKED ->
                        throw new ApiProblem(
                                HttpStatus.FORBIDDEN,
                                "not_yet",
                                "It hasn't opened yet. It opens when the wait is over, unless they say no before then.");
                    case READY ->
                        throw new ApiProblem(
                                HttpStatus.FORBIDDEN,
                                "ask_first",
                                "Ask first. They are told, and it opens if they don't say no in time.");
                    case OFF -> throw gone();
                };
            case WAIT_OVER -> this == ASKED ? OPEN : this;
        };
    }

    private static ApiProblem gone() {
        return new ApiProblem(
                HttpStatus.NOT_FOUND, "not_found", "That isn't there any more. They may have switched it off.");
    }

    @JsonValue
    public String code() {
        return Codes.of(this);
    }

    @JsonCreator
    public static EmergencyState of(String code) {
        return Codes.parse(
                EmergencyState.class, code, () -> ApiProblem.badRequest("invalid_state", "That isn't a state."));
    }

    /** From a database column. */
    public static EmergencyState read(String code) {
        return Codes.read(EmergencyState.class, code);
    }
}

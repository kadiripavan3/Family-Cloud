package app.homeport.api.jot;

import app.homeport.api.common.ApiProblem;
import app.homeport.api.common.Codes;
import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/**
 * What a line was read as: an event, a reminder, a line for a list, a note, or something that looks like a
 * code or a password (which is held back for the Vault instead of being filed).
 */
public enum ReadAs {
    EVENT,
    REMINDER,
    LIST_ITEM,
    NOTE,
    CODE;

    @JsonValue
    public String code() {
        return Codes.of(this);
    }

    @JsonCreator
    public static ReadAs of(String code) {
        return Codes.parse(
                ReadAs.class,
                code,
                () -> ApiProblem.badRequest("invalid_reading", "Choose an event, a reminder, a list or a note."));
    }

    /** From a database column. */
    public static ReadAs read(String code) {
        return Codes.read(ReadAs.class, code);
    }
}

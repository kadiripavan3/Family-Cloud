package app.homeport.api.plan;

import app.homeport.api.common.ApiProblem;
import app.homeport.api.common.Codes;
import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/** The small picture in front of the line under a title: it repeats, it is at a place, it reminds, something is attached. */
public enum NoteIcon {
    NONE,
    REPEAT,
    PIN,
    BELL,
    CLIP;

    @JsonValue
    public String code() {
        return Codes.of(this);
    }

    @JsonCreator
    public static NoteIcon of(String code) {
        return Codes.parse(NoteIcon.class, code, () -> ApiProblem.badRequest("invalid_icon", "That isn't an icon."));
    }

    /** From a database column. */
    public static NoteIcon read(String code) {
        return Codes.read(NoteIcon.class, code);
    }
}

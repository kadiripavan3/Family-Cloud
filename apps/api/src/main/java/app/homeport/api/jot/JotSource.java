package app.homeport.api.jot;

import app.homeport.api.common.ApiProblem;
import app.homeport.api.common.Codes;
import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/**
 * Where a jot came from: the app itself, a widget, the pinned notification, a voice, another app's share
 * button, or the Lock Screen.
 */
public enum JotSource {
    APP,
    WIDGET,
    NOTIFICATION,
    VOICE,
    SHARE,
    LOCK_SCREEN;

    @JsonValue
    public String code() {
        return Codes.of(this);
    }

    @JsonCreator
    public static JotSource of(String code) {
        return Codes.parse(
                JotSource.class, code, () -> ApiProblem.badRequest("invalid_source", "That isn't a way in we know."));
    }

    /** From a database column. */
    public static JotSource read(String code) {
        return Codes.read(JotSource.class, code);
    }
}

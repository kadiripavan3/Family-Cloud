package app.homeport.api.journey;

import app.homeport.api.common.Codes;
import com.fasterxml.jackson.annotation.JsonValue;

/** Which Journey this API talks to: the real one, a stand-in with sample journeys, or none. */
public enum JourneyMode {
    HTTP,
    LOCAL,
    OFF;

    @JsonValue
    public String code() {
        return Codes.of(this);
    }
}

package app.homeport.api.journey;

import app.homeport.api.common.ApiProblem;
import app.homeport.api.common.Codes;
import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/**
 * Who can see a journey in Journey: anyone (public), anyone with its link (unlisted), or only its authors
 * (private). The words are Journey's own; a journey made from here starts as private.
 */
public enum JourneyVisibility {
    PUBLIC,
    UNLISTED,
    PRIVATE;

    @JsonValue
    public String code() {
        return Codes.of(this);
    }

    @JsonCreator
    public static JourneyVisibility of(String code) {
        return Codes.parse(
                JourneyVisibility.class,
                code,
                () -> ApiProblem.badRequest("invalid_visibility", "Choose private, unlisted or public."));
    }

    /** From a database column, or from Journey's own answer. */
    public static JourneyVisibility read(String code) {
        return Codes.read(JourneyVisibility.class, code);
    }
}

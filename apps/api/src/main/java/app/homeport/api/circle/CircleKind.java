package app.homeport.api.circle;

import app.homeport.api.common.ApiProblem;
import app.homeport.api.common.Codes;
import app.homeport.api.thing.Audience;
import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/**
 * What a circle is: a family, a couple, a flat, a group of friends, or one person for now. The kind shapes
 * what the circle is offered (words, templates, what new things start as); it never limits what it can hold.
 */
public enum CircleKind {
    FAMILY,
    COUPLE,
    FLAT,
    CREW,
    SOLO;

    @JsonValue
    public String code() {
        return Codes.of(this);
    }

    @JsonCreator
    public static CircleKind of(String code) {
        return Codes.parse(
                CircleKind.class,
                code,
                () -> ApiProblem.badRequest("invalid_kind", "Choose a family, a couple, housemates or friends."));
    }

    /** From a database column. */
    public static CircleKind read(String code) {
        return Codes.read(CircleKind.class, code);
    }

    /** What a new thing starts as: in a family it is yours until you share it; equals share from the start. */
    public Audience startsAs() {
        return this == FAMILY || this == SOLO ? Audience.ME : Audience.CIRCLE;
    }

    /** Only a family has roles. Everywhere else people are equals. */
    public boolean hasRoles() {
        return this == FAMILY;
    }
}

package app.homeport.api.thing;

import app.homeport.api.common.ApiProblem;
import app.homeport.api.common.Codes;
import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/** Where a thing lives: one of the places in Home's top row (Today shows all of them). */
public enum Place {
    PLAN,
    NOTES,
    LIBRARY,
    MONEY,
    VAULT;

    @JsonValue
    public String code() {
        return Codes.of(this);
    }

    @JsonCreator
    public static Place of(String code) {
        return Codes.parse(
                Place.class, code, () -> ApiProblem.badRequest("invalid_place", "That isn't one of the places."));
    }

    /** From a database column. */
    public static Place read(String code) {
        return Codes.read(Place.class, code);
    }
}

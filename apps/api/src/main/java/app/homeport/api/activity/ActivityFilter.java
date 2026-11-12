package app.homeport.api.activity;

import app.homeport.api.common.ApiProblem;
import app.homeport.api.common.Codes;
import app.homeport.api.thing.Place;
import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/** The chips across the top of Activity. */
public enum ActivityFilter {
    ALL(null),
    /** What people ask you, and the answers to what you asked. */
    ASKS(null),
    PHOTOS(Place.LIBRARY),
    MONEY(Place.MONEY),
    PLAN(Place.PLAN);

    private final Place place;

    ActivityFilter(Place place) {
        this.place = place;
    }

    /** The place whose lines this chip shows, or null. */
    public Place place() {
        return place;
    }

    @JsonValue
    public String code() {
        return Codes.of(this);
    }

    @JsonCreator
    public static ActivityFilter of(String code) {
        return Codes.parse(
                ActivityFilter.class,
                code,
                () -> ApiProblem.badRequest("invalid_filter", "Choose All, Asks, Photos, Money or Plan."));
    }
}

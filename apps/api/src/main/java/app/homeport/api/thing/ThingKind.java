package app.homeport.api.thing;

import app.homeport.api.common.ApiProblem;
import app.homeport.api.common.Codes;
import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/**
 * Every kind of thing that can be kept and shared, and the place it lives in. A new kind is added here, gets
 * its own table under the thing's id, and is shared, hidden, searched and listed like every other kind
 * without anything else changing.
 */
public enum ThingKind {
    PAGE(Place.NOTES),
    CHECKLIST(Place.NOTES),
    PHOTO(Place.LIBRARY),
    VIDEO(Place.LIBRARY),
    DOCUMENT(Place.LIBRARY),
    ALBUM(Place.LIBRARY),
    /** A space or a folder in Notes: a space is a folder at the top. */
    FOLDER(Place.NOTES),
    BOARD(Place.NOTES),
    VAULT_ITEM(Place.VAULT),
    EVENT(Place.PLAN),
    REMINDER(Place.PLAN),
    GOAL(Place.PLAN),
    BILL(Place.MONEY),
    SHEET(Place.MONEY),
    SPLIT(Place.MONEY);

    private final Place place;

    ThingKind(Place place) {
        this.place = place;
    }

    public Place place() {
        return place;
    }

    @JsonValue
    public String code() {
        return Codes.of(this);
    }

    @JsonCreator
    public static ThingKind of(String code) {
        return Codes.parse(
                ThingKind.class, code, () -> ApiProblem.badRequest("invalid_thing", "That isn't something we keep."));
    }

    /** From a database column. */
    public static ThingKind read(String code) {
        return Codes.read(ThingKind.class, code);
    }
}

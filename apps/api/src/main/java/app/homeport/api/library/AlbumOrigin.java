package app.homeport.api.library;

import app.homeport.api.common.ApiProblem;
import app.homeport.api.common.Codes;
import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/**
 * How an album gets what is in it: put in by hand, filling itself with everything about one member, or
 * brought home from Journey.
 */
public enum AlbumOrigin {
    HAND,
    PERSON,
    JOURNEY;

    @JsonValue
    public String code() {
        return Codes.of(this);
    }

    @JsonCreator
    public static AlbumOrigin of(String code) {
        return Codes.parse(
                AlbumOrigin.class, code, () -> ApiProblem.badRequest("invalid_album", "That isn't a kind of album."));
    }

    /** From a database column. */
    public static AlbumOrigin read(String code) {
        return Codes.read(AlbumOrigin.class, code);
    }
}

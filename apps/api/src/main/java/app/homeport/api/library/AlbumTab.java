package app.homeport.api.library;

import app.homeport.api.common.ApiProblem;
import app.homeport.api.common.Codes;
import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/** The three tabs above the albums: shared with someone, only yours, and the ones that came home from Journey. */
public enum AlbumTab {
    SHARED,
    MINE,
    JOURNEY;

    @JsonValue
    public String code() {
        return Codes.of(this);
    }

    @JsonCreator
    public static AlbumTab of(String code) {
        return Codes.parse(
                AlbumTab.class, code, () -> ApiProblem.badRequest("invalid_tab", "Choose shared, mine or journey."));
    }
}

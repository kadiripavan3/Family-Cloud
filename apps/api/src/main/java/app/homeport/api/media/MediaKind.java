package app.homeport.api.media;

import app.homeport.api.common.ApiProblem;
import app.homeport.api.common.Codes;
import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/** What a file is. */
public enum MediaKind {
    PHOTO,
    VIDEO,
    FILE,
    AUDIO;

    @JsonValue
    public String code() {
        return Codes.of(this);
    }

    @JsonCreator
    public static MediaKind of(String code) {
        return Codes.parse(
                MediaKind.class,
                code,
                () -> ApiProblem.badRequest(
                        "invalid_media_kind", "Choose a photo, a video, a document or a recording."));
    }

    /** From a database column. */
    public static MediaKind read(String code) {
        return Codes.read(MediaKind.class, code);
    }
}

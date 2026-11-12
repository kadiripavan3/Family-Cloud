package app.homeport.api.media;

import app.homeport.api.common.Codes;
import com.fasterxml.jackson.annotation.JsonValue;

/**
 * Where a photo or clip stands. A photo is pending until its upload completes, then ready. A clip may be
 * processing in between, while the video service converts it; it can fail there (too long, unreadable).
 */
public enum MediaStatus {
    PENDING,
    WORKING,
    READY,
    FAILED;

    @JsonValue
    public String code() {
        return Codes.of(this);
    }

    /** From a database column. */
    public static MediaStatus read(String code) {
        return Codes.read(MediaStatus.class, code);
    }
}

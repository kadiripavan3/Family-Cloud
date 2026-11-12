package app.homeport.api.board;

import app.homeport.api.media.MediaKind;
import io.swagger.v3.oas.annotations.media.Schema;
import java.util.UUID;

/** The photo or recording of an entry, for someone who may have it. */
public record BoardMedia(
        UUID id,
        MediaKind kind,

        @Schema(description = "The photo, or the recording itself")
        String url,

        @Schema(nullable = true, description = "The photo, small. Null for a recording.")
        String thumbUrl,

        @Schema(nullable = true, description = "How long a recording is, in whole seconds")
        Integer seconds) {}

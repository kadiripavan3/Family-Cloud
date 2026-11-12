package app.homeport.api.page;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.UUID;

/**
 * A stretch of a text block that is bold, a link or a person's name. The text itself stays plain words; a
 * mark only says from where to where (counted the way a phone counts the characters of a string) and what.
 */
public record Mark(
        @Schema(description = "Where it starts in the text, from 0")
        int start,

        @Schema(description = "Where it ends: the place just after its last character")
        int end,

        MarkKind kind,

        @Schema(nullable = true, description = "For a link: the address, starting with http:// or https://")
        String url,

        @Schema(nullable = true, description = "For a name: the member it is")
        UUID memberId) {}

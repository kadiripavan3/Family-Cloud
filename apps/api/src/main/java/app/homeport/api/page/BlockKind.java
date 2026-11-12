package app.homeport.api.page;

import app.homeport.api.common.ApiProblem;
import app.homeport.api.common.Codes;
import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/**
 * What a block of a page is. Three kinds of text, and five things that stand between the text: a list to
 * tick, a photo, a file, a place, and a live block, which shows another thing (a bill, an event, a sheet, a
 * goal, a password) as it stands today.
 */
public enum BlockKind {
    PARAGRAPH,
    HEADING,
    BULLET,
    /** A list, drawn in the page with its lines. */
    CHECKLIST,
    PHOTO,
    FILE,
    /** Words and, when known, a point on the map. */
    PLACE,
    /** Another thing, by its id. Whoever may not see that thing sees that something is there, and nothing of it. */
    LIVE;

    @JsonValue
    public String code() {
        return Codes.of(this);
    }

    @JsonCreator
    public static BlockKind of(String code) {
        return Codes.parse(
                BlockKind.class,
                code,
                () -> ApiProblem.badRequest("invalid_block", "That isn't a kind of block we know."));
    }

    /** From a database column. */
    public static BlockKind read(String code) {
        return Codes.read(BlockKind.class, code);
    }

    /** True for the blocks that are words: a paragraph, a heading, a bullet. One can become another. */
    public boolean isText() {
        return this == PARAGRAPH || this == HEADING || this == BULLET;
    }
}

package app.homeport.api.page;

import app.homeport.api.common.ApiProblem;
import app.homeport.api.common.Codes;
import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/** What a stretch of a text block is marked as. A small set on purpose: text stays plain words with ranges over it. */
public enum MarkKind {
    BOLD,
    ITALIC,
    STRIKE,
    /** A web address to open. */
    LINK,
    /** Someone of the circle: "@Alex". */
    MENTION;

    @JsonValue
    public String code() {
        return Codes.of(this);
    }

    @JsonCreator
    public static MarkKind of(String code) {
        return Codes.parse(
                MarkKind.class,
                code,
                () -> ApiProblem.badRequest("invalid_mark", "We couldn't read the formatting of that text."));
    }

    /** From a database column. */
    public static MarkKind read(String code) {
        return Codes.read(MarkKind.class, code);
    }
}

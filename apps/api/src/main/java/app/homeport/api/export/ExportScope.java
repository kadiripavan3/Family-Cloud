package app.homeport.api.export;

import app.homeport.api.common.ApiProblem;
import app.homeport.api.common.Codes;
import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/** What an export holds: what you made yourself, or everything you may see. */
public enum ExportScope {
    /** Only what is yours: what you made in this circle, shared or not. */
    MINE,
    /** Everything in this circle you may see: yours, and what others shared with you. */
    EVERYTHING;

    @JsonValue
    public String code() {
        return Codes.of(this);
    }

    @JsonCreator
    public static ExportScope of(String code) {
        return Codes.parse(
                ExportScope.class,
                code,
                () -> ApiProblem.badRequest("invalid_scope", "Choose mine, or everything you can see."));
    }

    public static ExportScope read(String code) {
        return Codes.read(ExportScope.class, code);
    }
}

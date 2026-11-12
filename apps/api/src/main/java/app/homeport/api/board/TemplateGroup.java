package app.homeport.api.board;

import app.homeport.api.common.ApiProblem;
import app.homeport.api.common.Codes;
import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/**
 * The three shelves of the gallery. Templates and keepsakes are what "All 53" counts; fair and fun are the
 * small rituals, counted on their own.
 */
public enum TemplateGroup {
    TEMPLATES,
    KEEPSAKES,
    FAIR_AND_FUN;

    @JsonValue
    public String code() {
        return Codes.of(this);
    }

    @JsonCreator
    public static TemplateGroup of(String code) {
        return Codes.parse(
                TemplateGroup.class,
                code,
                () -> ApiProblem.badRequest("invalid_group", "Choose templates, keepsakes or fair and fun."));
    }

    /** From a database column. */
    public static TemplateGroup read(String code) {
        return Codes.read(TemplateGroup.class, code);
    }
}

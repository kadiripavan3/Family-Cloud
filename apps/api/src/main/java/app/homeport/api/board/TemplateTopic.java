package app.homeport.api.board;

import app.homeport.api.common.ApiProblem;
import app.homeport.api.common.Codes;
import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/** What a template is about: the small chips next to "All" in the gallery (Home, Kids, Food, Money, Trips). */
public enum TemplateTopic {
    HOME,
    KIDS,
    FOOD,
    MONEY,
    TRIPS,
    LANDLORD,
    TOGETHER,
    MEMORIES;

    @JsonValue
    public String code() {
        return Codes.of(this);
    }

    @JsonCreator
    public static TemplateTopic of(String code) {
        return Codes.parse(
                TemplateTopic.class,
                code,
                () -> ApiProblem.badRequest("invalid_topic", "That isn't one of the chips."));
    }

    /** From a database column. */
    public static TemplateTopic read(String code) {
        return Codes.read(TemplateTopic.class, code);
    }
}

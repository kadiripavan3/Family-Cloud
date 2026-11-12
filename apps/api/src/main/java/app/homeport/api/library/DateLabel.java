package app.homeport.api.library;

import app.homeport.api.common.ApiProblem;
import app.homeport.api.common.Codes;
import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/** What a day found in a document means: the day it expires, renews or is due. */
public enum DateLabel {
    EXPIRES("Expires"),
    VALID_UNTIL("Valid until"),
    RENEWS("Renews"),
    DUE("Due"),
    WARRANTY("Warranty to");

    private final String words;

    DateLabel(String words) {
        this.words = words;
    }

    /** How a line starts that names the day: "Expires 2 Aug 2027". */
    public String words() {
        return words;
    }

    @JsonValue
    public String code() {
        return Codes.of(this);
    }

    @JsonCreator
    public static DateLabel of(String code) {
        return Codes.parse(
                DateLabel.class,
                code,
                () -> ApiProblem.badRequest(
                        "invalid_date_label", "Choose expires, valid until, renews, due or warranty."));
    }

    /** From a database column. */
    public static DateLabel read(String code) {
        return Codes.read(DateLabel.class, code);
    }
}

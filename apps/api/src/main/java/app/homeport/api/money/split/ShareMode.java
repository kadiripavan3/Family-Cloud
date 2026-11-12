package app.homeport.api.money.split;

import app.homeport.api.common.ApiProblem;
import app.homeport.api.common.Codes;
import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/** How a shared cost is divided: equally, by shares (2 for one, 1 for another), or by exact amounts. */
public enum ShareMode {
    EQUAL,
    SHARES,
    EXACT;

    @JsonValue
    public String code() {
        return Codes.of(this);
    }

    @JsonCreator
    public static ShareMode of(String code) {
        return Codes.parse(
                ShareMode.class,
                code,
                () -> ApiProblem.badRequest("invalid_mode", "Split it equally, by shares or by exact amounts."));
    }

    /** From a database column. */
    public static ShareMode read(String code) {
        return Codes.read(ShareMode.class, code);
    }
}

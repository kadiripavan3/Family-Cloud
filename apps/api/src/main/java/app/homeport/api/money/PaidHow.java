package app.homeport.api.money;

import app.homeport.api.common.ApiProblem;
import app.homeport.api.common.Codes;
import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/**
 * How a bill gets paid: by hand, or by the bank on its own (a standing order you set up, a direct debit the
 * payee takes). The app never pays anything; this only says what to expect.
 */
public enum PaidHow {
    BY_HAND,
    STANDING_ORDER,
    DIRECT_DEBIT;

    @JsonValue
    public String code() {
        return Codes.of(this);
    }

    @JsonCreator
    public static PaidHow of(String code) {
        return Codes.parse(
                PaidHow.class,
                code,
                () -> ApiProblem.badRequest("invalid_paid_how", "Choose by hand, a standing order or a direct debit."));
    }

    /** From a database column. */
    public static PaidHow read(String code) {
        return Codes.read(PaidHow.class, code);
    }
}

package app.homeport.api.money;

import app.homeport.api.common.ApiProblem;
import app.homeport.api.common.Codes;
import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/** Which bills a list shows: the ones still to pay, the ones paid, or the subscriptions. */
public enum BillShow {
    DUE,
    PAID,
    SUBSCRIPTIONS;

    @JsonValue
    public String code() {
        return Codes.of(this);
    }

    @JsonCreator
    public static BillShow of(String code) {
        return Codes.parse(
                BillShow.class,
                code,
                () -> ApiProblem.badRequest("invalid_show", "Choose due, paid or subscriptions."));
    }

    /** From a database column. */
    public static BillShow read(String code) {
        return Codes.read(BillShow.class, code);
    }
}

package app.homeport.api.circle;

import app.homeport.api.common.ApiProblem;
import app.homeport.api.common.Codes;
import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/** Where a member stands: in the circle, invited and not there yet, in it without a phone, or gone. */
public enum MemberStatus {
    JOINED,
    INVITED,
    NO_PHONE,
    LEFT;

    @JsonValue
    public String code() {
        return Codes.of(this);
    }

    @JsonCreator
    public static MemberStatus of(String code) {
        return Codes.parse(
                MemberStatus.class, code, () -> ApiProblem.badRequest("invalid_status", "That isn't a status."));
    }

    /** From a database column. */
    public static MemberStatus read(String code) {
        return Codes.read(MemberStatus.class, code);
    }
}

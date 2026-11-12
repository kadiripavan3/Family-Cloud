package app.homeport.api.circle;

import app.homeport.api.common.ApiProblem;
import app.homeport.api.common.Codes;
import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/** Who a member is: someone with their own sign-in, a child an adult looks after, or a pet. */
public enum MemberKind {
    PERSON,
    CHILD,
    PET;

    @JsonValue
    public String code() {
        return Codes.of(this);
    }

    @JsonCreator
    public static MemberKind of(String code) {
        return Codes.parse(
                MemberKind.class,
                code,
                () -> ApiProblem.badRequest("invalid_member_kind", "Choose a person, a child or a pet."));
    }

    /** From a database column. */
    public static MemberKind read(String code) {
        return Codes.read(MemberKind.class, code);
    }
}

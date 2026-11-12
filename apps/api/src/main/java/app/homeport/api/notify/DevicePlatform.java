package app.homeport.api.notify;

import app.homeport.api.common.ApiProblem;
import app.homeport.api.common.Codes;
import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/** What kind of device asked for pushes. */
public enum DevicePlatform {
    IOS,
    ANDROID,
    WEB;

    @JsonValue
    public String code() {
        return Codes.of(this);
    }

    @JsonCreator
    public static DevicePlatform of(String code) {
        return Codes.parse(
                DevicePlatform.class,
                code,
                () -> ApiProblem.badRequest("invalid_platform", "That isn't a kind of device we know."));
    }
}

package app.homeport.api.export;

import app.homeport.api.common.Codes;
import com.fasterxml.jackson.annotation.JsonValue;

/** Where an export stands. */
public enum ExportState {
    /** Asked for; it will be made within a minute or two. */
    WAITING,
    /** Being put together. */
    WORKING,
    /** Made: it can be fetched until it expires. */
    READY,
    /** It couldn't be made. Asking again starts afresh. */
    FAILED;

    @JsonValue
    public String code() {
        return Codes.of(this);
    }

    public static ExportState read(String code) {
        return Codes.read(ExportState.class, code);
    }
}

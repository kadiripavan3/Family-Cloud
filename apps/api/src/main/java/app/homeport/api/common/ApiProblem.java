package app.homeport.api.common;

import org.springframework.http.HttpStatus;

/**
 * A failure the app can show to a person. {@code code} is stable and machine-readable; {@code
 * getMessage()} is plain English, written for the person using the app.
 */
public class ApiProblem extends RuntimeException {

    private final HttpStatus status;
    private final String code;

    public ApiProblem(HttpStatus status, String code, String message) {
        super(message);
        this.status = status;
        this.code = code;
    }

    public HttpStatus status() {
        return status;
    }

    public String code() {
        return code;
    }

    public static ApiProblem badRequest(String code, String message) {
        return new ApiProblem(HttpStatus.BAD_REQUEST, code, message);
    }

    public static ApiProblem conflict(String code, String message) {
        return new ApiProblem(HttpStatus.CONFLICT, code, message);
    }

    public static ApiProblem unauthorized(String code, String message) {
        return new ApiProblem(HttpStatus.UNAUTHORIZED, code, message);
    }
}

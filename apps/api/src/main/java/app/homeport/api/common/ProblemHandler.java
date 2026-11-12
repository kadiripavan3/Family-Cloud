package app.homeport.api.common;

import java.util.LinkedHashMap;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.TypeMismatchException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

/**
 * Turns every failure into the same JSON shape (RFC 9457 "problem details") with two extras the app
 * relies on: {@code code}, and for invalid input {@code fields} (field name to message). The {@code
 * detail} is always a sentence a person can read: the app shows it as it is.
 */
@RestControllerAdvice
public class ProblemHandler extends ResponseEntityExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(ProblemHandler.class);

    @ExceptionHandler(ApiProblem.class)
    ResponseEntity<ProblemDetail> handle(ApiProblem problem) {
        return ResponseEntity.status(problem.status())
                .body(problem(problem.status(), problem.code(), problem.getMessage()));
    }

    /**
     * Two requests changed the same thing at the same moment, or something was removed in between. Rare, and
     * trying again is the right answer, so say that rather than "something went wrong".
     */
    @ExceptionHandler(DataIntegrityViolationException.class)
    ResponseEntity<ProblemDetail> handle(DataIntegrityViolationException e, WebRequest request) {
        log.warn(
                "The database refused a change for {}: {}",
                request.getDescription(false),
                e.getMostSpecificCause().getMessage());
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(problem(
                        HttpStatus.CONFLICT,
                        "conflict",
                        "That changed while you were looking at it. Refresh and try again."));
    }

    /** Anything nobody planned for. The person gets a calm sentence; the log gets the whole story. */
    @ExceptionHandler(Exception.class)
    ResponseEntity<ProblemDetail> handle(Exception e, WebRequest request) throws Exception {
        if (e instanceof AccessDeniedException || e instanceof AuthenticationException) {
            throw e; // sign-in problems are answered by the security layer
        }
        log.error("Unexpected failure for {}", request.getDescription(false), e);
        ProblemDetail body = problem(
                HttpStatus.INTERNAL_SERVER_ERROR, "unexpected", "Something went wrong on our side. Please try again.");
        // The same id is on the log lines that say what went wrong.
        body.setProperty("requestId", RequestId.current());
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(body);
    }

    @Override
    protected ResponseEntity<Object> handleMethodArgumentNotValid(
            MethodArgumentNotValidException ex, HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        Map<String, String> fields = new LinkedHashMap<>();
        ex.getBindingResult()
                .getFieldErrors()
                .forEach(error -> fields.putIfAbsent(error.getField(), error.getDefaultMessage()));
        ProblemDetail body = problem(HttpStatus.BAD_REQUEST, "invalid_input", "Some details need another look.");
        body.setProperty("fields", fields);
        return ResponseEntity.badRequest().body(body);
    }

    /** A word the API doesn't know in a fixed set ("visibility": "friends") has its own answer, written where the set is defined. */
    @Override
    protected ResponseEntity<Object> handleHttpMessageNotReadable(
            HttpMessageNotReadableException ex, HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        for (Throwable cause = ex.getCause(); cause != null; cause = cause.getCause()) {
            if (cause instanceof ApiProblem problem) {
                return ResponseEntity.status(problem.status())
                        .body(problem(problem.status(), problem.code(), problem.getMessage()));
            }
        }
        return super.handleHttpMessageNotReadable(ex, headers, status, request);
    }

    /**
     * An id in the address that isn't an id ({@code /v1/sheets/nothing-here}) names nothing, so the answer is
     * the same as for an id nobody has: not found. A word in the question part that can't be read
     * ({@code ?limit=many}) stays what it is, a request we couldn't read.
     *
     * <p>A word from a fixed set is neither: {@code /templates/teleporter/start} and {@code ?place=attic} are
     * answered in the set's own sentence ("That isn't a template we have."), written where the set is defined.
     */
    @Override
    protected ResponseEntity<Object> handleTypeMismatch(
            TypeMismatchException ex, HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        for (Throwable cause = ex.getCause(); cause != null; cause = cause.getCause()) {
            if (cause instanceof ApiProblem problem) {
                return ResponseEntity.status(problem.status())
                        .body(problem(problem.status(), problem.code(), problem.getMessage()));
            }
        }
        if (ex instanceof MethodArgumentTypeMismatchException mismatch
                && mismatch.getParameter().hasParameterAnnotation(PathVariable.class)) {
            return handleExceptionInternal(ex, null, headers, HttpStatus.NOT_FOUND, request);
        }
        return super.handleTypeMismatch(ex, headers, status, request);
    }

    /**
     * Spring's own failures (a body it can't read, an address that doesn't exist, the wrong method) arrive
     * here. They get a code and a plain sentence like everything else, in place of Spring's technical wording.
     */
    @Override
    protected ResponseEntity<Object> handleExceptionInternal(
            Exception ex, Object body, HttpHeaders headers, HttpStatusCode statusCode, WebRequest request) {
        HttpStatus status = HttpStatus.resolve(statusCode.value());
        if (status == null) {
            status = HttpStatus.INTERNAL_SERVER_ERROR;
        }
        if (status.is5xxServerError()) {
            log.error("Unexpected failure for {}", request.getDescription(false), ex);
        }
        ProblemDetail problem = switch (status) {
            case BAD_REQUEST -> problem(status, "bad_request", "We couldn't read that. Check it and try again.");
            case NOT_FOUND -> problem(status, "not_found", "We couldn't find that.");
            case METHOD_NOT_ALLOWED -> problem(status, "method_not_allowed", "That can't be done here.");
            case NOT_ACCEPTABLE, UNSUPPORTED_MEDIA_TYPE ->
                problem(status, "unsupported_format", "We can't read or send that format.");
            case CONTENT_TOO_LARGE -> problem(status, "too_large", "That's too big to send.");
            case TOO_MANY_REQUESTS ->
                problem(status, "slow_down", "That's a lot at once. Wait a minute and try again.");
            default ->
                status.is5xxServerError()
                        ? problem(status, "unexpected", "Something went wrong on our side. Please try again.")
                        : problem(status, "request_failed", "That didn't work. Please try again.");
        };
        return super.handleExceptionInternal(ex, problem, headers, statusCode, request);
    }

    public static ProblemDetail problem(HttpStatus status, String code, String message) {
        ProblemDetail body = ProblemDetail.forStatusAndDetail(status, message);
        body.setProperty("code", code);
        return body;
    }
}

package app.homeport.api.common;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.UUID;
import org.slf4j.MDC;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Gives every request a short id, writes it on every log line the request causes and sends it back in the
 * {@code X-Request-Id} header. When something goes wrong, the id in the app's error (or in the proxy's log)
 * finds the lines that say why. Behind Fly.io the proxy's own id is used, so the two logs line up.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class RequestId extends OncePerRequestFilter {

    public static final String KEY = "request";

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String given = request.getHeader("Fly-Request-Id");
        String id = given != null && given.matches("[A-Za-z0-9-]{8,64}")
                ? given
                : UUID.randomUUID().toString().substring(0, 13);
        MDC.put(KEY, id);
        response.setHeader("X-Request-Id", id);
        try {
            chain.doFilter(request, response);
        } finally {
            MDC.remove(KEY);
        }
    }

    /** The id of the request this thread is answering, or null outside a request (a scheduled job). */
    public static String current() {
        return MDC.get(KEY);
    }
}

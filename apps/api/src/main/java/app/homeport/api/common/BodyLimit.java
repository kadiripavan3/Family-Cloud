package app.homeport.api.common;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ReadListener;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletInputStream;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Nothing the app sends the API is big: files go straight to storage, and what remains is a few lines of
 * JSON or a small form. So a request body over 64 KB is refused before anything reads it into memory, also
 * on the paths that need no sign-in (the video service's webhook, the public forms).
 *
 * <p>The Vault is allowed twice that: what it is sent was scrambled on the phone, and 64 KB of ciphertext is
 * 88 KB once it is written as text. Each of its routes bounds its own fields (see {@link Sealed}).
 *
 * <p>The one exception is the local stand-in for storage, which takes whole files and has its own ceiling.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 5)
public class BodyLimit extends OncePerRequestFilter {

    public static final int MAX_BYTES = 64 * 1024;
    public static final int MAX_VAULT_BYTES = 128 * 1024;

    private static int ceiling(HttpServletRequest request) {
        return request.getRequestURI().startsWith(request.getContextPath() + "/v1/vault/")
                ? MAX_VAULT_BYTES
                : MAX_BYTES;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return request.getRequestURI().startsWith(request.getContextPath() + "/local-media/");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        int max = ceiling(request);
        if (request.getContentLengthLong() > max) {
            response.setStatus(HttpStatus.CONTENT_TOO_LARGE.value());
            response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
            // Fixed words, never input.
            response.getWriter()
                    .write("{\"type\":\"about:blank\",\"title\":\"Content Too Large\",\"status\":413,"
                            + "\"detail\":\"That's more than we can take in one go.\",\"code\":\"too_large\"}");
            return;
        }
        // A body sent without saying how long it is gets counted as it is read.
        chain.doFilter(request.getContentLengthLong() < 0 ? new Counted(request, max) : request, response);
    }

    private static final class Counted extends HttpServletRequestWrapper {

        private final int max;

        Counted(HttpServletRequest request, int max) {
            super(request);
            this.max = max;
        }

        @Override
        public ServletInputStream getInputStream() throws IOException {
            ServletInputStream in = super.getInputStream();
            return new ServletInputStream() {
                private long read;

                private void count(int more) {
                    read += Math.max(more, 0);
                    if (read > max) {
                        throw new ApiProblem(
                                HttpStatus.CONTENT_TOO_LARGE, "too_large", "That's more than we can take in one go.");
                    }
                }

                @Override
                public int read() throws IOException {
                    int b = in.read();
                    count(b < 0 ? 0 : 1);
                    return b;
                }

                @Override
                public int read(byte[] buffer, int offset, int length) throws IOException {
                    int n = in.read(buffer, offset, length);
                    count(n);
                    return n;
                }

                @Override
                public boolean isFinished() {
                    return in.isFinished();
                }

                @Override
                public boolean isReady() {
                    return in.isReady();
                }

                @Override
                public void setReadListener(ReadListener listener) {
                    in.setReadListener(listener);
                }
            };
        }
    }
}

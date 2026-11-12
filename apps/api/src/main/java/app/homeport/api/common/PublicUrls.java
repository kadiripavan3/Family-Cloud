package app.homeport.api.common;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

/**
 * The address people reach the API at, for links that leave the app (a shared journey's web page, the
 * pictures in an email). Set {@code journey.public-url} wherever the API runs behind a proxy or sends links
 * from a scheduled job; without it, the address is taken from the request, which is right on a laptop and a
 * phone on the same Wi-Fi.
 */
@Component
public class PublicUrls {

    private final String base;
    private final String here;

    PublicUrls(@Value("${homeport.public-url:}") String base, @Value("${server.port:8080}") int port) {
        this.base = base == null ? "" : base.trim().replaceAll("/+$", "");
        this.here = "http://localhost:" + port;
    }

    /** The full address for a path that starts with a slash. */
    public String to(String path) {
        if (!base.isEmpty()) {
            return base + path;
        }
        if (RequestContextHolder.getRequestAttributes() == null) {
            // A scheduled job with no request and no configured address: this computer is the best guess, and
            // the right one in local mode. Anywhere else, journey.public-url is set.
            return here + path;
        }
        return ServletUriComponentsBuilder.fromCurrentContextPath().path(path).toUriString();
    }
}

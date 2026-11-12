package app.homeport.api.common;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * The address a request really came from. Behind a proxy, the usual "forwarded for" header starts with
 * whatever the caller chose to write, so it can't be used to count wrong passwords or to slow a script down.
 * The proxy's own header can: on Fly.io that is {@code Fly-Client-IP}, named in
 * {@code journey.client-address-header} ({@code HOMEPORT_CLIENT_ADDRESS_HEADER}). Without that setting (on a
 * developer's computer) the address of the connection itself is used.
 */
@Component
public class ClientAddress {

    private final String header;

    ClientAddress(@Value("${homeport.client-address-header:}") String header) {
        this.header = header == null ? "" : header.trim();
    }

    public String of(HttpServletRequest request) {
        if (!header.isEmpty()) {
            String given = request.getHeader(header);
            if (given != null && !given.isBlank()) {
                return given.trim();
            }
        }
        return request.getRemoteAddr();
    }
}

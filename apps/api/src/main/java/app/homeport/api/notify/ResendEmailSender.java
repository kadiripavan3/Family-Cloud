package app.homeport.api.notify;

import app.homeport.api.common.Http;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClient;

/**
 * Sends email through Resend: one call to its API per email. It needs an API key ({@code RESEND_API_KEY})
 * and a sender address on a domain that is verified with Resend ({@code HOMEPORT_EMAIL_FROM}, such as
 * {@code Journey <hello@yourdomain>}). Without a key the API doesn't start in this mode, so a missing key is
 * noticed at once rather than on a Sunday evening.
 *
 * <p>Resend takes a few emails a second. When it says "slow down" (429), or can't be reached, the email is
 * tried again later by whoever is sending; when it refuses the email itself (a wrong address, a sender that
 * isn't verified), trying again won't help.
 */
@Component
@ConditionalOnProperty(name = "homeport.email.mode", havingValue = "resend")
class ResendEmailSender implements EmailSender {

    private final RestClient resend;
    private final String from;

    ResendEmailSender(
            @Value("${homeport.email.resend.api-key:}") String apiKey,
            @Value("${homeport.email.resend.url:https://api.resend.com}") String url,
            @Value("${homeport.email.from}") String from) {
        if (apiKey == null || apiKey.isBlank()) {
            throw new IllegalStateException(
                    "Email is set to go through Resend (journey.email.mode=resend) but RESEND_API_KEY is empty. Set the key, or set HOMEPORT_EMAIL_MODE=off to run without email for now.");
        }
        this.resend = Http.client()
                .baseUrl(url.replaceAll("/+$", ""))
                .defaultHeader(HttpHeaders.AUTHORIZATION, "Bearer " + apiKey.trim())
                .build();
        this.from = from;
    }

    @Override
    public void send(Email email) {
        try {
            resend.post()
                    .uri("/emails")
                    .contentType(MediaType.APPLICATION_JSON)
                    .header("Idempotency-Key", email.sendOnceKey())
                    .body(Map.of(
                            "from", from,
                            "to", List.of(email.to()),
                            "subject", email.subject(),
                            "html", email.html(),
                            "text", email.text()))
                    .retrieve()
                    .toBodilessEntity();
        } catch (HttpClientErrorException.TooManyRequests slowDown) {
            throw new IllegalStateException("Resend says to slow down", slowDown);
        } catch (HttpClientErrorException refused) {
            throw new Refused("Resend didn't take the email: " + refused.getResponseBodyAsString(), refused);
        }
    }
}

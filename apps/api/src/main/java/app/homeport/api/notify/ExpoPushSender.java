package app.homeport.api.notify;

import java.net.http.HttpClient;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/**
 * Sends pushes through the Expo Push Service, which passes them on to Apple and Google.
 *
 * <p>One call takes up to a hundred messages and answers with a "ticket" for each, in the same order. A ticket
 * only says Expo accepted the push. What Apple or Google did with it is in the ticket's "receipt", which Expo
 * has a few minutes later and keeps for about a day: {@link #outcomes} asks for those. Either can say
 * {@code DeviceNotRegistered}: that phone will never get a push again, so its token is reported back to be
 * forgotten. Any other problem is written to the log, because it usually means a setting is wrong (the Apple
 * or Google credentials on the Expo project), not that the phone is gone.
 *
 * <p>No key is needed unless "enhanced security" is switched on for the Expo project; then its access token
 * goes in {@code journey.push.expo.access-token}.
 */
@Component
@ConditionalOnProperty(name = "homeport.push.mode", havingValue = "expo")
class ExpoPushSender implements PushSender {

    private static final Logger log = LoggerFactory.getLogger(ExpoPushSender.class);

    /** Expo answers for at most this many tickets in one call. */
    static final int RECEIPTS_PER_CALL = 300;

    private static final ParameterizedTypeReference<Map<String, Object>> JSON = new ParameterizedTypeReference<>() {};

    private final RestClient expo;
    private final String url;
    private final String accessToken;

    ExpoPushSender(
            @Value("${homeport.push.expo.url:https://exp.host/--/api/v2/push}") String url,
            @Value("${homeport.push.expo.access-token:}") String accessToken) {
        JdkClientHttpRequestFactory http = new JdkClientHttpRequestFactory(
                HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build());
        http.setReadTimeout(Duration.ofSeconds(15));
        this.expo = RestClient.builder().requestFactory(http).build();
        this.url = url.replaceAll("/+$", "");
        this.accessToken = accessToken == null ? "" : accessToken.trim();
    }

    @Override
    public Handed send(List<PushMessage> messages) {
        if (messages.isEmpty()) {
            return Handed.NOTHING;
        }
        if (messages.size() > PER_CALL) {
            throw new IllegalArgumentException("One call takes at most " + PER_CALL + " pushes.");
        }
        Map<String, Object> answer =
                call("/send", messages.stream().map(ExpoPushSender::wire).toList());
        if (!(answer.get("data") instanceof List<?> tickets) || tickets.size() != messages.size()) {
            throw new IllegalStateException("Expo's answer doesn't have a ticket for every push: " + answer.keySet());
        }
        Set<String> gone = new HashSet<>();
        List<Ticket> accepted = new ArrayList<>();
        for (int i = 0; i < tickets.size(); i++) {
            String token = messages.get(i).token();
            if (!(tickets.get(i) instanceof Map<?, ?> ticket)) {
                continue;
            }
            if ("ok".equals(ticket.get("status")) && ticket.get("id") instanceof String id) {
                accepted.add(new Ticket(id, token));
            } else if (isGone(ticket)) {
                gone.add(token);
            } else {
                log.warn("Expo refused a push: {}", problem(ticket));
            }
        }
        return new Handed(gone, accepted);
    }

    @Override
    public Outcome outcomes(Collection<String> ticketIds) {
        Set<String> answered = new HashSet<>();
        Set<String> gone = new HashSet<>();
        List<String> ids = List.copyOf(ticketIds);
        for (int from = 0; from < ids.size(); from += RECEIPTS_PER_CALL) {
            List<String> some = ids.subList(from, Math.min(from + RECEIPTS_PER_CALL, ids.size()));
            if (!(call("/getReceipts", Map.of("ids", some)).get("data") instanceof Map<?, ?> receipts)) {
                continue;
            }
            receipts.forEach((id, receipt) -> {
                answered.add(String.valueOf(id));
                if (isGone(receipt)) {
                    gone.add(String.valueOf(id));
                } else if (receipt instanceof Map<?, ?> fields && "error".equals(fields.get("status"))) {
                    log.warn("A push didn't arrive: {}", problem(fields));
                }
            });
        }
        return new Outcome(answered, gone);
    }

    private Map<String, Object> call(String path, Object body) {
        Map<String, Object> answer = expo.post()
                .uri(url + path)
                .contentType(MediaType.APPLICATION_JSON)
                .accept(MediaType.APPLICATION_JSON)
                .headers(headers -> {
                    if (!accessToken.isEmpty()) {
                        headers.set(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken);
                    }
                })
                .body(body)
                .retrieve()
                .body(JSON);
        if (answer == null || answer.get("errors") != null) {
            throw new IllegalStateException(
                    "Expo refused the call: " + (answer == null ? "no answer" : answer.get("errors")));
        }
        return answer;
    }

    /** One message the way Expo wants it. The app reads {@code data.url} to open the right screen. */
    private static Map<String, Object> wire(PushMessage message) {
        return Map.of(
                "to", message.token(),
                "title", message.title(),
                "body", message.body(),
                "sound", "default",
                "data", Map.of("url", message.url(), "kind", message.kind()));
    }

    private static boolean isGone(Object answer) {
        return answer instanceof Map<?, ?> fields
                && "error".equals(fields.get("status"))
                && fields.get("details") instanceof Map<?, ?> details
                && "DeviceNotRegistered".equals(details.get("error"));
    }

    /** The kind of problem and Expo's sentence about it. Never the message itself or the device's token. */
    private static String problem(Map<?, ?> answer) {
        Object kind = answer.get("details") instanceof Map<?, ?> details ? details.get("error") : null;
        return kind + ": " + answer.get("message");
    }
}

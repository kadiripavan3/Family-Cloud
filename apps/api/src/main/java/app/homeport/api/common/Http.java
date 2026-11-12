package app.homeport.api.common;

import java.net.http.HttpClient;
import java.time.Duration;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

/**
 * How the API calls another company's service: with one kind of client, which gives up connecting after five
 * seconds and waiting for an answer after fifteen. No call to an outside service may wait for ever.
 */
public final class Http {

    private Http() {}

    public static RestClient.Builder client() {
        return client(Duration.ofSeconds(15));
    }

    public static RestClient.Builder client(Duration answerWithin) {
        JdkClientHttpRequestFactory http = new JdkClientHttpRequestFactory(
                HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build());
        http.setReadTimeout(answerWithin);
        return RestClient.builder().requestFactory(http);
    }
}

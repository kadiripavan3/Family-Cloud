package app.homeport.api;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.ActiveProfiles;

/**
 * Settings that only show on a real connection: answers are compressed, and the database stops a question
 * that runs away. The other tests call the API without a network in between, so they would never notice
 * either of these being switched off.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles({"local", "test"})
class ServerSettingsTest {

    @LocalServerPort
    int port;

    @Autowired
    JdbcClient jdbc;

    @Test
    void aLongAnswerIsCompressedForAnAppThatAsksForIt() throws Exception {
        // The API's own description is the longest thing it serves without signing in.
        HttpRequest request = HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/v3/api-docs"))
                .header("Accept-Encoding", "gzip")
                .build();
        HttpResponse<byte[]> answer = HttpClient.newHttpClient().send(request, HttpResponse.BodyHandlers.ofByteArray());

        assertThat(answer.statusCode()).isEqualTo(200);
        assertThat(answer.headers().firstValue("Content-Encoding")).contains("gzip");
        // Asked for plainly, the same answer is several times as long.
        HttpResponse<byte[]> plain = HttpClient.newHttpClient()
                .send(
                        HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/v3/api-docs"))
                                .build(),
                        HttpResponse.BodyHandlers.ofByteArray());
        assertThat(answer.body().length * 3).isLessThan(plain.body().length);
    }

    @Test
    void everyConnectionStopsAQuestionThatRunsAway() {
        assertThat(setting("statement_timeout")).isEqualTo("5s");
        assertThat(setting("lock_timeout")).isEqualTo("3s");
        assertThat(setting("idle_in_transaction_session_timeout")).isEqualTo("30s");
        assertThat(setting("jit")).isEqualTo("off");
        // And it does: a question that would take ten seconds is given up on.
        long started = System.nanoTime();
        org.assertj.core.api.Assertions.assertThatThrownBy(
                        () -> jdbc.sql("select pg_sleep(10)").query().singleRow())
                .hasMessageContaining("statement timeout");
        assertThat(System.nanoTime() - started).isLessThan(8_000_000_000L);
    }

    private String setting(String name) {
        return jdbc.sql("select current_setting(:name)")
                .param("name", name)
                .query(String.class)
                .single();
    }
}

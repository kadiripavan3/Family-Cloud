package app.homeport.api.account;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import app.homeport.api.auth.AuthProperties;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** Deleting an account also removes the person's sign-in from Supabase. */
class SupabaseSignInAccountsTest {

    private HttpServer project;
    private final List<String> calls = new ArrayList<>();
    private volatile int answer = 200;

    @BeforeEach
    void start() throws Exception {
        project = HttpServer.create(new InetSocketAddress("localhost", 0), 0);
        project.createContext("/auth/v1/admin/users/", exchange -> {
            calls.add(
                    exchange.getRequestMethod() + " " + exchange.getRequestURI().getPath() + " key="
                            + exchange.getRequestHeaders().getFirst("apikey") + " auth="
                            + exchange.getRequestHeaders().getFirst("Authorization"));
            exchange.sendResponseHeaders(answer, -1);
            exchange.close();
        });
        project.start();
    }

    @AfterEach
    void stop() {
        project.stop(0);
    }

    private SupabaseSignInAccounts accounts(String serviceKey) {
        String url = "http://localhost:" + project.getAddress().getPort();
        return new SupabaseSignInAccounts(
                new AuthProperties("supabase", null, new AuthProperties.Supabase(url, null, serviceKey)));
    }

    @Test
    void itAsksSupabaseToRemoveThePersonWithTheProjectsSecretKey() {
        UUID person = UUID.randomUUID();
        accounts("secret-key").remove(person);
        assertThat(calls)
                .containsExactly("DELETE /auth/v1/admin/users/" + person + " key=secret-key auth=Bearer secret-key");
    }

    @Test
    void alreadyGoneIsFineAndARefusalStopsTheDeletion() {
        answer = 404;
        assertThatCode(() -> accounts("secret-key").remove(UUID.randomUUID())).doesNotThrowAnyException();
        answer = 500;
        // The account's deletion runs in one transaction: failing here undoes it, so nothing is half deleted.
        assertThatThrownBy(() -> accounts("secret-key").remove(UUID.randomUUID()))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void theSecretKeyIsRequired() {
        assertThatThrownBy(() -> accounts(""))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("SUPABASE_SERVICE_KEY");
    }
}

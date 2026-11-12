package app.homeport.api.notify;

import java.util.Optional;
import java.util.UUID;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** Local mode: the address someone signed in with, from the stand-in for the sign-in service. */
@Repository
@ConditionalOnProperty(name = "homeport.auth.mode", havingValue = "local")
class LocalEmailAddresses implements EmailAddresses {

    private final JdbcClient jdbc;

    LocalEmailAddresses(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public Optional<String> of(UUID userId) {
        return jdbc.sql("select email from local_users where id = :id")
                .param("id", userId)
                .query(String.class)
                .optional();
    }

    @Override
    public Optional<UUID> whose(String email) {
        return jdbc.sql("select id from local_users where lower(email) = lower(:email)")
                .param("email", email.trim())
                .query(UUID.class)
                .optional();
    }
}

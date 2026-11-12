package app.homeport.api.auth;

import java.util.UUID;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** Local mode's stand-in for the sign-in service's list of people: an email and the id that goes with it. */
@Repository
@ConditionalOnProperty(name = "homeport.auth.mode", havingValue = "local")
public class LocalUsers {

    private final JdbcClient jdbc;

    LocalUsers(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /** The id for an email, made the first time the email signs in. */
    public UUID idFor(String email) {
        return jdbc.sql(
                        "insert into local_users (email) values (:email) on conflict (email) do update set email = excluded.email returning id")
                .param("email", email)
                .query(UUID.class)
                .single();
    }

    public void remove(UUID userId) {
        jdbc.sql("delete from local_users where id = :id").param("id", userId).update();
    }
}

package app.homeport.api.notify;

import java.util.Optional;
import java.util.UUID;
import java.util.function.Supplier;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/**
 * With Supabase sign-in: the address is in Supabase's own table of people, {@code auth.users}, which lives in
 * the same database the API already uses. The database user the API connects as must be allowed to read it
 * ({@code grant usage on schema auth} and {@code grant select on auth.users}); the default Supabase
 * {@code postgres} user is.
 */
@Repository
@ConditionalOnProperty(name = "homeport.auth.mode", havingValue = "supabase")
class SupabaseEmailAddresses implements EmailAddresses {

    private final JdbcClient jdbc;

    SupabaseEmailAddresses(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public Optional<String> of(UUID userId) {
        return read(() -> jdbc.sql("select email from auth.users where id = :id and email is not null")
                .param("id", userId)
                .query(String.class)
                .optional());
    }

    @Override
    public Optional<UUID> whose(String email) {
        return read(() -> jdbc.sql(
                        "select id from auth.users where lower(email) = lower(:email) order by created_at limit 1")
                .param("email", email.trim())
                .query(UUID.class)
                .optional());
    }

    /** Without the grant every email would fail with a line of SQL; this says what to do instead. */
    private static <T> T read(Supplier<T> query) {
        try {
            return query.get();
        } catch (DataAccessException e) {
            throw new IllegalStateException(
                    "The API's database user can't read Supabase's list of people (auth.users), which it needs to"
                            + " find an email address. In Supabase's SQL editor run, with the user from"
                            + " HOMEPORT_DB_USER: grant usage on schema auth to <user>; grant select on auth.users"
                            + " to <user>;",
                    e);
        }
    }
}

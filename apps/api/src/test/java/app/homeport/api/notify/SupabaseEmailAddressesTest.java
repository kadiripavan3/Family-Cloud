package app.homeport.api.notify;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import app.homeport.api.ApiTest;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * With Supabase sign-in the email addresses are in Supabase's own table. Tried against a table of the same
 * shape, in the schema Supabase keeps it in.
 */
class SupabaseEmailAddressesTest extends ApiTest {

    private SupabaseEmailAddresses addresses;

    @BeforeEach
    void supabasesTable() {
        jdbc.sql("create schema if not exists auth").update();
        jdbc.sql("drop table if exists auth.users").update();
        jdbc.sql(
                        "create table auth.users (id uuid primary key, email text, created_at timestamptz not null default now())")
                .update();
        addresses = new SupabaseEmailAddresses(jdbc);
    }

    @AfterEach
    void tidy() {
        jdbc.sql("drop schema if exists auth cascade").update();
    }

    @Test
    void anAddressIsFoundByPersonAndAPersonByAddressHoweverItIsWritten() {
        UUID nora = UUID.randomUUID();
        UUID phoneOnly = UUID.randomUUID();
        jdbc.sql("insert into auth.users (id, email) values (:id, 'Nora@Example.com')")
                .param("id", nora)
                .update();
        jdbc.sql("insert into auth.users (id, email) values (:id, null)")
                .param("id", phoneOnly)
                .update();

        assertThat(addresses.of(nora)).hasValue("Nora@Example.com");
        assertThat(addresses.of(phoneOnly))
                .as("signed in without an email address")
                .isEmpty();
        assertThat(addresses.of(UUID.randomUUID())).isEmpty();
        assertThat(addresses.whose(" nora@example.COM ")).hasValue(nora);
        assertThat(addresses.whose("someone-else@example.com")).isEmpty();
    }

    @Test
    void whenTheApiMayNotReadTheTableItSaysWhatToGrant() {
        jdbc.sql("drop table auth.users").update();
        assertThatThrownBy(() -> addresses.of(UUID.randomUUID()))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("grant select on auth.users");
        assertThatThrownBy(() -> addresses.whose("nora@example.com"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("grant usage on schema auth");
    }
}

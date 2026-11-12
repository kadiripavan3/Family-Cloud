package app.homeport.api;

import static org.assertj.core.api.Assertions.assertThat;

import app.homeport.api.library.DatedThings;
import app.homeport.api.seed.SeedWorld;
import app.homeport.api.seed.Seeder;
import com.jayway.jsonpath.JsonPath;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Comparator;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.TestPropertySource;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Sample data that points from one place to another, by the short names the places give their things in
 * {@link SeedWorld} (the one the API itself fills, which forgets the time before whenever the people are added): the Wi‑Fi page in Notes shows the Wi‑Fi from the Vault, Mia's passport in the Library
 * knows its trip and its reminder in Plan and its entry in the Vault, and the stars Mia earned on the chore
 * wheel are what her skates fund in Plan counts. Each place's sample data also stands without the others,
 * whichever comes first.
 */
@TestPropertySource(properties = "homeport.seed.enabled=true")
class SampleDataAcrossPlacesTest extends ApiTest {

    @Autowired
    List<Seeder> seeders;

    @Autowired
    ObjectProvider<DatedThings> calendars;

    @Autowired
    SeedWorld world;

    @Autowired
    TransactionTemplate transaction;

    /**
     * Half of the sample data is no sample data: the tests that look for the whole of it must not find this.
     * Emptying a database that holds all of it takes its time on a busy machine, so it is given that time.
     */
    @AfterEach
    void leaveNothingBehind() {
        transaction.executeWithoutResult(status -> {
            jdbc.sql("set local statement_timeout = 0").update();
            emptyDatabase();
        });
    }

    /** Adds the sample data of these places (by the name of their seeder), in the order they are named here. */
    private void add(SeedWorld world, String... places) {
        transaction.executeWithoutResult(status -> {
            jdbc.sql("set local statement_timeout = 0").update();
            for (String place : places) {
                seeders.stream()
                        .filter(seeder -> seeder.getClass().getSimpleName().equals(place))
                        .findFirst()
                        .orElseThrow(() -> new IllegalStateException("No seeder called " + place))
                        .seed(world);
            }
        });
    }

    private String idOf(String kind, String title) {
        return jdbc.sql("select id from things where kind = :kind and title = :title order by created_at limit 1")
                .param("kind", kind)
                .param("title", title)
                .query(java.util.UUID.class)
                .single()
                .toString();
    }

    @Test
    void whatOnePlaceMadeIsShownByAnother() throws Exception {
        transaction.executeWithoutResult(status -> {
            jdbc.sql("set local statement_timeout = 0").update();
            seeders.stream().sorted(Comparator.comparingInt(Seeder::order)).forEach(seeder -> seeder.seed(world));
        });
        String nora = signIn("nora@example.com");
        LocalDate today = LocalDate.now(ZoneId.of("Europe/Ljubljana"));

        // Notes ← Vault. The page "Wi‑Fi and smart home" begins with the Wi‑Fi as it is kept in the Vault.
        String wifi = fetch("/v1/pages/" + idOf("page", "Wi‑Fi and smart home"), nora);
        assertThat(JsonPath.<List<String>>read(wifi, "$.blocks[*].kind"))
                .containsSubsequence("live", "heading", "checklist", "photo", "paragraph");
        assertThat(JsonPath.<String>read(wifi, "$.blocks[0].kind")).isEqualTo("live");
        assertThat(JsonPath.<String>read(wifi, "$.blocks[0].thing.kind")).isEqualTo("vault_item");
        assertThat(JsonPath.<String>read(wifi, "$.blocks[0].thing.title")).isEqualTo("Home Wi‑Fi");
        assertThat(JsonPath.<String>read(wifi, "$.blocks[0].thing.glance")).isEqualTo("Wi‑Fi · Linds-Home-5G");
        assertThat(JsonPath.<String>read(wifi, "$.editedBy.name"))
                .as("the page still says who wrote in it last")
                .isEqualTo("Alex");

        // Library ← Plan and the Vault. Mia's passport is needed for the trip, has its reminder, and is kept in the
        // Vault.
        String passport = fetch("/v1/documents/" + idOf("document", "Mia's passport") + "?day=" + today, nora);
        assertThat(JsonPath.<List<String>>read(passport, "$.linked[*].kind"))
                .containsExactlyInAnyOrder("event", "reminder", "vault_item");
        assertThat(JsonPath.<List<String>>read(passport, "$.linked[?(@.kind == 'reminder')].title"))
                .containsExactly("Renew Mia's passport");
        assertThat(JsonPath.<Boolean>read(passport, "$.document.reminderSet")).isTrue();
        assertThat(JsonPath.<Boolean>read(passport, "$.document.inVault")).isTrue();
        String trip = JsonPath.<List<String>>read(passport, "$.linked[?(@.kind == 'event')].title")
                .get(0);
        assertThat(trip).startsWith("Norway 20");
        assertThat(JsonPath.<List<String>>read(passport, "$.linked[?(@.kind == 'event')].glance")
                        .get(0))
                .as("a trip says all its days")
                .containsPattern("^\\d+ (\\w+ )?to \\d+ \\w+");
        // "Runs out 4 months after Norway", once a place tells the Library when a linked trip is (DatedThings).
        if (calendars.stream().findAny().isPresent()) {
            assertThat(JsonPath.<String>read(passport, "$.clash.trip.title")).isEqualTo(trip);
            assertThat(JsonPath.<Integer>read(passport, "$.clash.monthsLeftAfter"))
                    .isEqualTo(4);
        }

        // Plan ← the boards. Mia's skates fund counts the stars her piggy bank was paid, and the three know of each
        // other.
        String fund = idOf("goal", "Mia's skates fund");
        String goal = fetch("/v1/goals/" + fund + "?day=" + today, nora);
        assertThat(JsonPath.<String>read(goal, "$.amountLine")).isEqualTo("34 of 50 stars");
        String entries = fetch("/v1/goals/" + fund + "/entries", nora);
        assertThat(JsonPath.<List<Integer>>read(entries, "$.items[*].amount")).containsExactlyInAnyOrder(10, 10, 4, 10);
        assertThat(Set.copyOf(JsonPath.<List<String>>read(entries, "$.items[*].note")))
                .containsExactly("from the chore wheel");
        assertThat(JsonPath.<String>read(entries, "$.items[0].line")).isEqualTo("Mia added 10 stars");
        assertThat(JsonPath.<List<String>>read(fetch("/v1/things/" + fund + "/links", nora), "$[*].title"))
                .containsExactlyInAnyOrder("Chore wheel", "Mia's piggy bank");
        String bank = fetch("/v1/boards/" + idOf("board", "Mia's piggy bank"), nora);
        assertThat(JsonPath.<Integer>read(bank, "$.view.fund.starsIn"))
                .as("the piggy bank and the goal count the same stars")
                .isEqualTo(JsonPath.<Integer>read(goal, "$.current"));
        assertThat(JsonPath.<Integer>read(bank, "$.view.fund.percent"))
                .isEqualTo(JsonPath.<Integer>read(goal, "$.pace.percent"));
    }

    @Test
    void theWifiBlockArrivesWheneverTheVaultsSampleDataDoes() throws Exception {
        // Notes first, with no Vault yet: the page stands without the block.
        add(world, "SpineSeed", "NotesSeed");
        String nora = signIn("nora@example.com");
        String page = idOf("page", "Wi‑Fi and smart home");
        assertThat(JsonPath.<List<String>>read(fetch("/v1/pages/" + page, nora), "$.blocks[*].kind"))
                .doesNotContain("live")
                .containsSubsequence("heading", "checklist", "paragraph");

        // The Vault's comes after it: the block takes its place on top, and the page reads as it is drawn.
        add(world, "VaultSeed");
        String wifi = fetch("/v1/pages/" + page, nora);
        assertThat(JsonPath.<String>read(wifi, "$.blocks[0].kind")).isEqualTo("live");
        assertThat(JsonPath.<String>read(wifi, "$.blocks[0].thing.title")).isEqualTo("Home Wi‑Fi");
        assertThat(JsonPath.<String>read(wifi, "$.editedBy.name")).isEqualTo("Alex");
    }

    @Test
    void thePassportStandsAloneAndIsLinkedWheneverPlansSampleDataArrives() throws Exception {
        add(world, "SpineSeed", "LibrarySeed");
        String nora = signIn("nora@example.com");
        String passport = "/v1/documents/" + idOf("document", "Mia's passport");
        assertThat(JsonPath.<List<String>>read(fetch(passport, nora), "$.linked[*].title"))
                .isEmpty();
        assertThat(JsonPath.<Object>read(fetch(passport, nora), "$.clash")).isNull();

        // Plan's sample data after the Library's, the other way round from how the API adds them.
        add(world, "PlanSeed");
        assertThat(JsonPath.<List<String>>read(fetch(passport, nora), "$.linked[*].kind"))
                .containsExactlyInAnyOrder("event", "reminder");
        assertThat(JsonPath.<Boolean>read(fetch(passport, nora), "$.document.reminderSet"))
                .isTrue();
        assertThat(JsonPath.<Boolean>read(fetch(passport, nora), "$.document.inVault"))
                .isFalse();
    }
}

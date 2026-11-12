package app.homeport.api.seed;

import static org.assertj.core.api.Assertions.assertThat;

import app.homeport.api.TiesTestBase;
import app.homeport.api.auth.LocalUsers;
import app.homeport.api.media.MediaSizes;
import app.homeport.api.media.MediaStore;
import com.jayway.jsonpath.JsonPath;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Comparator;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.test.context.TestPropertySource;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * The sample data, where the places meet: someone who signs in as nora@example.com sees Activity as its
 * screen draws it, Today without the same job twice, and things that know about each other. Run here the way
 * local mode runs it, on an empty database.
 */
@TestPropertySource(properties = "homeport.seed.enabled=true")
class TiesSeedTest extends TiesTestBase {

    @Autowired
    List<Seeder> seeders;

    @Autowired
    LocalUsers users;

    @Autowired
    MediaStore media;

    @Autowired
    MediaSizes sizes;

    @Autowired
    TransactionTemplate transaction;

    @Value("${homeport.seed.images}")
    String images;

    @Test
    void noraSeesActivityAsItsScreenDrawsItAndTheSampleThingsKnowAboutEachOther() throws Exception {
        SeedWorld world = new SeedWorld(users, media, sizes, jdbc, images);
        transaction.executeWithoutResult(status ->
                seeders.stream().sorted(Comparator.comparingInt(Seeder::order)).forEach(seeder -> seeder.seed(world)));
        nora = signIn("nora@example.com");
        alex = signIn("alex@example.com");
        circle = world.circle("linds").toString();
        LocalDate today = LocalDate.now(ZoneId.of(ZONE));

        // Activity: the ask and the photos are new; then Leo and Biscuit, the guest pass and the groceries.
        String hers = activity(nora, "zone=" + ZONE + "&day=" + today);
        assertThat(said(hers, "items"))
                .containsExactly(
                        "Alex asks to see Bank card PIN in the Vault | for today only",
                        "Alex added 19 photos to Saturday at Lake Bled",
                        "Leo fed Biscuit and earned a star | Chore wheel",
                        "Ines opened their guest pass | it ended at 23:30",
                        "Alex and Mia changed Groceries | 9 things added, 5 ticked",
                        // Kept in April, as the Library draws it, and dated then: the last line, with its cover.
                        "Iceland ring road was kept from Journey | 214 originals, now in Trips");
        assertThat(JsonPath.<List<Boolean>>read(hers, "$.items[*].fresh"))
                .containsExactly(true, true, false, false, false, false);
        assertThat(JsonPath.<String>read(hers, "$.items[5].kind")).isEqualTo("kept");
        assertThat(JsonPath.<String>read(hers, "$.items[5].thingKind")).isEqualTo("page");
        assertThat(JsonPath.<String>read(hers, "$.items[5].imageUrl")).isNotNull();
        assertThat(JsonPath.<List<Object>>read(hers, "$.items[5].people")).isEmpty();
        assertThat(java.time.Instant.parse(JsonPath.<String>read(hers, "$.items[5].at")))
                .as("when it was kept, not when the sample data was added")
                .isBefore(java.time.Instant.now().minus(java.time.Duration.ofDays(100)));
        assertThat(JsonPath.<Integer>read(hers, "$.asks")).isEqualTo(1);
        assertThat(JsonPath.<Integer>read(hers, "$.fresh")).isEqualTo(2);
        assertThat(JsonPath.<List<String>>read(hers, "$.items[0].buttons[*].label"))
                .containsExactly("Allow", "Not now");
        assertThat(JsonPath.<String>read(hers, "$.items[1].imageUrl")).isNotNull();
        // What is due is laid in from Money and Plan: the electricity tomorrow, with her half and a button.
        assertThat(said(hers, "due")).contains("Electricity is due tomorrow, €84.20 | Your half is €42.10");
        assertThat(JsonPath.<List<String>>read(hers, "$.due[?(@.thingKind == 'bill')].buttons[0].label"))
                .containsExactly("Pay");
        assertThat(JsonPath.<List<String>>read(hers, "$.due[?(@.thingKind == 'bill')].emoji"))
                .containsExactly("⚡");
        // Alex, who asked, added and changed, reads only what others did. Nothing waits in the outbox.
        assertThat(said(activity(alex, ""), "items"))
                .containsExactly(
                        "Leo fed Biscuit and earned a star | Chore wheel",
                        "Ines opened their guest pass | it ended at 22:30",
                        "Mia changed Groceries | 3 things added, 2 ticked",
                        "Iceland ring road was kept from Journey | 214 originals, now in Trips");
        assertThat(jdbc.sql("select count(*) from pushes").query(Integer.class).single())
                .isZero();
        // He can see the PIN is there and can't open it: so he could ask, and has.
        String pin = JsonPath.read(hers, "$.items[0].thingId");
        assertThat(JsonPath.<String>read(fetch("/v1/things/" + pin + "/ask", alex), "$.ask.state"))
                .isEqualTo("open");
        assertThat(JsonPath.<Boolean>read(fetch("/v1/things/" + pin + "/ask", alex), "$.canAsk"))
                .isFalse();

        // Today: no job stands there twice. The bins are the reminder that takes turns; Biscuit is Leo's job.
        String home = fetch("/v1/circles/" + circle + "/today?day=" + today, nora);
        assertThat(JsonPath.<List<String>>read(home, "$.items[*].title"))
                .containsOnlyOnce("Take the bins out", "Feed Biscuit", "Electricity", "Dentist · Mia")
                .doesNotContain("Bins and recycling");
        assertThat(JsonPath.<Integer>read(home, "$.done")).isEqualTo(2);
        boolean schoolDay = today.getDayOfWeek().getValue() <= 5;
        assertThat(JsonPath.<Integer>read(home, "$.left"))
                .isEqualTo(3 + (schoolDay ? 1 : 0) + (today.getDayOfWeek() == DayOfWeek.THURSDAY ? 1 : 0));
        assertThat(JsonPath.<List<String>>read(home, "$.items[?(@.title == 'Electricity')].action.label"))
                .containsExactly("Pay");
        assertThat(JsonPath.<List<Boolean>>read(home, "$.items[?(@.title == 'Take the bins out')].repeats"))
                .containsExactly(true);

        // Things that know about each other: the electricity bill has its login and its invoice, Netflix its login.
        String bills = fetch("/v1/circles/" + circle + "/bills?limit=50", nora);
        assertThat(JsonPath.<List<Boolean>>read(bills, "$.items[?(@.title == 'Electricity')].hasLogin"))
                .containsExactly(true);
        assertThat(JsonPath.<List<Boolean>>read(bills, "$.items[?(@.title == 'Electricity')].hasInvoice"))
                .containsExactly(true);
        assertThat(JsonPath.<List<Boolean>>read(bills, "$.items[?(@.title == 'Netflix')].hasLogin"))
                .containsExactly(true);
        String electricity = JsonPath.<List<String>>read(bills, "$.items[?(@.title == 'Electricity')].id")
                .get(0);
        assertThat(JsonPath.<String>read(fetch("/v1/bills/" + electricity, nora), "$.invoice.title"))
                .startsWith("Invoice, ");
        // The Norway goal reads its number from the sheet, live.
        String goals = fetch("/v1/circles/" + circle + "/goals?day=" + today, nora);
        String norway = fetch("/v1/goals/" + JsonPath.<String>read(goals, "$[0].id") + "?day=" + today, nora);
        assertThat(JsonPath.<String>read(norway, "$.source.line")).isEqualTo("Reads “Saved” in Norway budget");
        assertThat(JsonPath.<Boolean>read(norway, "$.source.live")).isTrue();
        // ...with everything its screen draws read from there: the ring, who chips in, and who put in what last.
        assertThat(JsonPath.<String>read(norway, "$.amountLine")).isEqualTo("€5,600 of €8,000");
        assertThat(JsonPath.<Integer>read(norway, "$.pace.percent")).isEqualTo(70);
        assertThat(JsonPath.<String>read(norway, "$.cheer")).isEqualTo("All four chip in");
        assertThat(JsonPath.<List<String>>read(norway, "$.recent[0:2].line"))
                .containsExactly("Alex added €150", "Mia added €5");
        assertThat(JsonPath.<List<String>>read(norway, "$.recent[0:2].note"))
                .containsExactly("payday", "from her pocket money");
        assertThat(JsonPath.<String>read(norway, "$.source.thingKind")).isEqualTo("sheet");
        assertThat(JsonPath.<String>read(
                        fetch("/v1/sheets/" + JsonPath.<String>read(norway, "$.source.thingId"), nora), "$.title"))
                .isEqualTo("Norway budget");
        assertThat(JsonPath.<Boolean>read(norway, "$.addHere")).isTrue();

        // The circle switcher, and what leaving would do.
        String sheet = fetch("/v1/home/circles", nora);
        assertThat(JsonPath.<List<String>>read(sheet, "$.circles[*].line"))
                .contains("Friends · 5 people · you're owed €64")
                // (The couple's own sample data has Alex owing for last month, so its line may say so too.)
                .anySatisfy(line -> assertThat(line).startsWith("Couple · 2 people"))
                .anySatisfy(line -> assertThat(line).startsWith("Family · 4 people and Biscuit"));
        String leaving = fetch("/v1/circles/" + circle + "/leaving", nora);
        assertThat(JsonPath.<Integer>read(leaving, "$.onlyYours")).isPositive();
        assertThat(JsonPath.<Integer>read(leaving, "$.shared")).isPositive();
        assertThat(JsonPath.<Integer>read(leaving, "$.passwords")).isPositive();
        assertThat(JsonPath.<String>read(leaving, "$.nextOwner")).isEqualTo("Alex");
    }
}

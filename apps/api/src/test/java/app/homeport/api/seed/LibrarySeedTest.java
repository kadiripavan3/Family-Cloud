package app.homeport.api.seed;

import static org.assertj.core.api.Assertions.assertThat;

import app.homeport.api.ApiTest;
import app.homeport.api.auth.LocalUsers;
import app.homeport.api.media.MediaSizes;
import app.homeport.api.media.MediaStore;
import com.jayway.jsonpath.JsonPath;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.Comparator;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.test.context.TestPropertySource;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * The sample data: someone who signs in as nora@example.com sees the Library the screens draw. Run here the
 * way local mode runs it, on an empty database.
 */
@TestPropertySource(properties = "homeport.seed.enabled=true")
class LibrarySeedTest extends ApiTest {

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
    void noraSeesTheLibraryOfTheScreens() throws Exception {
        SeedWorld world = new SeedWorld(users, media, sizes, jdbc, images);
        transaction.executeWithoutResult(status ->
                seeders.stream().sorted(Comparator.comparingInt(Seeder::order)).forEach(seeder -> seeder.seed(world)));
        String nora = signIn("nora@example.com");
        String alex = signIn("alex@example.com");
        String circle = world.circle("linds").toString();
        LocalDate saturday = JsonPath.<String>read(
                        fetch("/v1/circles/" + circle + "/library?limit=1", nora), "$.moments[0].day")
                .transform(LocalDate::parse);

        // The wall: Saturday at the lake, 51 from three people, then Thursday at home with nine.
        String wall = fetch("/v1/circles/" + circle + "/library?limit=70", nora);
        assertThat(saturday.getDayOfWeek()).isEqualTo(DayOfWeek.SATURDAY);
        assertThat(JsonPath.<List<String>>read(wall, "$.moments[*].title"))
                .startsWith("Saturday at Lake Bled", "Thursday");
        assertThat(JsonPath.<Integer>read(wall, "$.moments[0].total")).isEqualTo(51);
        assertThat(JsonPath.<Integer>read(wall, "$.moments[0].photos")).isEqualTo(48);
        assertThat(JsonPath.<Integer>read(wall, "$.moments[0].videos")).isEqualTo(3);
        assertThat(JsonPath.<List<String>>read(wall, "$.moments[0].people[*].name"))
                .containsExactly("Nora", "Alex", "Mia");
        assertThat(JsonPath.<List<Integer>>read(wall, "$.moments[0].people[*].count"))
                .containsExactly(21, 19, 11);
        assertThat(JsonPath.<Integer>read(wall, "$.moments[1].total")).isEqualTo(9);
        assertThat(JsonPath.<String>read(wall, "$.moments[1].placeName")).isEqualTo("Home");
        assertThat(JsonPath.<String>read(wall, "$.moments[1].day"))
                .isEqualTo(saturday.minusDays(2).toString());
        assertThat(JsonPath.<String>read(wall, "$.items[0].title")).isEqualTo("Mia's first time steering");
        assertThat(JsonPath.<String>read(wall, "$.items[0].addedBy.name")).isEqualTo("Alex");
        assertThat(JsonPath.<Boolean>read(wall, "$.items[0].loved")).isTrue();
        assertThat(JsonPath.<Integer>read(wall, "$.items[4].durationSeconds")).isEqualTo(42);
        // What came from Mia's tablet is Mia's on the screen and her mum's to share.
        assertThat(JsonPath.<String>read(wall, "$.items[2].addedBy.name")).isEqualTo("Mia");
        assertThat(JsonPath.<Boolean>read(wall, "$.items[2].mine")).isTrue();

        // Today: 19 new at the lake, Grandma's recipe, and Biscuit's album.
        String home = fetch("/v1/circles/" + circle + "/today", nora);
        assertThat(JsonPath.<List<String>>read(home, "$.fresh[?(@.kind != 'page')].title"))
                .startsWith("Saturday at Lake Bled", "Grandma's cookies", "Biscuit");
        assertThat(JsonPath.<List<String>>read(home, "$.fresh[?(@.kind != 'page')].pill"))
                .startsWith("19 new", "Recipe");
        assertThat(JsonPath.<List<String>>read(home, "$.fresh[?(@.kind != 'page')].note"))
                .startsWith("Alex, Mia and you", "Alex added a scan", "6 new this week");

        // The photo itself: two loves, three comments, and Mia in it.
        String photo = fetch("/v1/library/" + JsonPath.<String>read(wall, "$.items[0].id"), nora);
        assertThat(JsonPath.<Integer>read(photo, "$.loves")).isEqualTo(2);
        assertThat(JsonPath.<Integer>read(photo, "$.comments")).isEqualTo(3);
        assertThat(JsonPath.<List<String>>read(photo, "$.about[*].name")).containsExactly("Mia");
        assertThat(JsonPath.<String>read(photo, "$.item.chip.audience")).isEqualTo("circle");

        // The strip at the side, the albums, the places.
        assertThat(JsonPath.<List<Integer>>read(
                        fetch("/v1/circles/" + circle + "/library/timeline?tiles=0", nora), "$.years[*].year"))
                .hasSizeBetween(7, 8) // eight years, as on the screen; seven in the first days of a January
                .startsWith(saturday.getYear());
        String albums = fetch("/v1/circles/" + circle + "/albums", nora);
        assertThat(JsonPath.<List<String>>read(albums, "$.items[*].title"))
                .containsExactlyInAnyOrder("Summer " + lastAugust(), "Mia", "Biscuit", "For the photo book");
        assertThat(JsonPath.<List<String>>read(albums, "$.items[?(@.title == 'Biscuit')].note"))
                .containsExactly("mostly asleep");
        assertThat(JsonPath.<List<String>>read(albums, "$.items[?(@.origin == 'person')].person.name"))
                .containsExactlyInAnyOrder("Mia", "Biscuit");
        String places = fetch("/v1/circles/" + circle + "/library/places", nora);
        assertThat(JsonPath.<String>read(places, "$.list[0].name")).isEqualTo("Lake Bled");
        assertThat(JsonPath.<Integer>read(places, "$.list[0].visits")).isEqualTo(3);
        assertThat(JsonPath.<Integer>read(places, "$.countries")).isEqualTo(3);

        // Files: the passport knows the day it runs out and when to be reminded; the car runs out in 19 days.
        LocalDate today = LocalDate.now(java.time.ZoneId.of("Europe/Ljubljana")); // the day the sample data counts from
        String files = fetch("/v1/circles/" + circle + "/files?limit=50&day=" + today, nora);
        assertThat(JsonPath.<List<String>>read(files, "$.items[*].title"))
                .contains(
                        "Home insurance",
                        "Mia's passport",
                        "Mia's school report",
                        "Car registration",
                        "Receipt · wardrobe",
                        "Boiler manual",
                        "Grandma's cookies",
                        "Passport scan, Alex");
        assertThat(JsonPath.<List<Integer>>read(files, "$.items[?(@.title == 'Car registration')].keyDate.daysLeft"))
                .containsExactly(19);
        assertThat(JsonPath.<List<Integer>>read(files, "$.items[?(@.title == 'Receipt · wardrobe')].amountCents"))
                .containsExactly(34900);
        assertThat(JsonPath.<List<String>>read(files, "$.items[?(@.title == 'Boiler manual')].linkedFrom")
                        .get(0))
                .endsWith("Fi and smart home");
        String passportId = JsonPath.<List<String>>read(files, "$.items[?(@.title == \"Mia's passport\")].id")
                .get(0);
        String passport = fetch("/v1/documents/" + passportId, nora);
        assertThat(JsonPath.<String>read(passport, "$.document.badge")).isEqualTo("ID");
        assertThat(JsonPath.<List<String>>read(passport, "$.facts[*].label"))
                .containsExactly("Number", "Born", "Expires");
        LocalDate expires = LocalDate.parse(JsonPath.<String>read(passport, "$.document.keyDate.date"));
        assertThat(JsonPath.<String>read(passport, "$.remindOn"))
                .isEqualTo(expires.minusMonths(7).toString());
        assertThat(JsonPath.<List<String>>read(passport, "$.document.chip.people[*].name"))
                .containsExactly("Alex Strand");
        assertThat(JsonPath.<List<String>>read(
                        fetch("/v1/circles/" + circle + "/files/summary", nora), "$.folders[*].title"))
                .containsExactly("Tax " + (today.getYear() - 1));
        // "passport" finds both scans, as the search screen draws it.
        assertThat(JsonPath.<List<String>>read(
                        fetch("/v1/circles/" + circle + "/search?q=passport&place=library", nora),
                        "$.hits[*].thing.title"))
                .containsExactlyInAnyOrder("Mia's passport", "Passport scan, Alex");

        // Alex's own view: what Nora and Mia added on Saturday is his news, and Nora's private album isn't there.
        String his = fetch("/v1/circles/" + circle + "/library?limit=1", alex);
        assertThat(JsonPath.<Integer>read(his, "$.moments[0].total")).isEqualTo(51);
        assertThat(JsonPath.<List<Boolean>>read(his, "$.moments[0].people[*].you"))
                .containsExactly(false, true, false);
        assertThat(fetch("/v1/circles/" + circle + "/today", alex)).doesNotContain("19 new");
        assertThat(fetch("/v1/circles/" + circle + "/albums", alex)).doesNotContain("For the photo book");
        assertThat(JsonPath.<List<String>>read(
                        fetch("/v1/circles/" + circle + "/storage", nora), "$.people[*].person.name"))
                .containsExactly("Nora", "Alex", "Mia", "Leo");
    }

    private static int lastAugust() {
        LocalDate today = LocalDate.now(java.time.ZoneId.of("Europe/Ljubljana"));
        return today.getMonthValue() > 8 ? today.getYear() : today.getYear() - 1;
    }
}

package app.homeport.api.seed;

import static org.assertj.core.api.Assertions.assertThat;

import app.homeport.api.ApiTest;
import app.homeport.api.auth.LocalUsers;
import app.homeport.api.media.MediaSizes;
import app.homeport.api.media.MediaStore;
import com.jayway.jsonpath.JsonPath;
import java.time.LocalDate;
import java.util.Comparator;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.test.context.TestPropertySource;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * The sample data: someone who signs in as nora@example.com finds the two apps together as the screens draw
 * them. Run here the way local mode runs it, on an empty database, after every other place's sample data.
 */
@TestPropertySource(properties = "homeport.seed.enabled=true")
class JourneySeedTest extends ApiTest {

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
    void noraFindsTheTwoAppsTogetherAsTheScreensDrawThem() throws Exception {
        SeedWorld world = new SeedWorld(users, media, sizes, jdbc, images);
        transaction.executeWithoutResult(status ->
                seeders.stream().sorted(Comparator.comparingInt(Seeder::order)).forEach(seeder -> seeder.seed(world)));
        String nora = signIn("nora@example.com");
        String alex = signIn("alex@example.com");
        String lea = signIn("lea@example.com");
        String circle = world.circle("linds").toString();
        LocalDate today = LocalDate.now(java.time.ZoneId.of("Europe/Ljubljana"));

        // One account, two apps.
        String mine = fetch("/v1/journey/me", nora);
        assertThat(JsonPath.<String>read(mine, "$.signedInAs")).isEqualTo("Nora Lind");
        assertThat(JsonPath.<Integer>read(mine, "$.journey.following")).isEqualTo(58);
        assertThat(JsonPath.<Object>read(fetch("/v1/journey/me", lea), "$.journey"))
                .isNull();
        assertThat(JsonPath.<List<String>>read(fetch("/v1/journey/journeys", nora), "$.items[*].title"))
                .contains("Iceland ring road", "Java and Bali by train", "Family 10K");

        // Iceland ring road was kept: the numbers of the recap, its book in Trips, its photos in the Library.
        String kept = fetch("/v1/circles/" + circle + "/journey/kept", nora);
        assertThat(JsonPath.<List<String>>read(kept, "$.items[*].title"))
                .containsExactly("Iceland ring road", "Java and Bali by train");
        assertThat(JsonPath.<String>read(kept, "$.items[0].byline")).isEqualTo("Nora and Alex");
        assertThat(JsonPath.<Integer>read(kept, "$.items[0].stats.days")).isEqualTo(14);
        assertThat(JsonPath.<Integer>read(kept, "$.items[0].stats.entries")).isEqualTo(62);
        assertThat(JsonPath.<Integer>read(kept, "$.items[0].stats.photos")).isEqualTo(214);
        assertThat(JsonPath.<Integer>read(kept, "$.items[0].stats.clips")).isEqualTo(9);
        assertThat(JsonPath.<Integer>read(kept, "$.items[0].stats.followers")).isEqualTo(58);
        // Worked out for real: every photo her phone backed up was found, the three from Alex's were brought.
        assertThat(JsonPath.<Integer>read(kept, "$.items[0].originals.matched")).isEqualTo(21);
        assertThat(JsonPath.<Integer>read(kept, "$.items[0].originals.brought")).isEqualTo(3);
        assertThat(JsonPath.<Integer>read(kept, "$.items[0].originals.leftInJourney"))
                .isZero();
        assertThat(JsonPath.<String>read(kept, "$.items[0].keptAt")).contains("-04-20T");
        String pageId = JsonPath.read(kept, "$.items[0].pageId");
        String albumId = JsonPath.read(kept, "$.items[0].albumId");

        String book = fetch("/v1/journey/books/" + pageId, nora);
        assertThat(JsonPath.<List<Object>>read(book, "$.days")).hasSize(14);
        assertThat(JsonPath.<String>read(book, "$.days[0].label")).isEqualTo("Day 1");
        assertThat(JsonPath.<String>read(book, "$.days[0].place")).isEqualTo("Reykjavík");
        assertThat(JsonPath.<String>read(book, "$.days[0].words[0]")).startsWith("Picked up the van, got lost twice");
        // Day 1 as drawn: three in the mosaic and four more.
        assertThat(JsonPath.<Integer>read(book, "$.days[0].shots")).isEqualTo(7);
        assertThat(JsonPath.<List<Object>>read(book, "$.days[0].photos")).hasSize(6);
        assertThat(JsonPath.<Integer>read(book, "$.days[0].more")).isEqualTo(1);
        assertThat(JsonPath.<String>read(book, "$.days[1].place")).isEqualTo("Skógafoss");
        assertThat(JsonPath.<String>read(book, "$.days[1].words[0]"))
                .isEqualTo("A rainbow at the falls and nobody else there until nine.");
        assertThat(JsonPath.<String>read(book, "$.kept.visibility")).isEqualTo("public");
        assertThat(JsonPath.<String>read(book, "$.kept.coverUrl")).isNotBlank();
        String page = fetch("/v1/pages/" + pageId, nora);
        assertThat(JsonPath.<List<String>>read(page, "$.breadcrumb[*].title")).containsExactly("Trips");
        assertThat(JsonPath.<String>read(page, "$.blocks[0].kind")).isEqualTo("photo");
        String album = fetch("/v1/albums/" + albumId, nora);
        assertThat(JsonPath.<String>read(album, "$.origin")).isEqualTo("journey");
        assertThat(JsonPath.<String>read(album, "$.note")).isEqualTo("kept in April");
        assertThat(JsonPath.<Integer>read(album, "$.count")).isEqualTo(24);
        assertThat(JsonPath.<Integer>read(
                        fetch("/v1/circles/" + circle + "/library/lenses", nora), "$.albums.fromJourney"))
                .isEqualTo(2);
        // The route is on the map; and nothing of all this is "new" on the wall, whose top is still last Saturday.
        assertThat(JsonPath.<List<String>>read(
                        fetch("/v1/circles/" + circle + "/journey/routes", nora), "$[0].points[*].place"))
                .startsWith("Reykjavík", "Skógafoss", "Vík");
        assertThat(JsonPath.<String>read(
                        fetch("/v1/circles/" + circle + "/library?limit=1", nora), "$.moments[0].title"))
                .startsWith("Saturday");

        // Today: a goodnight waiting, Alex away on day 6 of 9, and a day from two years ago.
        String todayIs = fetch("/v1/circles/" + circle + "/today?day=" + today, nora);
        assertThat(JsonPath.<List<String>>read(todayIs, "$.cards[*].look"))
                .contains("goodnight", "journey_away", "journey_on_this_day");
        String home = fetch("/v1/circles/" + circle + "/journey/at-home?day=" + today, nora);
        assertThat(JsonPath.<String>read(home, "$.away[0].who.name")).isEqualTo("Alex");
        assertThat(JsonPath.<String>read(home, "$.away[0].journey.title")).isEqualTo("Lofoten by bike");
        assertThat(JsonPath.<String>read(home, "$.away[0].journey.progressLabel"))
                .isEqualTo("Day 6 of 9");
        assertThat(JsonPath.<Integer>read(home, "$.away[0].newCount")).isEqualTo(2);
        assertThat(JsonPath.<String>read(home, "$.away[0].latest.label")).isEqualTo("Day 6");
        assertThat(JsonPath.<String>read(home, "$.away[0].latest.place")).isEqualTo("Reine");
        assertThat(JsonPath.<String>read(home, "$.away[0].latest.title")).isEqualTo("Ferry day, and finally a rest");
        assertThat(JsonPath.<List<String>>read(home, "$.away[0].latest.lovedBy[*].name"))
                .containsExactly("Mia");
        assertThat(JsonPath.<String>read(home, "$.onThisDay[0].title")).isEqualTo("Sunrise over Bromo");
        assertThat(JsonPath.<Integer>read(home, "$.onThisDay[0].yearsAgo")).isEqualTo(2);
        assertThat(JsonPath.<String>read(home, "$.onThisDay[0].label")).isEqualTo("Day 22");
        assertThat(JsonPath.<String>read(home, "$.goodnights[0].title")).isEqualTo("Goodnight, you two");
        assertThat(JsonPath.<String>read(home, "$.goodnights[0].from.name")).isEqualTo("Alex");
        assertThat(JsonPath.<String>read(home, "$.goodnights[0].place")).isEqualTo("Reine, Norway");
        assertThat(JsonPath.<String>read(home, "$.goodnights[0].dayLabel")).isEqualTo("Day 6");
        assertThat(JsonPath.<String>read(home, "$.goodnights[0].recordedLocal")).contains("T19:10");
        assertThat(JsonPath.<Integer>read(home, "$.goodnights[0].clip.durationSeconds"))
                .isEqualTo(48);
        assertThat(JsonPath.<List<String>>read(home, "$.goodnights[0].lovedBy[*].name"))
                .containsExactly("Leo");
        assertThat(JsonPath.<String>read(home, "$.goodnights[0].circleName")).isEqualTo("The Linds");
        // Alex is the one away: his own Today has neither his journey nor his own goodnight.
        assertThat(JsonPath.<List<String>>read(
                        fetch("/v1/circles/" + circle + "/today?day=" + today, alex), "$.cards[*].look"))
                .doesNotContain("goodnight", "journey_away");

        // The goal in Plan follows the challenge: twelve days ticked in Journey.
        String goals = fetch("/v1/circles/" + circle + "/goals", nora);
        String tenK = JsonPath.<List<String>>read(goals, "$[?(@.title == 'Family 10K')].id")
                .get(0);
        String goal = fetch("/v1/goals/" + tenK, nora);
        assertThat(JsonPath.<Boolean>read(goal, "$.source.live")).isTrue();
        assertThat(JsonPath.<Integer>read(goal, "$.current")).isEqualTo(12);
        assertThat(JsonPath.<String>read(goal, "$.line")).isEqualTo("Day 12 of 30 in Journey");

        // Norway 2027: a trip, planned here.
        String folder = JsonPath.<List<String>>read(
                        fetch("/v1/circles/" + circle + "/search?q=Norway 2027", nora),
                        "$.hits[?(@.thing.kind == 'folder')].thing.id")
                .get(0);
        String trip = fetch("/v1/trips/" + folder + "?day=" + today, nora);
        assertThat(JsonPath.<String>read(trip, "$.title")).isEqualTo("Norway 2027");
        assertThat(JsonPath.<String>read(trip, "$.space")).isEqualTo("Trips");
        assertThat(JsonPath.<String>read(trip, "$.stage")).isEqualTo("plan");
        assertThat(JsonPath.<String>read(trip, "$.startsOn")).endsWith("-04-03");
        assertThat(JsonPath.<String>read(trip, "$.endsOn")).endsWith("-04-17");
        assertThat(JsonPath.<List<String>>read(trip, "$.items[*].title"))
                .containsExactly(
                        "Day by day", "Packing, per person", "Norway budget", "Passports", "What to bring to Norway");
        assertThat(JsonPath.<String>read(trip, "$.items[0].glance")).isEqualTo("14 days sketched · Bergen to Tromsø");
        assertThat(JsonPath.<Integer>read(trip, "$.items[1].done")).isEqualTo(22);
        assertThat(JsonPath.<Integer>read(trip, "$.items[1].left")).isEqualTo(39);
        assertThat(JsonPath.<String>read(trip, "$.items[2].glance")).isEqualTo("€2,500 of €7,640");
        assertThat(JsonPath.<String>read(trip, "$.items[3].glance")).isEqualTo("Mia's needs renewing first");
        assertThat(JsonPath.<Integer>read(trip, "$.money.plannedCents")).isEqualTo(764_000);
        assertThat(JsonPath.<Integer>read(trip, "$.money.paidCents")).isEqualTo(250_000);
        assertThat(JsonPath.<String>read(trip, "$.becomes.on")).endsWith("-04-03");
        assertThat(JsonPath.<List<String>>read(trip, "$.becomes.coAuthors[*].name"))
                .containsExactly("Alex");
        assertThat(JsonPath.<List<String>>read(trip, "$.becomes.route"))
                .startsWith("Bergen")
                .endsWith("Tromsø");
        assertThat(JsonPath.<Boolean>read(trip, "$.becomes.canBecome")).isTrue();
        // "Before it leaves home" knows where home is: Thursday's photos were taken there.
        String settings = fetch("/v1/circles/" + circle + "/journey/settings", nora);
        assertThat(JsonPath.<Double>read(settings, "$.homeLat")).isEqualTo(46.0569);
        assertThat(JsonPath.<Boolean>read(settings, "$.canChange")).isTrue();
    }
}

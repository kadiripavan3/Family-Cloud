package app.homeport.api;

import static org.assertj.core.api.Assertions.assertThat;

import app.homeport.api.journey.JourneyHappened;
import com.jayway.jsonpath.JsonPath;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpMethod;

/**
 * What the link with Journey says happened ({@link JourneyHappened}) reaches Activity and people's phones by
 * the rules every line and every push keeps: a line about a thing is read by whoever may see the thing, a
 * goodnight is told at bedtime, and nothing is shown or pushed to someone who may not see what it is about.
 */
class JourneyNewsTest extends TiesTestBase {

    @Autowired
    ApplicationEventPublisher events;

    @BeforeEach
    void aFamily() throws Exception {
        theLinds();
    }

    private UUID id(String text) {
        return UUID.fromString(text);
    }

    @Test
    void aKeptJourneyIsOneLineForEveryoneWhoMaySeeItsBookAndTheKeeperReadsItToo() throws Exception {
        String book = page(nora, circle, "Iceland ring road", "circle");
        // The book was made as shared, so Activity said "Nora added Iceland ring road" to Alex.
        assertThat(sentences(alex)).containsExactly("Nora added Iceland ring road");

        events.publishEvent(new JourneyHappened.Kept(
                id(circle), id(noraId), UUID.randomUUID(), id(book), null, "Iceland ring road", true, 62, 214));

        // One piece of news: that the book was added gave way to it. It names nobody, and Nora reads it as well.
        assertThat(lines(alex)).containsExactly("Iceland ring road was kept from Journey | 214 originals");
        assertThat(lines(nora)).containsExactly("Iceland ring road was kept from Journey | 214 originals");
        String hers = activity(nora, "");
        assertThat(JsonPath.<String>read(hers, "$.items[0].kind")).isEqualTo("kept");
        assertThat(JsonPath.<String>read(hers, "$.items[0].thingId")).isEqualTo(book);
        assertThat(JsonPath.<List<Object>>read(hers, "$.items[0].people")).isEmpty();
        // Nobody's phone buzzes for a journey as such.
        assertThat(pushed()).isEmpty();

        // More of it comes home later: a line of its own. Asking when nothing is new says nothing.
        events.publishEvent(new JourneyHappened.Kept(
                id(circle), id(noraId), UUID.randomUUID(), id(book), null, "Iceland ring road", false, 2, 5));
        events.publishEvent(new JourneyHappened.Kept(
                id(circle), id(noraId), UUID.randomUUID(), id(book), null, "Iceland ring road", false, 0, 0));
        assertThat(lines(alex))
                .containsExactly(
                        "Iceland ring road has more from Journey | 2 new entries, 5 originals",
                        "Iceland ring road was kept from Journey | 214 originals");
    }

    @Test
    void aKeptJourneyOnlyItsKeeperMaySeeIsNoNewsToAnyoneElse() throws Exception {
        String book = page(nora, circle, "Java and Bali by train", "me");
        events.publishEvent(new JourneyHappened.Kept(
                id(circle), id(noraId), UUID.randomUUID(), id(book), null, "Java and Bali by train", true, 30, 40));
        // What only its owner can see makes no line at all, as for everything else.
        assertThat(lines(alex)).isEmpty();
        assertThat(lines(nora)).isEmpty();

        // Shared with Alex alone afterwards and kept again: he reads what came, and a stranger to it never does.
        String sam = person("Sam");
        join(nora, circle, sam);
        quiet();
        audience(
                nora,
                book,
                "{\"audience\":\"some\",\"people\":[{\"memberId\":\"%s\",\"access\":\"view\"}]}".formatted(alexId));
        events.publishEvent(new JourneyHappened.Kept(
                id(circle), id(noraId), UUID.randomUUID(), id(book), null, "Java and Bali by train", false, 1, 0));
        assertThat(sentences(alex)).contains("Java and Bali by train has more from Journey");
        assertThat(lines(sam)).isEmpty();

        // Only its route was kept: nothing of it stands here to open, and nothing is said.
        quiet();
        events.publishEvent(
                new JourneyHappened.Kept(id(circle), id(noraId), UUID.randomUUID(), null, null, "A walk", true, 3, 0));
        assertThat(lines(alex)).isEmpty();
    }

    @Test
    void aTripThatBecomesAJourneyIsToldToTheOthersAndADraftThatLeftOnlyToItsWriter() throws Exception {
        String notes = fetch("/v1/circles/" + circle + "/notes", nora);
        String trips = JsonPath.<List<String>>read(notes, "$.spaces[?(@.title == 'Trips')].id")
                .get(0);
        quiet();

        events.publishEvent(
                new JourneyHappened.TripBecameJourney(id(circle), id(noraId), id(trips), UUID.randomUUID(), "Trips"));
        assertThat(lines(alex)).containsExactly("Trips became a journey | It is told in Journey from here on");
        assertThat(lines(nora)).isEmpty();

        quiet();
        events.publishEvent(new JourneyHappened.Told(
                id(circle), id(noraId), UUID.randomUUID(), UUID.randomUUID(), "Saturday at the lake", 9));
        assertThat(lines(nora)).containsExactly("You told “Saturday at the lake” in Journey | 9 photos left home");
        assertThat(lines(alex)).isEmpty();
        assertThat(pushed()).isEmpty();
    }

    @Test
    void aGoodnightIsToldAtBedtimeToEveryoneElseWhoMaySeeItAndOnce() throws Exception {
        String sam = person("Sam");
        String samId = join(nora, circle, sam);
        phone(sam, "sam");
        // Home keeps Ljubljana's clock, and bedtime is at eight.
        send(
                HttpMethod.PUT,
                "/v1/circles/" + circle + "/journey/settings",
                nora,
                "{\"bedtime\":\"20:00\",\"timeZone\":\"%s\"}".formatted(ZONE),
                200);
        // Alex is away and recorded one for tonight. A goodnight is a thing like any other: here a page stands in
        // for it, shared with the circle and then hidden from Sam.
        String goodnight = page(alex, circle, "Goodnight, you two", "circle");
        audience(
                alex,
                goodnight,
                "{\"audience\":\"circle\",\"hiddenFrom\":[{\"memberId\":\"%s\",\"through\":\"%s\"}]}"
                        .formatted(samId, LocalDate.now().plusDays(30)));
        quiet();

        LocalDate tomorrow = LocalDate.now(ZoneId.of(ZONE)).plusDays(1);
        JourneyHappened.GoodnightArrived arrived = new JourneyHappened.GoodnightArrived(
                id(circle), id(alexId), id(goodnight), "Goodnight, you two", tomorrow, LocalTime.of(20, 0), null);
        events.publishEvent(arrived);
        events.publishEvent(arrived);

        // One push each for Nora and Sam, none for Alex who sent it, held back until bedtime at home.
        Instant bedtime = tomorrow.atTime(20, 0).atZone(ZoneId.of(ZONE)).toInstant();
        assertThat(jdbc.sql("select send_after from pushes where kind = 'goodnight' order by user_id")
                        .query(Timestamp.class)
                        .list())
                .hasSize(2)
                .allSatisfy(at -> assertThat(at.toInstant()).isEqualTo(bedtime));
        assertThat(pushed()).isEmpty();

        // Bedtime comes. Nora is told; Sam, who may not see it, is not; and nobody is told twice.
        jdbc.sql("update pushes set send_after = now() - interval '1 second'").update();
        assertThat(pushed()).containsExactly("nora: Goodnight from Alex | Recorded for tonight. Open to play it.");
        assertThat(messages().get(0).url()).isEqualTo("/goodnight/" + goodnight);
        assertThat(pushed()).hasSize(1);

        // One that arrives after bedtime, and one that is sent back, are told at once.
        quiet();
        events.publishEvent(new JourneyHappened.GoodnightArrived(
                id(circle),
                id(noraId),
                id(goodnight),
                "Goodnight, Dad",
                tomorrow.minusDays(2),
                LocalTime.of(20, 0),
                UUID.randomUUID()));
        assertThat(pushed()).containsExactly("alex: Nora sent a goodnight back | Open to play it.");
    }
}

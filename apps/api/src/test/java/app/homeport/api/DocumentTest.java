package app.homeport.api;

import static org.assertj.core.api.Assertions.assertThat;

import app.homeport.api.library.DatedThings;
import com.jayway.jsonpath.JsonPath;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.http.HttpMethod;

/** Files: scans and documents, the words the phone read inside them, and what those words say by rule. */
class DocumentTest extends LibraryApiTest {

    /** Stands in for Plan: it knows the days of the trips the tests name here. */
    static final Map<UUID, DatedThings.Days> TRIPS = new HashMap<>();

    @TestConfiguration
    static class PlanStandIn {
        @Bean
        DatedThings trips() {
            return ids -> {
                Map<UUID, DatedThings.Days> known = new HashMap<>(TRIPS);
                known.keySet().retainAll(ids);
                return known;
            };
        }
    }

    private static final String DAY = "?day=2026-11-11";

    private static final String PASSPORT = """
            PASSPORT
            Surname: LIND
            Given names: MIA
            Date of expiry: 02 AUG 2027

            P<UTOLIND<<MIA<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
            L898902C36UTO1612044F2708023<<<<<<<<<<<<<<08
            """;

    @Test
    void aDocumentKnowsWhatItIsAndTheDayThatMattersFromTheWordsThePhoneReadInsideIt() throws Exception {
        String nora = person("Nora");
        String circle = circle(nora, "family", "The Linds");
        String insurance = document(
                nora,
                circle,
                "Home insurance",
                "Home insurance policy\nPolicy number: HL-204-118\nThe policy renews on 1 February 2027.",
                ",\"pages\":3");
        String receipt =
                document(nora, circle, "IMG_2231", "Wardrobe, oak\nTotal €349.00\nWarranty until November 2028", "");
        String manual = document(nora, circle, "Boiler manual", "", ",\"pages\":1,\"category\":\"home\"");

        String files = fetch("/v1/circles/" + circle + "/files" + DAY, nora);
        assertThat(JsonPath.<List<String>>read(files, "$.items[*].id")).containsExactly(manual, receipt, insurance);
        assertThat(JsonPath.<List<String>>read(files, "$.items[*].title"))
                .containsExactly("Boiler manual", "IMG_2231", "Home insurance"); // a file's name, without its ending
        assertThat(JsonPath.<List<String>>read(files, "$.items[*].category"))
                .containsExactly("home", "receipt", "insurance");
        assertThat(JsonPath.<List<String>>read(files, "$.items[*].badge")).containsOnly("PDF");
        assertThat(JsonPath.<String>read(files, "$.items[2].keyDate.label")).isEqualTo("renews");
        assertThat(JsonPath.<String>read(files, "$.items[2].keyDate.date")).isEqualTo("2027-02-01");
        assertThat(JsonPath.<Integer>read(files, "$.items[2].keyDate.daysLeft")).isEqualTo(82);
        assertThat(JsonPath.<Boolean>read(files, "$.items[2].keyDate.soon")).isFalse();
        assertThat(JsonPath.<Integer>read(files, "$.items[2].pages")).isEqualTo(3);
        assertThat(JsonPath.<Integer>read(files, "$.items[1].amountCents")).isEqualTo(34900);
        assertThat(JsonPath.<String>read(files, "$.items[1].currency")).isEqualTo("EUR");
        assertThat(JsonPath.<String>read(files, "$.items[1].keyDate.label")).isEqualTo("warranty");
        assertThat(JsonPath.<Object>read(files, "$.items[0].keyDate")).isNull();
        assertThat(JsonPath.<String>read(files, "$.items[0].fileUrl"))
                .contains("/files/")
                .endsWith(".pdf");

        String one = fetch("/v1/documents/" + insurance + DAY, nora);
        assertThat(JsonPath.<Boolean>read(one, "$.hasText")).isTrue();
        assertThat(JsonPath.<String>read(one, "$.fileName")).isEqualTo("Home insurance.pdf");
        assertThat(JsonPath.<List<String>>read(one, "$.dates[*].label")).containsExactly("renews");
        assertThat(JsonPath.<String>read(one, "$.remindOn")).isEqualTo("2027-01-01");
        assertThat(JsonPath.<List<String>>read(one, "$.facts[*].label")).containsExactly("Renews");
        assertThat(JsonPath.<Object>read(one, "$.clash")).isNull();
        assertThat(JsonPath.<Boolean>read(fetch("/v1/documents/" + manual, nora), "$.hasText"))
                .isFalse();

        // What stands above the list: how many, of which kinds.
        String summary = fetch("/v1/circles/" + circle + "/files/summary", nora);
        assertThat(JsonPath.<Integer>read(summary, "$.total")).isEqualTo(3);
        assertThat(JsonPath.<List<String>>read(summary, "$.categories[*].category"))
                .containsExactlyInAnyOrder("home", "receipt", "insurance");
        assertThat(JsonPath.<List<String>>read(
                        fetch("/v1/circles/" + circle + "/files?category=receipt", nora), "$.items[*].id"))
                .containsExactly(receipt);

        // Found by the words inside: in Files, and in the search across everything.
        assertThat(JsonPath.<List<String>>read(
                        fetch("/v1/circles/" + circle + "/files?q=HL-204", nora), "$.items[*].id"))
                .containsExactly(insurance);
        assertThat(JsonPath.<List<String>>read(
                        fetch("/v1/circles/" + circle + "/files?q=boiler", nora), "$.items[*].id"))
                .containsExactly(manual);
        String found = fetch("/v1/circles/" + circle + "/search?q=policy number&place=library", nora);
        assertThat(JsonPath.<List<String>>read(found, "$.hits[*].thing.id")).containsExactly(insurance);
        assertThat(JsonPath.<String>read(found, "$.hits[0].snippet"))
                .startsWith("Found inside")
                .contains("HL-204-118");
        assertThat(JsonPath.<String>read(found, "$.hits[0].thing.glance")).isEqualTo("Renews 1 Feb 2027");
        assertThat(JsonPath.<String>read(
                        fetch("/v1/circles/" + circle + "/search?q=boiler", nora), "$.hits[0].thing.glance"))
                .isEqualTo("PDF · 1 page");
        // It is a thing of the Library, and has no place on the wall.
        assertThat(wall(nora, circle, "")).isEmpty();
        assertThat(JsonPath.<String>read(fetch("/v1/library/" + insurance, nora), "$.item.kind"))
                .isEqualTo("document");
    }

    @Test
    void aPassportIsReadFromItsMachineReadableLinesAndSaysWhenToBeRemindedAndWhichTripItRunsOutTooSoonAfter()
            throws Exception {
        String nora = person("Nora");
        String circle = circle(nora, "family", "The Linds");
        String mia = addMember(nora, circle, "Mia", "child");
        // A scan is a photo of a page: the phone says it is a document.
        String media = sendFile(nora, "photo", "image/jpeg", picture(), "");
        String passport = JsonPath.read(
                addOne(
                        nora,
                        circle,
                        media,
                        ",\"kind\":\"document\",\"title\":\"Mia's passport\",\"about\":[\"%s\"],\"text\":%s"
                                .formatted(
                                        mia,
                                        new tools.jackson.databind.json.JsonMapper().writeValueAsString(PASSPORT))),
                "$.items[0].item.id");

        String one = fetch("/v1/documents/" + passport + DAY, nora);
        assertThat(JsonPath.<String>read(one, "$.document.badge")).isEqualTo("ID");
        assertThat(JsonPath.<String>read(one, "$.document.category")).isEqualTo("id");
        assertThat(JsonPath.<String>read(one, "$.document.keyDate.label")).isEqualTo("expires");
        assertThat(JsonPath.<String>read(one, "$.document.keyDate.date")).isEqualTo("2027-08-02");
        assertThat(JsonPath.<Boolean>read(one, "$.document.keyDate.soon")).isTrue();
        assertThat(JsonPath.<List<String>>read(one, "$.document.about[*].name")).containsExactly("Mia");
        assertThat(JsonPath.<String>read(one, "$.document.thumbUrl")).contains("/photos/");
        assertThat(JsonPath.<String>read(one, "$.pictureUrl")).contains("/photos/");
        assertThat(JsonPath.<List<String>>read(one, "$.facts[*].label")).containsExactly("Number", "Born", "Expires");
        assertThat(JsonPath.<List<String>>read(one, "$.facts[*].text"))
                .containsExactly("L898902C3", "4 Dec 2016", "2 Aug 2027");
        assertThat(JsonPath.<List<Boolean>>read(one, "$.facts[*].secret")).containsExactly(true, false, false);
        // Seven months before it runs out: many countries want six months left.
        assertThat(JsonPath.<String>read(one, "$.remindOn")).isEqualTo("2027-01-02");
        assertThat(JsonPath.<Object>read(one, "$.clash")).isNull();
        // It shows on Mia's page, with the day it runs out.
        String page = fetch("/v1/members/" + mia, nora);
        assertThat(JsonPath.<List<String>>read(page, "$.kept[*].title")).containsExactly("Mia's passport");
        assertThat(JsonPath.<String>read(page, "$.kept[0].glance")).isEqualTo("Expires 2 Aug 2027");

        // Linked to a trip whose days Plan knows: it runs out four months after Norway. A trip a year earlier is fine.
        String norway = page(nora, circle, "Norway 2027", "me");
        String soon = page(nora, circle, "Weekend in Vienna", "me");
        TRIPS.put(UUID.fromString(norway), new DatedThings.Days(LocalDate.of(2027, 4, 3), LocalDate.of(2027, 4, 17)));
        TRIPS.put(UUID.fromString(soon), new DatedThings.Days(LocalDate.of(2026, 12, 5), LocalDate.of(2026, 12, 6)));
        send(HttpMethod.PUT, "/v1/things/" + passport + "/links/" + soon, nora, null, 204);
        send(HttpMethod.PUT, "/v1/things/" + norway + "/links/" + passport, nora, null, 204);

        String linked = fetch("/v1/documents/" + passport + DAY, nora);
        assertThat(JsonPath.<List<String>>read(linked, "$.linked[*].title"))
                .containsExactly("Weekend in Vienna", "Norway 2027");
        assertThat(JsonPath.<String>read(linked, "$.clash.trip.title")).isEqualTo("Norway 2027");
        assertThat(JsonPath.<String>read(linked, "$.clash.tripEnds")).isEqualTo("2027-04-17");
        assertThat(JsonPath.<Integer>read(linked, "$.clash.monthsLeftAfter")).isEqualTo(4);
        assertThat(JsonPath.<String>read(linked, "$.document.linkedFrom")).isEqualTo("Weekend in Vienna");
        TRIPS.clear();
    }

    @Test
    void theDayThatMattersCanBeSetByHandAndNewWordsAreReadAgain() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String circle = circle(nora, "family", "The Linds");
        String alexId = join(nora, circle, alex);
        String car = document(nora, circle, "Car registration", "Registration valid until 30.11.2026", "");
        shareWith(
                nora,
                car,
                "{\"audience\":\"some\",\"people\":[{\"memberId\":\"%s\",\"access\":\"view\"}]}".formatted(alexId));

        String read = fetch("/v1/documents/" + car + DAY, alex);
        assertThat(JsonPath.<String>read(read, "$.document.keyDate.label")).isEqualTo("valid_until");
        assertThat(JsonPath.<Integer>read(read, "$.document.keyDate.daysLeft")).isEqualTo(19);
        assertThat(JsonPath.<Boolean>read(read, "$.document.keyDate.soon")).isTrue();
        assertThat(JsonPath.<String>read(read, "$.remindOn"))
                .isEqualTo("2026-11-12"); // too close for a month before: tomorrow
        send(HttpMethod.PATCH, "/v1/documents/" + car, alex, "{\"title\":\"His car\"}", 403);

        // The reading was wrong: Nora sets the day herself, names the document and says what it is.
        String byHand = send(
                HttpMethod.PATCH,
                "/v1/documents/" + car + DAY,
                nora,
                "{\"title\":\"Car registration, LJ 27-KNL\",\"category\":\"insurance\",\"pages\":2,\"keyDate\":\"2027-11-30\",\"keyLabel\":\"renews\"}",
                200);
        assertThat(JsonPath.<String>read(byHand, "$.document.title")).isEqualTo("Car registration, LJ 27-KNL");
        assertThat(JsonPath.<String>read(byHand, "$.document.category")).isEqualTo("insurance");
        assertThat(JsonPath.<Integer>read(byHand, "$.document.pages")).isEqualTo(2);
        assertThat(JsonPath.<String>read(byHand, "$.document.keyDate.date")).isEqualTo("2027-11-30");
        assertThat(JsonPath.<String>read(byHand, "$.document.keyDate.label")).isEqualTo("renews");
        assertThat(JsonPath.<Boolean>read(byHand, "$.document.keyDate.byHand")).isTrue();
        assertThat(JsonPath.<String>read(byHand, "$.remindOn")).isEqualTo("2027-10-30");

        // New words don't undo what was set by hand, but they are what is searched from now on.
        String reread = send(
                HttpMethod.PATCH,
                "/v1/documents/" + car + DAY,
                nora,
                "{\"text\":\"Registration valid until 30.11.2028. Total €84.00\"}",
                200);
        assertThat(JsonPath.<String>read(reread, "$.document.keyDate.date")).isEqualTo("2027-11-30");
        assertThat(JsonPath.<Integer>read(reread, "$.document.amountCents")).isEqualTo(8400);
        assertThat(fetch("/v1/circles/" + circle + "/files?q=30.11.2028", nora)).contains(car);
        assertThat(fetch("/v1/circles/" + circle + "/files?q=30.11.2026", nora)).doesNotContain(car);

        // Back to what the words say.
        String back = send(HttpMethod.PATCH, "/v1/documents/" + car + DAY, nora, "{\"removeKeyDate\":true}", 200);
        assertThat(JsonPath.<String>read(back, "$.document.keyDate.date")).isEqualTo("2028-11-30");
        assertThat(JsonPath.<String>read(back, "$.document.keyDate.label")).isEqualTo("valid_until");
        assertThat(JsonPath.<Boolean>read(back, "$.document.keyDate.byHand")).isFalse();
        send(HttpMethod.PATCH, "/v1/documents/" + car, nora, "{\"category\":\"spaceship\"}", 400);
    }

    @Test
    void aFolderIsAnAlbumForFilesAndWhatIsInItIsShownInItNotLooseInTheList() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String circle = circle(nora, "family", "The Linds");
        join(nora, circle, alex);
        String statement =
                document(nora, circle, "Income statement 2025", "tax number 4471", ",\"audience\":\"circle\"");
        String donations = document(nora, circle, "Donations 2025", "", "");
        String loose = document(nora, circle, "Boiler manual", "", ",\"audience\":\"circle\"");
        String folder = album(
                nora, circle, "Tax 2025", ",\"folder\":true,\"itemIds\":%s".formatted(list(statement, donations)));

        assertThat(JsonPath.<List<String>>read(fetch("/v1/circles/" + circle + "/files", nora), "$.items[*].id"))
                .containsExactly(loose);
        assertThat(JsonPath.<List<String>>read(
                        fetch("/v1/circles/" + circle + "/files?folder=" + folder, nora), "$.items[*].id"))
                .containsExactly(donations, statement);
        String summary = fetch("/v1/circles/" + circle + "/files/summary", nora);
        assertThat(JsonPath.<Integer>read(summary, "$.total")).isEqualTo(3);
        assertThat(JsonPath.<List<String>>read(summary, "$.folders[*].title")).containsExactly("Tax 2025");
        assertThat(JsonPath.<Integer>read(summary, "$.folders[0].count")).isEqualTo(2);
        assertThat(JsonPath.<Boolean>read(summary, "$.folders[0].folder")).isTrue();
        // A kind or words to look for go through the folders too.
        assertThat(JsonPath.<List<String>>read(
                        fetch("/v1/circles/" + circle + "/files?category=tax", nora), "$.items[*].id"))
                .containsExactly(statement);
        assertThat(fetch("/v1/circles/" + circle + "/files?q=donations", nora)).contains(donations);
        assertThat(JsonPath.<String>read(
                        fetch("/v1/circles/" + circle + "/search?q=Tax 2025", nora), "$.hits[0].thing.glance"))
                .isEqualTo("2 files");

        // Alex can't see the folder: what is shared with him from it lies loose for him, or he couldn't reach it.
        assertThat(JsonPath.<List<String>>read(fetch("/v1/circles/" + circle + "/files", alex), "$.items[*].id"))
                .containsExactly(loose, statement);
        assertThat(JsonPath.<List<Object>>read(fetch("/v1/circles/" + circle + "/files/summary", alex), "$.folders"))
                .isEmpty();
        send(HttpMethod.GET, "/v1/circles/" + circle + "/files?folder=" + folder, alex, null, 404);
        // An album of photos is not a folder, and a folder doesn't fill itself.
        send(
                HttpMethod.GET,
                "/v1/circles/" + circle + "/files?folder=" + album(nora, circle, "Summer", ""),
                nora,
                null,
                404);
        send(
                HttpMethod.POST,
                "/v1/albums",
                nora,
                "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"title\":\"Mia\",\"folder\":true,\"personId\":\"%s\"}"
                        .formatted(
                                id(),
                                circle,
                                JsonPath.<String>read(fetch("/v1/circles/" + circle, nora), "$.myMemberId")),
                400);
    }

    @Test
    void aDocumentLinkedToAReminderOrToTheVaultSaysSoInTheList() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String circle = circle(nora, "family", "The Linds");
        join(nora, circle, alex);
        String insurance =
                document(nora, circle, "Home insurance", "renews on 1 February 2027", ",\"audience\":\"circle\"");
        String manual = page(nora, circle, "House manual", "circle");
        send(HttpMethod.PUT, "/v1/things/" + manual + "/links/" + insurance, nora, null, 204);
        // Plan and the Vault are other places' to build; here are the two things they will link, put in by hand.
        String owner = JsonPath.read(fetch("/v1/circles/" + circle, nora), "$.myMemberId");
        for (String[] other :
                new String[][] {{"reminder", "plan", "Renew the insurance"}, {"page", "vault", "The policy's login"}}) {
            String id = id();
            jdbc.sql(
                            "insert into things (id, circle_id, owner_id, kind, place, title, audience) values"
                                    + " (cast(:id as uuid), cast(:circle as uuid), cast(:owner as uuid), :kind, :place, :title, 'me')")
                    .param("id", id)
                    .param("circle", circle)
                    .param("owner", owner)
                    .param("kind", other[0])
                    .param("place", other[1])
                    .param("title", other[2])
                    .update();
            jdbc.sql("insert into thing_links (from_id, to_id) values (cast(:from as uuid), cast(:to as uuid))")
                    .param("from", insurance)
                    .param("to", id)
                    .update();
        }

        String hers = fetch("/v1/circles/" + circle + "/files", nora);
        assertThat(JsonPath.<Boolean>read(hers, "$.items[0].reminderSet")).isTrue();
        assertThat(JsonPath.<Boolean>read(hers, "$.items[0].inVault")).isTrue();
        assertThat(JsonPath.<String>read(hers, "$.items[0].linkedFrom")).isEqualTo("House manual");
        // Alex sees the document and the page, and nothing of the reminder and the login that are only hers.
        String his = fetch("/v1/circles/" + circle + "/files", alex);
        assertThat(JsonPath.<Boolean>read(his, "$.items[0].reminderSet")).isFalse();
        assertThat(JsonPath.<Boolean>read(his, "$.items[0].inVault")).isFalse();
        assertThat(JsonPath.<String>read(his, "$.items[0].linkedFrom")).isEqualTo("House manual");
    }
}

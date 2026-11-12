package app.homeport.api;

import static org.assertj.core.api.Assertions.assertThat;

import app.homeport.api.digest.DigestJob;
import app.homeport.api.notify.EmailOutbox;
import app.homeport.api.notify.LoggingEmailSender;
import com.jayway.jsonpath.JsonPath;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.TemporalAdjusters;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;

/** The Sunday summary: what a person's week holds, only from what they may see, and when and how it is sent. */
class SummaryTest extends TiesTestBase {

    private static final ZoneId HOME = ZoneId.of(ZONE);
    private static final LocalDate MONDAY =
            LocalDate.now(HOME).with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
    private static final LocalDate SUNDAY = MONDAY.plusDays(6);

    @Autowired
    DigestJob job;

    @Autowired
    EmailOutbox emails;

    @Autowired
    LoggingEmailSender mail;

    private String summary(String token, String query) throws Exception {
        return fetch("/v1/circles/" + circle + "/summary" + query, token);
    }

    /** A week with photos (one of them loved), two events, a bill paid and money saved, and a next week with a dentist and a bill. */
    private void aFullWeek() throws Exception {
        List<String> photos = photos(alex, "circle", 3);
        send(HttpMethod.PUT, "/v1/library/" + photos.get(1) + "/love", nora, null, 204);
        send(HttpMethod.PATCH, "/v1/library/" + photos.get(1), alex, "{\"title\":\"Mia's first time steering\"}", 200);
        photos(alex, "me", 2);
        event(nora, "Swimming", MONDAY.plusDays(1).toString(), "17:00", ",\"audience\":\"circle\"");
        event(nora, "Surprise party", MONDAY.plusDays(2).toString(), "18:00", ",\"audience\":\"me\"");
        String paid = bill(nora, "Water", 3100, MONDAY.toString(), ",\"audience\":\"circle\"");
        send(HttpMethod.PUT, "/v1/bills/" + paid + "/paid", nora, "{\"dueOn\":\"%s\"}".formatted(MONDAY), 200);
        String goal = make(
                nora,
                "/v1/goals",
                "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"title\":\"Norway\",\"unit\":\"money\",\"target\":800000,\"audience\":\"circle\",\"day\":\"%s\"}"
                        .formatted(id(), circle, MONDAY));
        send(
                HttpMethod.POST,
                "/v1/goals/" + goal + "/entries",
                alex,
                "{\"clientId\":\"%s\",\"amount\":35000,\"day\":\"%s\"}".formatted(id(), MONDAY.plusDays(1)),
                201);
        event(nora, "Dentist · Mia", SUNDAY.plusDays(3).toString(), "15:30", ",\"audience\":\"circle\"");
        event(nora, "Haircut · Leo", SUNDAY.plusDays(6).toString(), "10:00", ",\"audience\":\"circle\"");
        bill(nora, "Electricity", 8420, SUNDAY.plusDays(4).toString(), ",\"audience\":\"circle\",\"emoji\":\"⚡\"");
    }

    @Test
    void aWeekIsMadeOfWhatThatPersonMaySeeAndTwoPeopleCanGetDifferentWeeks() throws Exception {
        theLinds();
        aFullWeek();

        String hers = summary(nora, "?week=" + MONDAY.plusDays(3));

        assertThat(JsonPath.<String>read(hers, "$.from")).isEqualTo(MONDAY.toString());
        assertThat(JsonPath.<String>read(hers, "$.to")).isEqualTo(SUNDAY.toString());
        assertThat(JsonPath.<String>read(hers, "$.circleName")).isEqualTo("The Linds");
        // Nora: Alex's three shared photos (not his two private ones), her two events, the bill, the savings.
        assertThat(JsonPath.<List<String>>read(hers, "$.stats[*].figure")).containsExactly("3", "2", "1", "€350");
        assertThat(JsonPath.<List<String>>read(hers, "$.stats[*].label"))
                .containsExactly("photos", "events", "bill paid", "saved");
        assertThat(JsonPath.<String>read(hers, "$.inShort"))
                .isEqualTo("3 photos · 2 events · 1 bill paid · €350 saved");
        assertThat(JsonPath.<String>read(hers, "$.hero.pill")).isEqualTo("Most loved");
        assertThat(JsonPath.<String>read(hers, "$.hero.title")).isEqualTo("3 new photos, one very good Saturday");
        assertThat(JsonPath.<String>read(hers, "$.hero.line")).isEqualTo("Mia's first time steering");
        assertThat(JsonPath.<String>read(hers, "$.hero.imageUrl")).isNotNull();
        // Next week, in the order it comes: the two events in one row, then the bill.
        assertThat(JsonPath.<List<String>>read(hers, "$.nextWeek[*].title"))
                .containsExactly("Dentist for Mia, haircut for Leo", "Electricity, €84.20");
        assertThat(JsonPath.<List<String>>read(hers, "$.nextWeek[*].line"))
                .containsExactly("Wed 15:30 · Sat 10:00", "Due Thursday");
        assertThat(JsonPath.<List<String>>read(hers, "$.nextWeek[*].emoji")).containsExactly("📅", "⚡");
        // "From Journey" waits for the link between the apps: no section is made up meanwhile.
        assertThat(JsonPath.<List<Object>>read(hers, "$.sections")).isEmpty();
        assertThat(JsonPath.<Boolean>read(hers, "$.anything")).isTrue();

        // Alex's week has his five photos and no surprise party.
        String his = summary(alex, "?week=" + MONDAY);
        assertThat(JsonPath.<List<String>>read(his, "$.stats[*].figure")).containsExactly("5", "1", "1", "€350");
        // The week before had nothing in it, and a stranger has no week here at all.
        String before = summary(nora, "?week=" + MONDAY.minusDays(3));
        assertThat(JsonPath.<Boolean>read(before, "$.anything")).isFalse();
        assertThat(JsonPath.<List<Object>>read(before, "$.stats")).isEmpty();
        send(HttpMethod.GET, "/v1/circles/" + circle + "/summary", person("Stranger"), null, 404);
    }

    @Test
    void itGoesOutOnEachPersonsOwnSundayEveningOncePerCircleAndByEmailToWhoeverAskedForThat() throws Exception {
        theLinds();
        String kai = person("Kai");
        join(nora, circle, kai);
        phone(kai, "kai");
        send(HttpMethod.PUT, "/v1/me/settings", alex, "{\"summaryEmail\":true}", 200);
        send(HttpMethod.PUT, "/v1/me/settings", kai, "{\"weeklySummary\":false}", 200);
        String quietCircle = circle(nora, "solo", "Just me");
        aFullWeek();
        quiet();
        mail.clear();
        Instant sundayAfternoon = SUNDAY.atTime(15, 0).atZone(HOME).toInstant();
        Instant sundayEvening = SUNDAY.atTime(18, 30).atZone(HOME).toInstant();

        // Not before six on their own Sunday; then Nora and Alex, once each. Kai switched it off, and Nora's
        // other circle had nothing in it.
        assertThat(job.sendDue(sundayAfternoon)).isZero();
        assertThat(job.sendDue(sundayEvening)).isEqualTo(2);
        assertThat(job.sendDue(sundayEvening.plusSeconds(3600))).isZero();
        assertThat(job.sendDue(SUNDAY.plusDays(1).atTime(9, 0).atZone(HOME).toInstant()))
                .isZero();

        assertThat(pushed())
                .containsExactlyInAnyOrder(
                        "nora: Your week in The Linds | 3 photos · 2 events · 1 bill paid · €350 saved",
                        "alex: Your week in The Linds | 5 photos · 1 event · 1 bill paid · €350 saved");
        assertThat(messages().get(0).url()).isEqualTo("/summary/" + circle + "?week=" + MONDAY);
        // Alex's email says what his page says, and nothing of the party he wasn't shown.
        emails.deliverDue();
        assertThat(mail.sent()).hasSize(1);
        assertThat(mail.sent().get(0).subject()).startsWith("Your week in The Linds: ");
        assertThat(mail.sent().get(0).html())
                .contains(
                        "Hi Alex, here is your week", "Most loved", "Mia&#39;s first time steering", "Dentist for Mia")
                .doesNotContain("Surprise party");
        assertThat(mail.sent().get(0).text()).contains("5 photos · 1 event").doesNotContain("Surprise");
        assertThat(jdbc.sql("select count(*) from summaries_sent")
                        .query(Integer.class)
                        .single())
                .isEqualTo(3);
        assertThat(quietCircle).isNotNull();
        // The next Sunday is a week of its own.
        assertThat(job.sendDue(sundayEvening.plusSeconds(7 * 86400))).isEqualTo(2);
    }
}

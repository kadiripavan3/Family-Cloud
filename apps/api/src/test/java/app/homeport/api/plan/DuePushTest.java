package app.homeport.api.plan;

import static org.assertj.core.api.Assertions.assertThat;

import app.homeport.api.PlanTestBase;
import app.homeport.api.common.Jobs;
import app.homeport.api.notify.DeviceStore;
import app.homeport.api.notify.LoggingPushSender;
import app.homeport.api.notify.PushMessage;
import app.homeport.api.notify.PushSender;
import java.time.Instant;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Pushes about what is due. The job never runs by itself here: each test calls its work at a moment of its
 * own choosing, the moment the push is due.
 */
class DuePushTest extends PlanTestBase {

    @Autowired
    DuePushes due;

    @Autowired
    LoggingPushSender sent;

    @Autowired
    EventStore events;

    @Autowired
    ReminderStore reminders;

    @Autowired
    DeviceStore devices;

    @Autowired
    TransactionTemplate transaction;

    @Autowired
    Jobs jobs;

    /** A day and a time on the clock in Ljubljana, this many minutes from now. */
    private static String[] in(int minutes) {
        ZonedDateTime then =
                ZonedDateTime.now(ZoneId.of(ZONE)).plusMinutes(minutes).truncatedTo(ChronoUnit.MINUTES);
        return new String[] {then.toLocalDate().toString(), then.toLocalTime().toString()};
    }

    private void phone(String token, String name) throws Exception {
        send(
                HttpMethod.PUT,
                "/v1/me/devices",
                token,
                "{\"token\":\"ExponentPushToken[%s]\",\"platform\":\"ios\",\"timeZone\":\"%s\"}".formatted(name, ZONE),
                204);
    }

    private Instant alert(String table, String id) {
        java.sql.Timestamp at = jdbc.sql("select alert_at from " + table + " where thing_id = cast(:id as uuid)")
                .param("id", id)
                .query(java.sql.Timestamp.class)
                .optional()
                .orElse(null);
        return at == null ? null : at.toInstant();
    }

    private List<String> phones() {
        return sent.sent().stream()
                .map(p -> p.token().replace("ExponentPushToken[", "").replace("]", ""))
                .sorted()
                .toList();
    }

    @Test
    void anEventThatAskedForAReminderIsPushedOnceToWhoeverMadeItAndWhoeverIsComing() throws Exception {
        theLinds();
        phone(nora, "nora");
        phone(alex, "alex");
        String[] start = in(90);
        String id = event(
                nora,
                "Haircut · Leo",
                start[0],
                start[1],
                ",\"audience\":\"circle\",\"remindMinutes\":60,\"place\":\"Barber Miha\",\"guests\":[{\"memberId\":\"%s\"},{\"memberId\":\"%s\"}]"
                        .formatted(leoId, alexId));
        Instant moment = alert("events", id);
        assertThat(moment)
                .as("an hour before it starts")
                .isBetween(Instant.now().plusSeconds(28 * 60), Instant.now().plusSeconds(31 * 60));
        sent.clear();

        // Not yet.
        assertThat(due.sendDue(moment.minusSeconds(300))).isZero();
        assertThat(sent.sent()).isEmpty();

        // Now: Nora made it, Alex is coming, Leo has no phone.
        assertThat(due.sendDue(moment)).isEqualTo(1);
        assertThat(phones()).containsExactly("alex", "nora");
        PushMessage push = sent.sent().get(0);
        assertThat(push.title()).isEqualTo("Haircut · Leo");
        assertThat(push.body()).isEqualTo("In 1 hour · " + Words.time(LocalTime.parse(start[1])) + " · Barber Miha");
        assertThat(push.url()).isEqualTo("/event/" + id);

        // And never again.
        assertThat(due.sendDue(moment.plusSeconds(60))).isZero();
        assertThat(due.sendDue(moment.plusSeconds(3600))).isZero();
        assertThat(sent.sent()).hasSize(2);
        assertThat(alert("events", id)).isNull();
    }

    @Test
    void aPushOnlyGoesToSomeoneWhoWantsToHearAndMaySeeItAtThatMoment() throws Exception {
        theLinds();
        String kai = person("Kai");
        String lea = person("Lea");
        String kaiId = join(nora, circle, kai);
        String leaId = join(nora, circle, lea);
        for (String[] who : new String[][] {{nora, "nora"}, {alex, "alex"}, {kai, "kai"}, {lea, "lea"}}) {
            phone(who[0], who[1]);
        }
        String[] start = in(60);
        String id = event(
                nora,
                "Dinner",
                start[0],
                start[1],
                ",\"audience\":\"circle\",\"remindMinutes\":30,\"guests\":[{\"memberId\":\"%s\"},{\"memberId\":\"%s\"},{\"memberId\":\"%s\"}]"
                        .formatted(alexId, kaiId, leaId));
        // Alex switched notifications off, it was hidden from Kai afterwards, and Lea said she can't come.
        send(HttpMethod.PUT, "/v1/me/settings", alex, "{\"notifyActivity\":false}", 200);
        share(nora, id, "{\"audience\":\"circle\",\"hiddenFrom\":[{\"memberId\":\"%s\"}]}".formatted(kaiId));
        send(HttpMethod.PUT, "/v1/events/" + id + "/answer", lea, "{\"answer\":\"cant\"}", 200);
        sent.clear();

        due.sendDue(alert("events", id));

        assertThat(phones()).containsExactly("nora");
    }

    @Test
    void anEventThatRepeatsIsPushedEachTimeItComesRound() throws Exception {
        theLinds();
        phone(nora, "nora");
        String[] start = in(45);
        String id = event(nora, "Swimming", start[0], start[1], ",\"remindMinutes\":15,\"repeat\":{\"unit\":\"week\"}");
        Instant first = alert("events", id);
        sent.clear();

        due.sendDue(first);

        assertThat(phones()).containsExactly("nora");
        assertThat(sent.sent().get(0).body()).startsWith("In 15 minutes · ");
        // The next push is for next week's, to the minute (or an hour off when the clocks change in between).
        Instant next = alert("events", id);
        assertThat(java.time.Duration.between(first, next).toHours()).isBetween(167L, 169L);
        assertThat(due.sendDue(first.plusSeconds(600))).isZero();
        assertThat(due.sendDue(next)).isEqualTo(1);
        assertThat(sent.sent()).hasSize(2);
    }

    @Test
    void aReminderIsPushedWhenItIsDueToWhoeverHasItNow() throws Exception {
        theLinds();
        phone(nora, "nora");
        phone(alex, "alex");
        String[] at = in(30);
        String when = ",\"dueOn\":\"%s\",\"dueTime\":\"%s\"".formatted(at[0], at[1]);
        String own = reminder(nora, "Call the plumber", when);
        String given = reminder(nora, "Book the car service", when + ",\"givenTo\":[\"%s\"]".formatted(alexId));
        String turns = reminder(
                nora,
                "Take the bins out",
                when
                        + ",\"repeat\":{\"unit\":\"day\"},\"takesTurns\":true,\"givenTo\":[\"%s\",\"%s\"]"
                                .formatted(alexId, noraId));
        String done = reminder(nora, "Already done", when);
        send(HttpMethod.PUT, "/v1/reminders/" + done + "/done", nora, "{\"done\":true}", 200);
        reminder(nora, "Some time", "");
        reminder(nora, "Parcel", ",\"place\":{\"words\":\"the post office\"}");
        Instant moment = alert("reminders", own);
        assertThat(alert("reminders", done))
                .as("nothing to tell about what is done")
                .isNull();
        sent.clear();

        assertThat(due.sendDue(moment)).isEqualTo(3);

        assertThat(sent.sent())
                .extracting(p -> p.token().replaceAll(".*\\[|]", "") + ": " + p.title() + " | " + p.body())
                .containsExactlyInAnyOrder(
                        "nora: Call the plumber | Due at " + Words.time(LocalTime.parse(at[1])),
                        "alex: Book the car service | Due at " + Words.time(LocalTime.parse(at[1])),
                        "alex: Take the bins out | Due at " + Words.time(LocalTime.parse(at[1])) + " · your turn");
        assertThat(sent.sent().get(0).url()).startsWith("/reminder/");
        assertThat(due.sendDue(moment.plusSeconds(120))).isZero();

        // Alex ticks the bins: tomorrow's push is Nora's, because it is her turn then.
        send(
                HttpMethod.PUT,
                "/v1/reminders/" + turns + "/done",
                alex,
                "{\"done\":true,\"dueOn\":\"%s\",\"day\":\"%s\"}".formatted(at[0], at[0]),
                200);
        sent.clear();
        due.sendDue(alert("reminders", turns));
        assertThat(phones()).containsExactly("nora");
        assertThat(given).isNotNull();
    }

    @Test
    void whatWasDueWhileTheApiWasAwayForHoursIsNotAnnouncedLate() throws Exception {
        theLinds();
        phone(nora, "nora");
        String[] at = in(20);
        String id = reminder(nora, "Call the plumber", ",\"dueOn\":\"%s\",\"dueTime\":\"%s\"".formatted(at[0], at[1]));
        Instant moment = alert("reminders", id);
        sent.clear();

        assertThat(due.sendDue(moment.plus(DuePushes.TOO_LATE).plusSeconds(60))).isEqualTo(1);

        assertThat(sent.sent()).isEmpty();
        assertThat(alert("reminders", id)).isNull();
    }

    @Test
    void whenThePushServiceCantBeReachedThePushIsTriedAgainAndStillArrivesOnce() throws Exception {
        theLinds();
        phone(nora, "nora");
        String[] at = in(20);
        String reminder =
                reminder(nora, "Call the plumber", ",\"dueOn\":\"%s\",\"dueTime\":\"%s\"".formatted(at[0], at[1]));
        String[] start = in(50);
        String event = event(nora, "Dentist", start[0], start[1], ",\"remindMinutes\":30");
        Instant moment = alert("reminders", reminder);
        // A push service that is down the first time it is called.
        List<PushMessage> arrived = new ArrayList<>();
        PushSender flaky = new PushSender() {
            private boolean down = true;

            @Override
            public Handed send(List<PushMessage> messages) {
                if (down) {
                    down = false;
                    throw new IllegalStateException("The push service can't be reached.");
                }
                arrived.addAll(messages);
                return Handed.NOTHING;
            }

            @Override
            public Outcome outcomes(Collection<String> ticketIds) {
                return Outcome.NOTHING;
            }
        };
        DuePushes job = new DuePushes(events, reminders, new PlanPushes(jdbc, devices, flaky), transaction, jobs);

        assertThat(job.sendDue(moment)).isEqualTo(2);
        assertThat(arrived).isEmpty();
        assertThat(alert("reminders", reminder))
                .as("put back for the next minute")
                .isEqualTo(moment);
        assertThat(alert("events", event)).isNotNull();

        assertThat(job.sendDue(moment.plusSeconds(60))).isEqualTo(2);
        assertThat(arrived).extracting(PushMessage::title).containsExactlyInAnyOrder("Call the plumber", "Dentist");
        assertThat(job.sendDue(moment.plusSeconds(120))).isZero();
        assertThat(arrived).hasSize(2);
    }
}

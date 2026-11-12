package app.homeport.api;

import static org.assertj.core.api.Assertions.assertThat;

import app.homeport.api.money.split.ReminderAsked;
import app.homeport.api.notify.MoneyNews;
import app.homeport.api.notify.Outbox;
import app.homeport.api.notify.Push;
import app.homeport.api.notify.PushKind;
import com.jayway.jsonpath.JsonPath;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpMethod;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * The one outbox every push leaves through: what is never pushed, what is checked again at the moment of
 * sending, what someone who hides details is told, and each kind of push in its own words. Nothing is sent by
 * itself here: each test asks for what is waiting to be sent when it wants it sent.
 */
class NotificationsTest extends TiesTestBase {

    private static final LocalDate TODAY = LocalDate.now(ZoneId.of(ZONE));

    @Autowired
    Outbox outbox;

    @Autowired
    MoneyNews moneyNews;

    @Autowired
    ApplicationEventPublisher events;

    @Autowired
    TransactionTemplate transaction;

    private void shareWith(String thing, String... memberIds) throws Exception {
        audience(
                nora,
                thing,
                "{\"audience\":\"some\",\"people\":[%s]}"
                        .formatted(String.join(
                                ",",
                                java.util.Arrays.stream(memberIds)
                                        .map(id -> "{\"memberId\":\"%s\",\"access\":\"view\"}".formatted(id))
                                        .toList())));
    }

    private int waiting() {
        return jdbc.sql("select count(*) from pushes where status = 'pending'")
                .query(Integer.class)
                .single();
    }

    @Test
    void somethingSharedWithYouByNameIsPushedOnceAndNeverYourOwnChangeNorASecondOfItsKindWithinTheHour()
            throws Exception {
        theLinds();
        String page = page(nora, circle, "Packing for Norway", "me");

        shareWith(page, alexId);

        // In the outbox with its cause; on Alex's phone once it is sent; nothing for Nora, whose change it was.
        assertThat(waiting()).isEqualTo(1);
        assertThat(pushed()).containsExactly("alex: Nora shared Packing for Norway with you | Open to see it");
        assertThat(messages().get(0).url()).isEqualTo("/page/" + page);
        assertThat(messages().get(0).kind()).isEqualTo("shared");
        assertThat(pushed()).hasSize(1);

        // Taken back and shared again a minute later: the same news about the same thing, not told twice.
        audience(nora, page, "{\"audience\":\"me\"}");
        shareWith(page, alexId);
        assertThat(pushed()).hasSize(1);
        // An hour later it would be told again.
        jdbc.sql("update pushes set created_at = created_at - interval '2 hours'")
                .update();
        audience(nora, page, "{\"audience\":\"me\"}");
        shareWith(page, alexId);
        assertThat(pushed()).hasSize(2);
        // Shared with everyone, nobody is named: Activity has it, no phone buzzes.
        page(nora, circle, "House rules", "circle");
        assertThat(pushed()).hasSize(2);
        // And a push that names its own cause is never queued for that person.
        Boolean queued = transaction.execute(
                status -> outbox.tell(Push.to(userOf(noraId), PushKind.SHARED, "x", "y", "/page/" + page)
                        .by(UUID.fromString(noraId))));
        assertThat(queued).isFalse();
    }

    private UUID userOf(String memberId) {
        return jdbc.sql("select user_id from members where id = cast(:id as uuid)")
                .param("id", memberId)
                .query(UUID.class)
                .single();
    }

    @Test
    void everythingIsCheckedAgainAtTheMomentOfSending() throws Exception {
        theLinds();
        String[] names = {"Kai", "Lea", "Lena", "Ana", "Tom"};
        String[] tokens = new String[names.length];
        String[] ids = new String[names.length];
        for (int n = 0; n < names.length; n++) {
            tokens[n] = person(names[n]);
            ids[n] = join(nora, circle, tokens[n]);
            if (n != 4) {
                phone(tokens[n], names[n].toLowerCase());
            }
        }
        quiet();
        String page = page(nora, circle, "The plan", "me");
        shareWith(page, alexId, ids[0], ids[1], ids[2], ids[3], ids[4]);
        assertThat(waiting()).isEqualTo(6);

        // Before it is sent: Kai switches pushes off, it is hidden from Lea, Lena mutes the circle, Ana leaves
        // it, and Tom never had a phone. Only Alex is left to tell.
        send(HttpMethod.PUT, "/v1/me/settings", tokens[0], "{\"notifyActivity\":false}", 200);
        send(HttpMethod.PUT, "/v1/circles/" + circle + "/mute", tokens[2], "{\"muted\":true}", 204);
        send(HttpMethod.DELETE, "/v1/members/" + ids[3], tokens[3], null, 204);
        audience(
                nora,
                page,
                "{\"audience\":\"some\",\"people\":[%s],\"hiddenFrom\":[{\"memberId\":\"%s\"}]}"
                        .formatted(
                                String.join(
                                        ",",
                                        java.util.stream.Stream.of(alexId, ids[0], ids[1], ids[2], ids[4])
                                                .map(id -> "{\"memberId\":\"%s\",\"access\":\"view\"}".formatted(id))
                                                .toList()),
                                ids[1]));

        assertThat(pushed()).containsExactly("alex: Nora shared The plan with you | Open to see it");
        assertThat(jdbc.sql("select status, count(*) from pushes group by status order by status")
                        .query((rs, n) -> rs.getString(1) + " " + rs.getInt(2))
                        .list())
                .containsExactly("sent 1", "skipped 5");
        assertThat(JsonPath.<Boolean>read(activity(tokens[2], ""), "$.muted")).isTrue();

        // A thing that is deleted takes the pushes about it along.
        String gone = page(nora, circle, "Short-lived", "me");
        shareWith(gone, alexId);
        send(HttpMethod.DELETE, "/v1/things/" + gone, nora, null, 204);
        assertThat(waiting()).isZero();
        assertThat(pushed()).hasSize(1);
    }

    @Test
    void someoneWhoHidesDetailsIsToldThatNotWhichOrHowMuchAndTheVaultIsNeverNamedToAnyone() throws Exception {
        theLinds();
        vault(nora);
        vault(alex);
        String kai = person("Kai");
        String kaiId = join(nora, circle, kai);
        phone(kai, "kai");
        vault(kai);
        send(HttpMethod.PUT, "/v1/me/settings", kai, "{\"hideDetails\":true}", 200);
        assertThat(JsonPath.<Boolean>read(fetch("/v1/me/settings", kai), "$.hideDetails"))
                .isTrue();
        assertThat(JsonPath.<Boolean>read(fetch("/v1/me/settings", alex), "$.hideDetails"))
                .isFalse();
        quiet();

        shareWith(page(nora, circle, "Surprise for Leo", "me"), alexId, kaiId);
        String pin = vaultItem(nora, "Bank card PIN");
        send(
                HttpMethod.PUT,
                "/v1/vault/items/" + pin + "/sharing",
                nora,
                "{\"audience\":\"some\",\"people\":[{\"memberId\":\"%s\",\"access\":\"see\",\"wrappedKey\":\"%s\"},{\"memberId\":\"%s\",\"access\":\"see\",\"wrappedKey\":\"%s\"}]}"
                        .formatted(alexId, sealed(105), kaiId, sealed(105)),
                200);

        assertThat(pushed())
                .containsExactlyInAnyOrder(
                        "alex: Nora shared Surprise for Leo with you | Open to see it",
                        "kai: Something was shared with you | Open to see what",
                        "alex: Nora shared something in the Vault with you | Open the Vault to see it",
                        "kai: Something was shared with you | Open to see what");
        assertThat(sent.sent()).noneMatch(push -> (push.title() + push.body()).contains("PIN"));
    }

    @Test
    void aBurstOfPhotosIsOnePushCountedForEachReaderWhenItIsSent() throws Exception {
        theLinds();
        String kai = person("Kai");
        String kaiId = join(nora, circle, kai);
        phone(kai, "kai");
        quiet();

        List<String> first = photos(alex, "circle", 3);
        photos(alex, "circle", 2);
        // Two more that only Nora may see.
        for (String photo : photos(alex, "me", 2)) {
            audience(
                    alex,
                    photo,
                    "{\"audience\":\"some\",\"people\":[{\"memberId\":\"%s\",\"access\":\"view\"}]}".formatted(noraId));
        }

        // Nothing yet: the burst is told ten minutes after its first photo.
        assertThat(pushed()).isEmpty();
        assertThat(waiting()).isZero();
        // Meanwhile one photo is taken back.
        audience(alex, first.get(0), "{\"audience\":\"me\"}");
        jdbc.sql("update activity set push_after = now() - interval '1 second' where push_after is not null")
                .update();

        List<String> told = pushed();

        // One push each, counting what that reader may see now. Alex, who added them, hears nothing.
        assertThat(told).hasSize(2);
        assertThat(told).anySatisfy(push -> assertThat(push).startsWith("nora: Alex added 6 photos | "));
        assertThat(told).anySatisfy(push -> assertThat(push).startsWith("kai: Alex added 4 photos | "));
        assertThat(pushed()).hasSize(2);
        // Photos an hour later are a burst of their own, and count only themselves.
        jdbc.sql("update activity_items set added_at = added_at - interval '2 hours'")
                .update();
        jdbc.sql("update activity set burst_at = burst_at - interval '2 hours'").update();
        jdbc.sql("update pushes set created_at = created_at - interval '2 hours'")
                .update();
        photos(alex, "circle", 1);
        jdbc.sql("update activity set push_after = now() - interval '1 second' where push_after is not null")
                .update();
        assertThat(pushed()).hasSize(4).anySatisfy(push -> assertThat(push).startsWith("kai: Alex added 1 photo | "));
        assertThat(kaiId).isNotNull();
    }

    @Test
    void aBillThatAskedToBeRememberedIsToldOnceOnThePersonsOwnMorningToWhoeverHasntPaid() throws Exception {
        theLinds();
        String shares =
                ",\"audience\":\"circle\",\"remindDays\":1,\"shares\":[{\"memberId\":\"%s\",\"parts\":1},{\"memberId\":\"%s\",\"parts\":1}]"
                        .formatted(noraId, alexId);
        String electricity = bill(nora, "Electricity", 8420, TODAY.plusDays(1).toString(), shares);
        bill(nora, "Rent", 98000, TODAY.plusDays(9).toString(), ",\"audience\":\"circle\",\"remindDays\":2");
        send(HttpMethod.PUT, "/v1/me/settings", alex, "{\"hideDetails\":true}", 200);
        quiet();
        Instant seven = TODAY.atTime(7, 0).atZone(ZoneId.of(ZONE)).toInstant();
        Instant eight = TODAY.atTime(8, 5).atZone(ZoneId.of(ZONE)).toInstant();

        // Not before eight by their own clock; then once, however often the job runs.
        assertThat(moneyNews.remindOfBills(seven)).isZero();
        assertThat(moneyNews.remindOfBills(eight)).isEqualTo(2);
        assertThat(moneyNews.remindOfBills(eight.plusSeconds(900))).isZero();

        assertThat(pushed())
                .containsExactlyInAnyOrder(
                        "nora: Electricity is due tomorrow | €84.20 · Your half is €42.10",
                        "alex: A bill is due tomorrow | Open to see which one");
        assertThat(messages().get(0).url()).isEqualTo("/bill/" + electricity);

        // The rent is told a week from now, two days before it is due, and only to someone whose share is open.
        Instant then = TODAY.plusDays(7).atTime(8, 5).atZone(ZoneId.of(ZONE)).toInstant();
        assertThat(moneyNews.remindOfBills(then)).isEqualTo(1);
        assertThat(jdbc.sql("select title from pushes where status = 'pending'")
                        .query(String.class)
                        .list())
                .containsExactly("Rent is due on "
                        + java.time.format.DateTimeFormatter.ofPattern("EEEE d MMM", java.util.Locale.ENGLISH)
                                .format(TODAY.plusDays(9)));
    }

    @Test
    void aReminderOfWhatSomeoneOwesAndANudgeGoThroughTheSameOutbox() throws Exception {
        theLinds();
        String split = page(nora, circle, "Lisbon weekend", "circle");
        quiet();

        transaction.executeWithoutResult(status -> events.publishEvent(new ReminderAsked(
                UUID.fromString(circle),
                UUID.fromString(split),
                "Lisbon weekend",
                UUID.fromString(alexId),
                UUID.fromString(noraId),
                6400,
                "EUR")));

        assertThat(pushed()).containsExactly("alex: Nora reminds you about Lisbon weekend | You owe €64.00");
        assertThat(messages().get(0).kind()).isEqualTo("money_reminder");
        // A reminder that was undone is never told: the push is written in the transaction of its cause.
        transaction.executeWithoutResult(status -> {
            events.publishEvent(new ReminderAsked(
                    UUID.fromString(circle),
                    UUID.fromString(page(circle)),
                    "Other",
                    UUID.fromString(alexId),
                    UUID.fromString(noraId),
                    100,
                    "EUR"));
            status.setRollbackOnly();
        });
        assertThat(pushed()).hasSize(1);
    }

    private String page(String inCircle) {
        try {
            return page(nora, inCircle, "Another", "circle");
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}

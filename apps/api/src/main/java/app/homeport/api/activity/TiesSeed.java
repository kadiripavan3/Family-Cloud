package app.homeport.api.activity;

import app.homeport.api.activity.ActivityLog.Happened;
import app.homeport.api.common.Sealed;
import app.homeport.api.seed.SeedWorld;
import app.homeport.api.seed.Seeder;
import app.homeport.api.thing.ThingService;
import java.sql.Timestamp;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.time.temporal.TemporalAdjusters;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * The last part of the sample data: what ties the places' samples together, and Activity as its screen draws
 * it. It runs after every place has added its own.
 *
 * <ul>
 *   <li><b>Things that know about each other.</b> The electricity bill is linked to its login in the Vault
 *       and to the invoice in the Library; Netflix to its login. Found by their titles: each place made its
 *       own, and none knew of the others.
 *   <li><b>Activity for The Linds</b>, counted from this moment: Alex asks to see the bank card PIN (twelve
 *       minutes ago, for today only), his nineteen photos from Saturday (two hours ago), Leo fed Biscuit
 *       (7:40), and earlier this week Ines opened her guest pass and Alex and Mia changed Groceries. What is
 *       due ("Electricity is due tomorrow") is never kept: it comes from Money when Activity is read.
 * </ul>
 *
 * <p>Making the sample data through the places' own services wrote lines and queued pushes of its own (every
 * shared thing "was added" a second ago). Those are cleared first: the sample family did all that long ago.
 *
 * <p>"Iceland ring road was kept from Journey" is on the drawing and not here: keeping a journey is the link
 * between the two apps, which is not built yet. The line's kind exists ({@link ActivityKind#KEPT}) for when it is.
 */
@Component
@ConditionalOnProperty(name = "homeport.seed.enabled", havingValue = "true")
class TiesSeed implements Seeder {

    private static final ZoneId HOME = ZoneId.of("Europe/Ljubljana");

    private final ThingService things;
    private final ActivityLog activity;

    private SeedWorld w;

    TiesSeed(ThingService things, ActivityLog activity) {
        this.things = things;
        this.activity = activity;
    }

    @Override
    public int order() {
        return 90;
    }

    @Override
    public void seed(SeedWorld world) {
        w = world;
        links();
        w.jdbc().sql("delete from activity").update();
        w.jdbc().sql("delete from pushes").update();
        lindsActivity();
    }

    // ---------- things that know about each other ----------

    private void links() {
        UUID nora = w.user("nora");
        link(nora, "bill", "Electricity", "vault_item", "Electricity account");
        link(nora, "bill", "Electricity", "document", "Invoice, %");
        link(nora, "bill", "Netflix", "vault_item", "Netflix");
    }

    private void link(UUID as, String kind, String title, String otherKind, String otherTitle) {
        Optional<UUID> from = thing("linds", kind, title);
        Optional<UUID> to = thing("linds", otherKind, otherTitle);
        if (from.isPresent() && to.isPresent()) {
            things.link(from.get(), to.get(), as);
        }
    }

    /** A sample thing by its kind and title, when the place that makes it is there. */
    private Optional<UUID> thing(String circle, String kind, String title) {
        return w.jdbc()
                .sql("""
                    select id from things where circle_id = :circle and kind = :kind and title like :title
                    order by created_at limit 1
                    """)
                .param("circle", w.circle(circle))
                .param("kind", kind)
                .param("title", title)
                .query(UUID.class)
                .optional();
    }

    // ---------- Activity, as its screen draws it ----------

    private void lindsActivity() {
        UUID linds = w.circle("linds");
        UUID nora = w.member("linds", "nora");
        UUID alex = w.member("linds", "alex");
        UUID mia = w.member("linds", "mia");
        UUID leo = w.member("linds", "leo");
        Instant now = Instant.now();
        LocalDate today = LocalDate.now(HOME);
        LocalDate monday = today.with(TemporalAdjusters.previous(DayOfWeek.MONDAY));

        // Earlier this week. On Monday Ines, the sitter, opened her pass at 18:02; it ran until 23:30.
        activity.record(Happened.in(linds, ActivityKind.GUEST_PASS)
                .byGuest("Ines")
                .count("ends", monday.atTime(23, 30).atZone(HOME).toEpochSecond())
                .forAdults()
                .at(monday.atTime(18, 2).atZone(HOME).toInstant()));

        // The same Monday Alex and Mia were in Groceries: nine things added and five ticked between them.
        thing("linds", "checklist", "Groceries").ifPresent(groceries -> {
            activity.record(Happened.to(linds, ActivityKind.LIST, groceries)
                    .by(mia)
                    .count("added", 3)
                    .count("ticked", 2)
                    .at(monday.atTime(16, 40).atZone(HOME).toInstant()));
            activity.record(Happened.to(linds, ActivityKind.LIST, groceries)
                    .by(alex)
                    .count("added", 6)
                    .count("ticked", 3)
                    .at(monday.atTime(17, 15).atZone(HOME).toInstant()));
        });

        // Today. Leo fed Biscuit at 7:40 and earned a star on the chore wheel.
        Instant fed = today.atTime(7, 40).atZone(HOME).toInstant();
        thing("linds", "board", "Chore wheel")
                .ifPresent(wheel -> activity.record(Happened.to(linds, ActivityKind.BOARD, wheel)
                        .by(leo)
                        .saying("fed Biscuit and earned a star", false)
                        .count("times")
                        .at(fed.isBefore(now) ? fed : now.minus(3, ChronoUnit.HOURS))));

        // Two hours ago Alex's photos from Saturday at the lake arrived: one line for all of them.
        List<UUID> photos = w.jdbc()
                .sql("""
                    select t.id from things t join library_items i on i.thing_id = t.id
                    where t.circle_id = :circle and t.owner_id = :alex and t.kind in ('photo', 'video')
                      and t.audience <> 'me' and i.day = (
                        select max(x.day) from library_items x join things xt on xt.id = x.thing_id
                        where xt.circle_id = :circle and extract(isodow from x.day) = 6)
                    """)
                .param("circle", linds)
                .param("alex", alex)
                .query(UUID.class)
                .list();
        Instant arrived = now.minus(2, ChronoUnit.HOURS);
        photos.forEach(
                photo -> activity.record(Happened.photo(linds, photo).by(alex).at(arrived)));
        // They were told about when they arrived: no burst waits to be pushed.
        w.jdbc().sql("update activity set push_after = null").update();

        // Twelve minutes ago Alex asked to see the bank card PIN, for today only. Nora shared it with him once,
        // for one look, and that look is used up: he knows it is there and can't open it.
        UUID pin = UUID.randomUUID();
        w.jdbc()
                .sql("""
                    insert into things (id, circle_id, owner_id, kind, place, title, audience, everyone_edits,
                      created_at, updated_at)
                    values (:id, :circle, :owner, 'vault_item', 'vault', 'Bank card PIN', 'some', false,
                      now() - interval '40 days', now() - interval '6 days')
                    """)
                .param("id", pin)
                .param("circle", linds)
                .param("owner", nora)
                .update();
        w.jdbc()
                .sql("""
                    insert into vault_items (thing_id, category, site, health, ciphertext, changed_by)
                    values (:id, 'code', 'card', 'ok', :sample, :owner)
                    """)
                .param("id", pin)
                .param("sample", Sealed.SAMPLE)
                .param("owner", nora)
                .update();
        w.jdbc()
                .sql("insert into thing_shares (thing_id, member_id, can_edit) values (:thing, :member, false)")
                .param("thing", pin)
                .param("member", alex)
                .update();
        w.jdbc().sql("""
                    insert into vault_grants (thing_id, member_id, access, once, used_at, opened_at, opened_times, given_at)
                    values (:thing, :member, 'see', true, now() - interval '6 days', now() - interval '6 days', 1,
                      now() - interval '6 days')
                    """).param("thing", pin).param("member", alex).update();
        UUID ask = UUID.randomUUID();
        Instant asked = now.minus(12, ChronoUnit.MINUTES);
        w.jdbc()
                .sql("""
                    insert into asks (id, circle_id, thing_id, asker_id, owner_id, until, created_at)
                    values (:id, :circle, :thing, :asker, :owner, :until, :at)
                    """)
                .param("id", ask)
                .param("circle", linds)
                .param("thing", pin)
                .param("asker", alex)
                .param("owner", nora)
                .param(
                        "until",
                        Timestamp.from(today.plusDays(1).atStartOfDay(HOME).toInstant()))
                .param("at", Timestamp.from(asked))
                .update();
        activity.record(Happened.to(linds, ActivityKind.ASK, pin)
                .by(alex)
                .onlyFor(nora)
                .ask(ask)
                .at(asked));

        // Nora last looked at Activity three hours ago: the ask and the photos are new to her.
        w.jdbc()
                .sql("insert into activity_seen (member_id, seen_at) values (:member, :at)")
                .param("member", nora)
                .param("at", Timestamp.from(now.minus(3, ChronoUnit.HOURS)))
                .update();
        // (Mia is named above only for what she did; she has no phone, so nothing is ever new "to her".)
    }
}

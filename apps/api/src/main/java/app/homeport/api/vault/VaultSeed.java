package app.homeport.api.vault;

import app.homeport.api.common.Sealed;
import app.homeport.api.seed.SeedWorld;
import app.homeport.api.seed.Seeder;
import java.time.LocalDate;
import java.util.UUID;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * The Vault of the screens: about a dozen items across the six drawers of The Linds.
 *
 * <p>A seed can't scramble the way a phone does: the sample people have no keys. So every item here holds a
 * fixed marker in place of a ciphertext ({@link Sealed#SAMPLE}) and nobody holds a grant. The app shows such
 * an item as "sample item: add your own to see the real thing"; its title, drawer, site and expiry are real,
 * so the lists, the counts, the search and a person's page look like the screens.
 */
@Component
@ConditionalOnProperty(name = "homeport.seed.enabled", havingValue = "true")
class VaultSeed implements Seeder {

    private int made;

    @Override
    public int order() {
        return 50;
    }

    @Override
    public void seed(SeedWorld w) {
        LocalDate today = LocalDate.now();

        // Logins. Alex shares Netflix with Nora; two of Nora's own need a look.
        UUID netflix = item(w, "linds", "alex", "Netflix", "login", "netflix.com", null, "ok", "some");
        share(w, netflix, w.member("linds", "nora"), false);
        item(w, "linds", "nora", "Electricity account", "login", "elektro.example", null, "ok", "me");
        UUID school = item(w, "linds", "nora", "School portal", "login", "school.example", null, "ok", "some");
        share(w, school, w.member("linds", "alex"), true);
        item(w, "linds", "nora", "Bank", "login", "bank.example", null, "reused", "me");
        item(w, "linds", "nora", "Old email", "login", "mail.example", null, "leaked", "me");

        // A card.
        item(w, "linds", "nora", "Family debit card", "card", "", null, "ok", "me");

        // IDs, each about the person it belongs to. On the day the screens were drawn, Mia's passport ran out on
        // 2 Aug 2027 and Nora's on 14 Mar 2031: the same distances from today.
        UUID noras = item(w, "linds", "nora", "Nora's passport", "id", "", today.plusDays(1584), "ok", "me");
        about(w, noras, w.member("linds", "nora"));
        UUID mias = item(w, "linds", "nora", "Mia's passport", "id", "", today.plusDays(264), "ok", "some");
        share(w, mias, w.member("linds", "alex"), false);
        about(w, mias, w.member("linds", "mia"));
        UUID alexs = item(w, "linds", "alex", "Alex's passport", "id", "", today.plusDays(905), "ok", "me");
        about(w, alexs, w.member("linds", "alex"));
        UUID leos = item(w, "linds", "nora", "Leo's ID card", "id", "", today.plusDays(1120), "ok", "some");
        share(w, leos, w.member("linds", "alex"), false);
        about(w, leos, w.member("linds", "leo"));

        // Wi‑Fi and codes: the house's, for everyone in The Linds.
        item(w, "linds", "nora", "Home Wi‑Fi", "wifi", "Lind-Home", null, "ok", "circle");
        item(w, "linds", "alex", "Front door code", "code", "home", null, "ok", "circle");
        item(w, "linds", "nora", "Bike lock", "code", "shed", null, "ok", "me");

        // A secret.
        item(w, "linds", "nora", "Where the will is", "secret", "", null, "ok", "me");

        // And one for the flat, so Kai, Lea and Lena have something in their Vault too.
        item(w, "flat", "kai", "Flat Wi‑Fi", "wifi", "Trubarjeva-9", null, "ok", "circle");
    }

    private UUID item(
            SeedWorld w,
            String circle,
            String owner,
            String title,
            String category,
            String site,
            LocalDate expiresOn,
            String health,
            String audience) {
        UUID id = UUID.randomUUID();
        // Each one a little older than the one before, so lists come in the order they are written here.
        int hoursAgo = ++made;
        w.jdbc()
                .sql("""
                    insert into things (id, circle_id, owner_id, kind, place, title, audience, everyone_edits,
                      created_at, updated_at)
                    values (:id, :circle, :owner, 'vault_item', 'vault', :title, :audience, false,
                      now() - make_interval(hours => :ago), now() - make_interval(hours => :ago))
                    """)
                .param("ago", hoursAgo)
                .param("id", id)
                .param("circle", w.circle(circle))
                .param("owner", w.member(circle, owner))
                .param("title", title)
                .param("audience", audience)
                .update();
        w.jdbc()
                .sql("""
                    insert into vault_items (thing_id, category, site, expires_on, health, ciphertext, changed_by)
                    values (:id, :category, :site, :expires, :health, :sample, :owner)
                    """)
                .param("id", id)
                .param("category", category)
                .param("site", site)
                .param("expires", expiresOn)
                .param("health", health)
                .param("sample", Sealed.SAMPLE)
                .param("owner", w.member(circle, owner))
                .update();
        return id;
    }

    private static void share(SeedWorld w, UUID thing, UUID member, boolean canEdit) {
        w.jdbc()
                .sql("insert into thing_shares (thing_id, member_id, can_edit) values (:thing, :member, :edit)")
                .param("thing", thing)
                .param("member", member)
                .param("edit", canEdit)
                .update();
    }

    private static void about(SeedWorld w, UUID thing, UUID member) {
        w.jdbc()
                .sql("insert into thing_about (thing_id, member_id) values (:thing, :member)")
                .param("thing", thing)
                .param("member", member)
                .update();
    }
}

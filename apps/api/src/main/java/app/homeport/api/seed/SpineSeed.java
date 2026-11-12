package app.homeport.api.seed;

import java.time.LocalDate;
import java.time.MonthDay;
import java.util.List;
import java.util.UUID;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/** The people and circles of the screens, and a few pages to share. */
@Component
@ConditionalOnProperty(name = "homeport.seed.enabled", havingValue = "true")
class SpineSeed implements Seeder {

    @Override
    public int order() {
        return 0;
    }

    @Override
    public void seed(SeedWorld w) {
        JdbcClient jdbc = w.jdbc();
        person(w, "nora", "Nora Lind", "av-me.jpg");
        person(w, "alex", "Alex Strand", "av-alex.jpg");
        person(w, "lea", "Lea", "av-lea.jpg");
        person(w, "kai", "Kai", "av-kai.jpg");
        person(w, "lena", "Lena", "av-lena.jpg");
        person(w, "ana", "Ana", "av-ana.jpg");

        // The Linds: a family of four and a dog, since March 2024.
        circle(w, "linds", "family", "The Linds", "nora", "mum-kid.jpg", "2024-03-02");
        joined(w, "linds", "nora", "owner", 1);
        joined(w, "linds", "alex", "adult", 2);
        LocalDate miaTurnsTen = next(MonthDay.of(12, 4));
        without(
                w,
                "linds",
                "mia",
                "Mia",
                "child",
                "av-mia.jpg",
                miaTurnsTen.minusYears(10),
                "",
                3,
                List.of("Shoes 33", "Clothes 134", "Class 4B", "Swims on Thursdays"));
        without(
                w,
                "linds",
                "leo",
                "Leo",
                "child",
                "av-leo.jpg",
                next(MonthDay.of(3, 14)).minusYears(7),
                "",
                4,
                List.of("Shoes 29", "Class 1A"));
        without(w, "linds", "biscuit", "Biscuit", "pet", "av-biscuit.jpg", null, "Dog", 5, List.of());

        // Nora and Alex: the two of them.
        circle(w, "couple", "couple", "Nora and Alex", "nora", "bench.jpg", "2024-06-15");
        joined(w, "couple", "nora", "owner", 1);
        joined(w, "couple", "alex", "adult", 2);

        // Lisbon crew: five friends.
        circle(w, "crew", "crew", "Lisbon crew", "lea", "market.jpg", "2025-02-08");
        joined(w, "crew", "lea", "owner", 1);
        joined(w, "crew", "nora", "adult", 2);
        joined(w, "crew", "kai", "adult", 3);
        joined(w, "crew", "lena", "adult", 4);
        joined(w, "crew", "ana", "adult", 5);

        // The flat on Trubarjeva: Kai, Lea and Lena. Ana moved out.
        circle(w, "flat", "flat", "Trubarjeva 9", "kai", "hallway.jpg", "2025-09-01");
        joined(w, "flat", "kai", "owner", 1);
        joined(w, "flat", "lea", "adult", 2);
        joined(w, "flat", "lena", "adult", 3);
        joined(w, "flat", "ana", "adult", 4);
        jdbc.sql("update members set status = 'left' where id = :id")
                .param("id", w.member("flat", "ana"))
                .update();

        // A few pages in The Linds, shared in each of the ways there are.
        UUID wifi = page(w, "linds", "nora", "Wi‑Fi and smart home", "some", """
            Network: Lind-Home
            The router is in the hallway cupboard. If the internet stops, switch it off, count to ten, switch it on.

            Lights: say "goodnight" to switch everything off downstairs.
            Heating: 20° by day, 17° at night. The app is on the tablet in the kitchen.
            """);
        share(jdbc, wifi, w.member("linds", "alex"), true);
        share(jdbc, wifi, w.member("linds", "mia"), false);

        UUID birthday = page(w, "linds", "nora", "Mia's 10th birthday", "circle", """
            Gift ideas
            Roller skates, size 33. Alex bought them.
            Watercolour set. Grandma Astrid wants this one.
            Climbing course, 5 lessons. From both of us.

            The party: Saturday at 14:00, at home. 8 children invited.
            """);
        jdbc.sql("insert into thing_hides (thing_id, member_id, through) values (:thing, :member, :through)")
                .param("thing", birthday)
                .param("member", w.member("linds", "mia"))
                .param("through", miaTurnsTen)
                .update();
        about(jdbc, birthday, w.member("linds", "mia"));

        page(w, "linds", "nora", "Babysitter notes", "circle", """
            Bedtimes: Leo at 19:30, Mia at 20:30. One story each.
            Snacks: fruit is in the bowl. No sweets after dinner.
            What Leo will try: "Mum says I can stay up." She doesn't.
            """);
        page(w, "linds", "alex", "Emergency numbers", "circle", """
            Nora: 041 555 010
            Alex: 041 555 011
            Grandma Astrid: 041 555 012
            The neighbours, Petra and Jan, at number 7: 041 555 013
            """);
        page(w, "linds", "nora", "Gift list for Alex", "me", """
            The headphones he keeps looking at.
            A weekend in the mountains, just the two of us.
            """);
        page(
                w,
                "crew",
                "lea",
                "Who brings what",
                "circle",
                "Lea: the speaker. Kai: the cards. Nora: sun cream for everyone.");
        page(
                w,
                "flat",
                "kai",
                "House rules",
                "circle",
                "Quiet after 22:00 on weekdays. Bins go out on Tuesday night. Label what is yours in the fridge.");
    }

    /** The next time this day of the year comes round (today counts). */
    static LocalDate next(MonthDay day) {
        LocalDate today = LocalDate.now();
        LocalDate thisYear = day.atYear(today.getYear());
        return thisYear.isBefore(today) ? day.atYear(today.getYear() + 1) : thisYear;
    }

    private static void person(SeedWorld w, String key, String name, String photo) {
        UUID id = w.person(key, key + "@example.com");
        w.jdbc()
                .sql("insert into profiles (id, display_name, age_confirmed_at) values (:id, :name, now())")
                .param("id", id)
                .param("name", name)
                .update();
        UUID avatar = w.photo(key, photo);
        w.jdbc()
                .sql("update profiles set avatar_media_id = :avatar where id = :id")
                .param("id", id)
                .param("avatar", avatar)
                .update();
    }

    private static void circle(
            SeedWorld w, String key, String kind, String name, String owner, String cover, String since) {
        UUID id = UUID.randomUUID();
        w.jdbc()
                .sql("""
            insert into circles (id, kind, name, join_code, created_by, cover_media_id, created_at)
            values (:id, :kind, :name, :code, :by, :cover, cast(:since as date))
            """)
                .param("id", id)
                .param("kind", kind)
                .param("name", name)
                .param("code", key + "-sample-" + id.toString().substring(0, 8))
                .param("by", w.user(owner))
                .param("cover", w.photo(owner, cover))
                .param("since", since)
                .update();
        w.circle(key, id);
    }

    private static void joined(SeedWorld w, String circle, String person, String role, int tint) {
        UUID id = UUID.randomUUID();
        w.jdbc()
                .sql("""
            insert into members (id, circle_id, user_id, name, role, tint, avatar_media_id, created_at)
            select :id, c.id, p.id, p.display_name, :role, :tint, p.avatar_media_id, c.created_at + make_interval(mins => :tint)
            from circles c, profiles p where c.id = :circle and p.id = :user
            """)
                .param("id", id)
                .param("circle", w.circle(circle))
                .param("user", w.user(person))
                .param("role", role)
                .param("tint", tint)
                .update();
        w.member(circle, person, id);
    }

    private static void without(
            SeedWorld w,
            String circle,
            String key,
            String name,
            String kind,
            String photo,
            LocalDate birthday,
            String about,
            int tint,
            List<String> facts) {
        UUID id = UUID.randomUUID();
        w.jdbc()
                .sql("""
            insert into members (id, circle_id, name, kind, role, status, avatar_media_id, birthday, about, facts, tint, created_at)
            select :id, c.id, :name, :kind, 'child', 'no_phone', :avatar, :birthday, :about, :facts, :tint,
              c.created_at + make_interval(mins => :tint)
            from circles c where c.id = :circle
            """)
                .param("id", id)
                .param("circle", w.circle(circle))
                .param("name", name)
                .param("kind", kind)
                .param("avatar", w.photo("nora", photo))
                .param("birthday", birthday)
                .param("about", about)
                .param("facts", facts.toArray(String[]::new))
                .param("tint", tint)
                .update();
        w.member(circle, key, id);
    }

    static UUID page(SeedWorld w, String circle, String owner, String title, String audience, String body) {
        UUID id = UUID.randomUUID();
        w.jdbc()
                .sql("""
            insert into things (id, circle_id, owner_id, kind, place, title, audience)
            values (:id, :circle, :owner, 'page', 'notes', :title, :audience)
            """)
                .param("id", id)
                .param("circle", w.circle(circle))
                .param("owner", w.member(circle, owner))
                .param("title", title)
                .param("audience", audience)
                .update();
        w.jdbc()
                .sql("insert into pages (thing_id, body) values (:id, :body)")
                .param("id", id)
                .param("body", body.strip())
                .update();
        return id;
    }

    static void share(JdbcClient jdbc, UUID thing, UUID member, boolean canEdit) {
        jdbc.sql("insert into thing_shares (thing_id, member_id, can_edit) values (:thing, :member, :edit)")
                .param("thing", thing)
                .param("member", member)
                .param("edit", canEdit)
                .update();
    }

    static void about(JdbcClient jdbc, UUID thing, UUID member) {
        jdbc.sql("insert into thing_about (thing_id, member_id) values (:thing, :member)")
                .param("thing", thing)
                .param("member", member)
                .update();
    }
}

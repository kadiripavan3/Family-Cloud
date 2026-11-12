package app.homeport.api.library;

import app.homeport.api.library.DocumentReader.FoundDate;
import app.homeport.api.library.DocumentReader.Reading;
import app.homeport.api.media.MediaKind;
import app.homeport.api.media.MediaStorage;
import app.homeport.api.media.MediaStore;
import app.homeport.api.seed.SeedWorld;
import app.homeport.api.seed.Seeder;
import app.homeport.api.thing.ThingKind;
import java.awt.Color;
import java.awt.Font;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.sql.Timestamp;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.Month;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import javax.imageio.ImageIO;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/**
 * The Linds' Library, as the screens draw it: Saturday at the lake from three people (Alex's nineteen arrived
 * today, Mia's came from her tablet under her mum), Thursday at home, last summer in an album, a few years
 * back for the strip at the side, Mia's and Biscuit's albums that fill themselves, and the family's files.
 * Days are counted back from the day this runs, so it is always "last Saturday".
 */
@Component
@ConditionalOnProperty(name = "homeport.seed.enabled", havingValue = "true")
class LibrarySeed implements Seeder {

    private static final Logger log = LoggerFactory.getLogger(LibrarySeed.class);
    private static final ZoneId HOME_TIME = ZoneId.of("Europe/Ljubljana");

    /** A place, as a phone would name it. */
    private record Spot(String name, String country, double lat, double lng, ZoneId zone) {}

    private static final Spot LAKE = new Spot("Lake Bled", "Slovenia", 46.3625, 14.0938, HOME_TIME);
    private static final Spot HOME = new Spot("Home", "Slovenia", 46.0569, 14.5058, HOME_TIME);
    private static final Spot TRIGLAV = new Spot("Triglav park", "Slovenia", 46.3783, 13.8367, HOME_TIME);
    private static final Spot RADOVLJICA = new Spot("Radovljica", "Slovenia", 46.3444, 14.1744, HOME_TIME);
    private static final Spot BOHINJ = new Spot("Bohinj road", "Slovenia", 46.2836, 13.8866, HOME_TIME);
    private static final Spot EL_NIDO = new Spot("El Nido", "Philippines", 11.1784, 119.3930, ZoneId.of("Asia/Manila"));
    private static final Spot CAPPADOCIA =
            new Spot("Cappadocia", "Türkiye", 38.6431, 34.8289, ZoneId.of("Europe/Istanbul"));

    private final MediaStore media;
    private final MediaStorage storage;
    private final DocumentStore documents;
    private final Path images;
    private int counter;

    LibrarySeed(
            MediaStore media,
            MediaStorage storage,
            DocumentStore documents,
            @Value("${homeport.seed.images:../../design/hub/img}") String images) {
        this.media = media;
        this.storage = storage;
        this.documents = documents;
        this.images = Path.of(images).toAbsolutePath().normalize();
    }

    @Override
    public int order() {
        return 20;
    }

    @Override
    public void seed(SeedWorld w) {
        LocalDate today = LocalDate.now(HOME_TIME);
        Instant now = Instant.now();
        UUID mia = w.member("linds", "mia");
        UUID biscuit = w.member("linds", "biscuit");
        UUID leo = w.member("linds", "leo");

        // ---------- Saturday at the lake: 51 from three people, 48 photos and 3 videos ----------
        LocalDate saturday = today.with(TemporalAdjusters.previous(DayOfWeek.SATURDAY));
        Instant thatEvening = saturday.atTime(19, 30).atZone(HOME_TIME).toInstant();
        LocalDateTime last = saturday.atTime(11, 42);
        // The seven the wall shows first, the newest first.
        UUID canoe = shot(
                w,
                "alex",
                null,
                "canoe.jpg",
                last,
                LAKE,
                "Mia's first time steering",
                now.minus(95, ChronoUnit.MINUTES));
        about(w, canoe, mia);
        UUID girlField = shot(w, "nora", null, "girl-field.jpg", last.minusMinutes(3), LAKE, "", thatEvening);
        about(w, girlField, mia);
        shot(w, "nora", "mia", "picnic.jpg", last.minusMinutes(6), LAKE, "", thatEvening);
        about(w, shot(w, "nora", "mia", "pug-woods.jpg", last.minusMinutes(9), LAKE, "", thatEvening), biscuit);
        video(w, "alex", "canoe-lake.jpg", last.minusMinutes(12), LAKE, 42, now.minus(96, ChronoUnit.MINUTES));
        UUID mugs = shot(w, "nora", null, "mugs.jpg", last.minusMinutes(15), LAKE, "", thatEvening);
        UUID bench = shot(w, "nora", "mia", "bench.jpg", last.minusMinutes(18), LAKE, "", thatEvening);
        // The other 44: Nora's 19 more, Alex's 17 more, Mia's 8 more, one after the other through the morning.
        String[] lake = {
            "lake.jpg",
            "picnic.jpg",
            "heart-hands.jpg",
            "bench.jpg",
            "autumn.jpg",
            "mugs.jpg",
            "girl-field.jpg",
            "canoe.jpg",
            "fog.jpg",
            "cabin.jpg"
        };
        String[] dog = {"puppy.jpg", "pug-woods.jpg", "pug.jpg"};
        String[] girl = {"girl-sun.jpg", "mum-kid.jpg", "girl-field.jpg"};
        int[] left = {19, 17, 8};
        int[] done = {0, 0, 0};
        for (int k = 7; k < 51; k++) {
            int who = k % 3;
            while (done[who] >= left[who]) {
                who = (who + 1) % 3;
            }
            int nth = done[who]++;
            LocalDateTime taken = last.minusMinutes(3L * k);
            if (who == 0) {
                if (nth == 5) {
                    video(w, "nora", "lake.jpg", taken, LAKE, 18, thatEvening);
                } else {
                    shot(w, "nora", null, lake[nth % lake.length], taken, LAKE, "", thatEvening);
                }
            } else if (who == 1) {
                // Alex's arrived today: they are what is new for Nora. Six are of the dog, three more of Mia.
                Instant added = now.minus(97 + nth, ChronoUnit.MINUTES);
                if (nth < 6) {
                    about(w, shot(w, "alex", null, dog[nth % dog.length], taken, LAKE, "", added), biscuit);
                } else if (nth < 9) {
                    about(w, shot(w, "alex", null, girl[nth % girl.length], taken, LAKE, "", added), mia);
                } else if (nth == 9) {
                    video(w, "alex", "canoe-lake.jpg", taken, LAKE, 27, added);
                } else {
                    shot(w, "alex", null, lake[(nth + 3) % lake.length], taken, LAKE, "", added);
                }
            } else {
                shot(w, "nora", "mia", lake[(nth + 6) % lake.length], taken, LAKE, "", thatEvening);
            }
        }
        love(w, canoe, w.member("linds", "nora"));
        love(w, canoe, mia);
        comment(w, canoe, w.member("linds", "nora"), "She did so well!", now.minus(80, ChronoUnit.MINUTES));
        comment(
                w,
                canoe,
                w.member("linds", "alex"),
                "Only one near miss with the jetty.",
                now.minus(70, ChronoUnit.MINUTES));
        comment(w, canoe, mia, "Can we go again next Saturday?", now.minus(60, ChronoUnit.MINUTES));

        // ---------- Thursday at home: nine photos, all Nora's ----------
        LocalDate thursday = saturday.minusDays(2);
        Instant thatNight = thursday.atTime(21, 0).atZone(HOME_TIME).toInstant();
        String[] home = {
            "cookies.jpg",
            "pug.jpg",
            "dining.jpg",
            "tea-table.jpg",
            "book.jpg",
            "bed-mug.jpg",
            "hallway.jpg",
            "puppy.jpg",
            "breakfast.jpg"
        };
        for (int k = 0; k < home.length; k++) {
            UUID id =
                    shot(w, "nora", null, home[k], thursday.atTime(19, 40).minusMinutes(85L * k), HOME, "", thatNight);
            if (home[k].startsWith("pu")) {
                about(w, id, biscuit);
            }
        }

        // ---------- earlier this year, and a few years back for the strip at the side ----------
        LocalDate october = last(Month.OCTOBER, today);
        List<String> park = List.of("autumn.jpg", "fog.jpg", "cabin.jpg");
        for (int n = 0; n < park.size(); n++) {
            shot(
                    w,
                    "nora",
                    null,
                    park.get(n),
                    october.withDayOfMonth(18).atTime(10, 20).plusMinutes(9L * n),
                    TRIGLAV,
                    "",
                    null);
        }
        List<String> town = List.of("yellow-house.jpg", "green-door.jpg", "red-door.jpg");
        for (int n = 0; n < town.size(); n++) {
            shot(
                    w,
                    "alex",
                    null,
                    town.get(n),
                    october.withDayOfMonth(25).atTime(15, 5).plusMinutes(4L * n),
                    RADOVLJICA,
                    "",
                    null);
        }
        LocalDate september = last(Month.SEPTEMBER, today);
        List<String> ride = List.of("bike.jpg", "runner.jpg", "road.jpg");
        for (int n = 0; n < ride.size(); n++) {
            shot(
                    w,
                    "alex",
                    null,
                    ride.get(n),
                    september.withDayOfMonth(13).atTime(9, 30).plusMinutes(11L * n),
                    BOHINJ,
                    "",
                    null);
        }
        about(
                w,
                shot(
                        w,
                        "nora",
                        null,
                        "cooking.jpg",
                        september.withDayOfMonth(20).atTime(18, 10),
                        HOME,
                        "",
                        null),
                mia);

        LocalDate august = last(Month.AUGUST, today);
        List<UUID> summer = new ArrayList<>();
        UUID seaCave =
                shot(w, "nora", null, "sea-cave.jpg", august.withDayOfMonth(14).atTime(11, 5), EL_NIDO, "", null);
        summer.add(seaCave);
        summer.add(video(w, "alex", "surf-video.jpg", august.withDayOfMonth(14).atTime(10, 40), EL_NIDO, 21, null));
        List<String> beach = List.of("el-nido.jpg", "swimmer.jpg", "surfboard.jpg", "van.jpg", "terraces.jpg");
        for (int n = 0; n < beach.size(); n++) {
            summer.add(shot(
                    w,
                    n % 2 == 0 ? "nora" : "alex",
                    null,
                    beach.get(n),
                    august.withDayOfMonth(12).atTime(16, 0).plusMinutes(7L * n),
                    EL_NIDO,
                    "",
                    null));
        }
        UUID girlSun =
                shot(w, "nora", null, "girl-sun.jpg", august.withDayOfMonth(15).atTime(17, 45), EL_NIDO, "", null);
        about(w, girlSun, mia);
        summer.add(girlSun);

        int year = today.getYear();
        shot(w, "nora", null, "fireworks.jpg", LocalDate.of(year - 1, 12, 31).atTime(23, 58), HOME, "", null);
        shot(
                w,
                "alex",
                null,
                "sparkler-hand.jpg",
                LocalDate.of(year - 1, 12, 31).atTime(23, 40),
                HOME,
                "",
                null);
        shot(w, "nora", null, "canoe-lake.jpg", LocalDate.of(year - 1, 6, 21).atTime(14, 15), LAKE, "", null);
        about(
                w,
                shot(
                        w,
                        "nora",
                        null,
                        "cake.jpg",
                        LocalDate.of(year - 1, 3, 14).atTime(16, 30),
                        HOME,
                        "Leo turns six",
                        null),
                leo);
        shot(w, "alex", null, "lake.jpg", LocalDate.of(year - 2, 7, 6).atTime(12, 0), LAKE, "", null);
        about(
                w,
                shot(
                        w,
                        "alex",
                        "leo",
                        "tricycle.jpg",
                        LocalDate.of(year - 2, 5, 18).atTime(10, 45),
                        HOME,
                        "",
                        null),
                leo);
        shot(w, "alex", "leo", "blueberries.jpg", LocalDate.of(year - 3, 8, 2).atTime(11, 20), TRIGLAV, "", null);
        shot(
                w,
                "nora",
                null,
                "house.jpg",
                LocalDate.of(year - 3, 4, 9).atTime(13, 0),
                HOME,
                "The day we moved in",
                null);
        shot(w, "nora", null, "strawberries.jpg", LocalDate.of(year - 4, 6, 12).atTime(9, 50), HOME, "", null);
        shot(w, "alex", null, "desk.jpg", LocalDate.of(year - 5, 11, 3).atTime(8, 30), HOME, "", null);
        shot(w, "nora", null, "cappadocia.jpg", LocalDate.of(year - 7, 9, 24).atTime(6, 40), CAPPADOCIA, "", null);
        about(
                w,
                shot(
                        w,
                        "nora",
                        null,
                        "mum-kid-street.jpg",
                        LocalDate.of(year - 10, 12, 28).atTime(15, 15),
                        HOME,
                        "",
                        null),
                mia);

        // ---------- albums ----------
        UUID summerAlbum = album(w, "nora", "Summer " + august.getYear(), "", "circle", null, false, seaCave);
        put(w, summerAlbum, summer, w.member("linds", "nora"));
        album(w, "nora", "Mia", "", "circle", mia, false, girlSun);
        album(w, "nora", "Biscuit", "mostly asleep", "circle", biscuit, false, null);
        UUID book = album(w, "nora", "For the photo book", "", "me", null, false, null);
        put(w, book, List.of(canoe, girlField, mugs, bench), w.member("linds", "nora"));

        // ---------- files ----------
        DateTimeFormatter longDay = DateTimeFormatter.ofPattern("d MMMM yyyy", Locale.ENGLISH);
        LocalDate firstOfFebruary =
                today.getMonthValue() == 1 ? LocalDate.of(year, 2, 1) : LocalDate.of(year + 1, 2, 1);
        UUID insurance = pdf(
                w,
                "nora",
                "Home insurance",
                "some",
                3,
                now.minus(20, ChronoUnit.DAYS),
                List.of(
                        "Home insurance policy",
                        "Policyholder: Nora Lind and Alex Strand",
                        "Policy number: HL-204-118",
                        "Covers the house and what is in it, up to 250,000 euros.",
                        "The policy renews on " + longDay.format(firstOfFebruary) + ".",
                        "Yearly premium: EUR 412.00"));
        share(w, insurance, w.member("linds", "alex"), true);

        LocalDate miaBorn = w.jdbc()
                .sql("select birthday from members where id = :id")
                .param("id", mia)
                .query(LocalDate.class)
                .single();
        LocalDate passportEnds = today.plusMonths(9).withDayOfMonth(2);
        List<String> passport = List.of(
                "PASSPORT  ·  Specimen",
                "Surname: LIND",
                "Given names: MIA",
                "Date of birth: " + longDay.format(miaBorn),
                "Date of expiry: "
                        + DateTimeFormatter.ofPattern("dd MMM yyyy", Locale.ENGLISH)
                                .format(passportEnds)
                                .toUpperCase(Locale.ROOT),
                "",
                "P<UTOLIND<<MIA<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<",
                machineLine("L898902C3", "UTO", miaBorn, "F", passportEnds));
        UUID miasPassport =
                scan(w, "nora", "Mia's passport", "some", 1, now.minus(40, ChronoUnit.DAYS), passport, "av-mia.jpg");
        share(w, miasPassport, w.member("linds", "alex"), false);
        about(w, miasPassport, mia);

        UUID report = pdf(
                w,
                "nora",
                "Mia's school report",
                "some",
                4,
                now.minus(12, ChronoUnit.DAYS),
                List.of(
                        "School report, first term",
                        "Mia Lind, class 4B",
                        "Reading: reads far above her year, and tells everyone the ending.",
                        "Maths: careful and quick. Swimming on Thursdays: brave.",
                        "Teacher: Ms Novak"));
        share(w, report, w.member("linds", "alex"), false);
        about(w, report, mia);

        UUID car = pdf(
                w,
                "nora",
                "Car registration",
                "some",
                1,
                now.minus(300, ChronoUnit.DAYS),
                List.of(
                        "Vehicle registration certificate",
                        "LJ 27-KNL, estate car, first registered 2019",
                        "Registration valid until "
                                + DateTimeFormatter.ofPattern("dd.MM.yyyy").format(today.plusDays(19))));
        share(w, car, w.member("linds", "alex"), true);

        scan(
                w,
                "nora",
                "Receipt · wardrobe",
                "circle",
                1,
                now.minus(8, ChronoUnit.DAYS),
                List.of(
                        "Pohistvo Jelen d.o.o.",
                        "Receipt 2024-88117",
                        "Wardrobe, oak, 2 doors",
                        "Total €349.00",
                        "Warranty until November " + (year + 2)),
                null);

        // The letter the electricity bill came in. Money's bill of that name links to it ("Invoice, November").
        scan(
                w,
                "nora",
                "Invoice, "
                        + DateTimeFormatter.ofPattern("MMMM", Locale.ENGLISH).format(today),
                "circle",
                1,
                now.minus(9, ChronoUnit.DAYS),
                List.of(
                        "Elektro Ljubljana d.d.",
                        "Invoice for electricity, "
                                + DateTimeFormatter.ofPattern("MMMM yyyy", Locale.ENGLISH)
                                        .format(today),
                        "Customer: Nora Lind",
                        "Amount due €84.20"),
                null);

        UUID manual = pdf(
                w,
                "alex",
                "Boiler manual",
                "circle",
                12,
                now.minus(200, ChronoUnit.DAYS),
                List.of(
                        "Gas boiler: user manual",
                        "If the pressure falls below 1 bar, open the filling tap under the boiler until it reads 1.5.",
                        "Service once a year."));
        w.jdbc()
                .sql("insert into thing_links (from_id, to_id) select p.id, :doc from things p"
                        + " where p.circle_id = :circle and p.kind = 'page' and p.title like 'Wi%Fi and smart home'")
                .param("doc", manual)
                .param("circle", w.circle("linds"))
                .update();

        UUID tax = album(w, "nora", "Tax " + (year - 1), "", "me", null, true, null);
        List<UUID> taxFiles = new ArrayList<>();
        for (String name : List.of("Income statement", "Donations", "Tax return")) {
            taxFiles.add(pdf(
                    w,
                    "nora",
                    name + " " + (year - 1),
                    "me",
                    2,
                    now.minus(150, ChronoUnit.DAYS),
                    List.of(name + " for " + (year - 1), "Nora Lind, tax number 4471 0092")));
        }
        put(w, tax, taxFiles, w.member("linds", "nora"));

        // Alex added two today: his passport for Nora to have, and Grandma's recipe for everyone.
        LocalDate alexBorn = LocalDate.of(year - 38, 5, 9);
        LocalDate alexEnds = today.plusYears(4).plusMonths(4).withDayOfMonth(14);
        UUID alexPassport = pdf(
                w,
                "alex",
                "Passport scan, Alex",
                "some",
                2,
                now.minus(9, ChronoUnit.DAYS),
                List.of(
                        "PASSPORT",
                        "Surname: STRAND",
                        "Given names: ALEX",
                        "Date of expiry: " + longDay.format(alexEnds),
                        "",
                        "P<UTOSTRAND<<ALEX<<<<<<<<<<<<<<<<<<<<<<<<<<<",
                        machineLine("K417705B2", "UTO", alexBorn, "M", alexEnds)));
        share(w, alexPassport, w.member("linds", "nora"), false);

        UUID cookies = w.photo("alex", "cookies.jpg");
        if (cookies != null) {
            document(
                    w,
                    "alex",
                    "Grandma's cookies",
                    "circle",
                    cookies,
                    1,
                    now.minus(3, ChronoUnit.HOURS),
                    String.join(
                            "\n",
                            List.of(
                                    "Grandma Astrid's cookies",
                                    "Ingredients: 250 g butter, 200 g sugar, 2 eggs, 400 g flour, a pinch of salt,",
                                    "and twice the chocolate you think you need.",
                                    "Bake at 180 degrees for 11 minutes. They should still look a little underdone.")));
        }
    }

    /** The first day of the latest such month that has begun before this month. */
    private static LocalDate last(Month month, LocalDate today) {
        LocalDate first = LocalDate.of(today.getYear(), month, 1);
        return first.isBefore(today.withDayOfMonth(1)) ? first : first.minusYears(1);
    }

    // ---------- photos and videos ----------

    /** A photo. {@code forChild} is a child whose tablet it came from: it is then added for them, under the adult. */
    private UUID shot(
            SeedWorld w,
            String owner,
            String forChild,
            String file,
            LocalDateTime taken,
            Spot spot,
            String title,
            Instant added) {
        UUID picture = w.photo(owner, file);
        if (picture == null) {
            return null;
        }
        return item(w, owner, forChild, ThingKind.PHOTO, picture, null, taken, spot, title, "circle", added);
    }

    /** A video: two seconds of a sample clip, with one of the screens' photos as its still. */
    private UUID video(
            SeedWorld w, String owner, String still, LocalDateTime taken, Spot spot, int seconds, Instant added) {
        UUID poster = w.photo(owner, still);
        byte[] clip;
        try (InputStream in = new ClassPathResource("seed/clip.mp4").getInputStream()) {
            clip = in.readAllBytes();
        } catch (IOException e) {
            log.warn("The sample clip isn't there; carrying on without the videos.");
            return null;
        }
        UUID file = stored(w, owner, MediaKind.VIDEO, "videos", "clip.mp4", "video/mp4", clip, seconds);
        return file == null
                ? null
                : item(w, owner, null, ThingKind.VIDEO, file, poster, taken, spot, "", "circle", added);
    }

    private UUID item(
            SeedWorld w,
            String owner,
            String forChild,
            ThingKind kind,
            UUID file,
            UUID poster,
            LocalDateTime taken,
            Spot spot,
            String title,
            String audience,
            Instant added) {
        counter++;
        Instant takenAt = taken.atZone(spot == null ? HOME_TIME : spot.zone()).toInstant();
        // What isn't said to have arrived lately arrived the evening it was taken, and never within the last
        // week: only what the screens call new is new.
        Instant longAgo = Instant.now().minus(10, ChronoUnit.DAYS);
        Instant thatDay = takenAt.plus(6, ChronoUnit.HOURS);
        Instant addedAt = added != null ? added : thatDay.isBefore(longAgo) ? thatDay : longAgo;
        UUID id = UUID.randomUUID();
        JdbcClient jdbc = w.jdbc();
        jdbc.sql("""
                        insert into things (id, circle_id, owner_id, kind, place, title, audience, created_at, updated_at)
                        values (:id, :circle, :owner, :kind, 'library', :title, :audience, :at, :at)
                        """)
                .param("id", id)
                .param("circle", w.circle("linds"))
                .param("owner", w.member("linds", owner))
                .param("kind", kind.code())
                .param("title", title)
                .param("audience", audience)
                .param("at", Timestamp.from(addedAt))
                .update();
        // A little apart each time, as a phone's fix is: still the same place.
        double nudge = (counter % 7 - 3) * 0.0006;
        jdbc.sql("""
                        insert into library_items (thing_id, circle_id, kind, media_id, poster_media_id, added_by, taken_at,
                          taken_local, day, lat, lng, place_name, country, created_at)
                        values (:id, :circle, :kind, :media, :poster, :by, :takenAt, cast(:takenLocal as timestamp), :day,
                          :lat, :lng, :place, :country, :at)
                        """)
                .param("id", id)
                .param("circle", w.circle("linds"))
                .param("kind", kind.code())
                .param("media", file)
                .param("poster", poster)
                .param("by", forChild == null ? null : w.member("linds", forChild))
                .param("takenAt", Timestamp.from(takenAt))
                .param("takenLocal", taken)
                .param("day", Moments.dayOf(taken))
                .param("lat", spot == null ? null : spot.lat() + nudge, java.sql.Types.DOUBLE)
                .param("lng", spot == null ? null : spot.lng() - nudge, java.sql.Types.DOUBLE)
                .param("place", spot == null ? null : spot.name())
                .param("country", spot == null ? null : spot.country())
                .param("at", Timestamp.from(addedAt))
                .update();
        return id;
    }

    /** A file the sample data brings itself, stored as this person's finished upload. */
    private UUID stored(
            SeedWorld w,
            String owner,
            MediaKind kind,
            String folder,
            String name,
            String type,
            byte[] bytes,
            Integer seconds) {
        UUID id = UUID.randomUUID();
        String key = folder + "/seed/" + id + "-" + name;
        try {
            storage.put(key, bytes, type);
        } catch (IOException | RuntimeException e) {
            log.warn("Sample file {} couldn't be stored: {}", name, e.toString());
            return null;
        }
        media.insert(id, w.user(owner), kind, type, name, key, seconds);
        media.fileReady(id, bytes.length);
        return id;
    }

    // ---------- documents ----------

    private UUID pdf(
            SeedWorld w, String owner, String title, String audience, int pages, Instant added, List<String> lines) {
        UUID file = stored(
                w,
                owner,
                MediaKind.FILE,
                "files",
                fileName(title) + ".pdf",
                "application/pdf",
                Paper.pdf(lines, pages),
                null);
        return file == null ? null : document(w, owner, title, audience, file, pages, added, String.join("\n", lines));
    }

    private UUID scan(
            SeedWorld w,
            String owner,
            String title,
            String audience,
            int pages,
            Instant added,
            List<String> lines,
            String face) {
        byte[] picture = Paper.scan(lines, face == null ? null : images.resolve(face));
        UUID file = stored(w, owner, MediaKind.FILE, "files", fileName(title) + ".jpg", "image/jpeg", picture, null);
        return file == null ? null : document(w, owner, title, audience, file, pages, added, String.join("\n", lines));
    }

    private static String fileName(String title) {
        return title.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", "-").replaceAll("^-|-$", "");
    }

    /** A document, read by the same rules as one the phone sends. */
    private UUID document(
            SeedWorld w,
            String owner,
            String title,
            String audience,
            UUID file,
            int pages,
            Instant added,
            String text) {
        UUID id = item(
                w,
                owner,
                null,
                ThingKind.DOCUMENT,
                file,
                null,
                LocalDateTime.ofInstant(added, HOME_TIME)
                        .with(LocalTime.of(9, 0))
                        .plusMinutes(counter),
                null,
                title,
                audience,
                added);
        LocalDate today = LocalDate.now(HOME_TIME);
        Reading reading = DocumentReader.read(text, today);
        FoundDate key = reading.key(today);
        documents.insert(
                id,
                text,
                pages,
                DocumentReader.category(title, text, reading.mrz() != null),
                key == null ? null : key.date(),
                key == null ? null : key.label(),
                reading.amount() == null ? null : reading.amount().cents(),
                reading.amount() == null ? null : reading.amount().currency());
        return id;
    }

    /** The second machine-readable line of a passport, with the check digits a real one carries. */
    static String machineLine(String number, String nationality, LocalDate born, String sex, LocalDate expires) {
        DateTimeFormatter six = DateTimeFormatter.ofPattern("yyMMdd");
        String bornOn = six.format(born);
        String expiresOn = six.format(expires);
        String line =
                number + DocumentReader.checkDigit(number) + nationality + bornOn + DocumentReader.checkDigit(bornOn)
                        + sex + expiresOn + DocumentReader.checkDigit(expiresOn) + "<<<<<<<<<<<<<<" + "0";
        return line
                + DocumentReader.checkDigit(line.substring(0, 10) + line.substring(13, 20) + line.substring(21, 43));
    }

    // ---------- albums, tags, hearts ----------

    private UUID album(
            SeedWorld w,
            String owner,
            String title,
            String note,
            String audience,
            UUID person,
            boolean folder,
            UUID cover) {
        UUID id = UUID.randomUUID();
        w.jdbc()
                .sql("""
                        insert into things (id, circle_id, owner_id, kind, place, title, audience)
                        values (:id, :circle, :owner, 'album', 'library', :title, :audience)
                        """)
                .param("id", id)
                .param("circle", w.circle("linds"))
                .param("owner", w.member("linds", owner))
                .param("title", title)
                .param("audience", audience)
                .update();
        w.jdbc()
                .sql("""
                        insert into albums (thing_id, note, origin, person_id, folder, cover_item_id)
                        values (:id, :note, :origin, :person, :folder, :cover)
                        """)
                .param("id", id)
                .param("note", note)
                .param("origin", person == null ? "hand" : "person")
                .param("person", person)
                .param("folder", folder)
                .param("cover", cover)
                .update();
        return id;
    }

    private static void put(SeedWorld w, UUID album, List<UUID> items, UUID by) {
        for (UUID item : items) {
            if (item != null) {
                w.jdbc()
                        .sql("insert into album_items (album_id, item_id, added_by, added_at)"
                                + " values (:album, :item, :by, now() - interval '30 days')")
                        .param("album", album)
                        .param("item", item)
                        .param("by", by)
                        .update();
            }
        }
    }

    private static void about(SeedWorld w, UUID thing, UUID member) {
        if (thing != null) {
            w.jdbc()
                    .sql("insert into thing_about (thing_id, member_id) values (:thing, :member)")
                    .param("thing", thing)
                    .param("member", member)
                    .update();
        }
    }

    private static void share(SeedWorld w, UUID thing, UUID member, boolean canEdit) {
        if (thing != null) {
            w.jdbc()
                    .sql("insert into thing_shares (thing_id, member_id, can_edit) values (:thing, :member, :edit)")
                    .param("thing", thing)
                    .param("member", member)
                    .param("edit", canEdit)
                    .update();
        }
    }

    private static void love(SeedWorld w, UUID thing, UUID member) {
        if (thing != null) {
            w.jdbc()
                    .sql("insert into library_loves (thing_id, member_id) values (:thing, :member)")
                    .param("thing", thing)
                    .param("member", member)
                    .update();
        }
    }

    private static void comment(SeedWorld w, UUID thing, UUID member, String body, Instant at) {
        if (thing != null) {
            w.jdbc()
                    .sql("insert into library_comments (id, thing_id, member_id, body, created_at)"
                            + " values (:id, :thing, :member, :body, :at)")
                    .param("id", UUID.randomUUID())
                    .param("thing", thing)
                    .param("member", member)
                    .param("body", body)
                    .param("at", Timestamp.from(at))
                    .update();
        }
    }

    /** Sample documents as files: a page of text as a PDF, or as the picture a phone's scanner would make. */
    static final class Paper {

        private Paper() {}

        /** A small, plain PDF: these lines on the first page, and as many pages as asked for. */
        static byte[] pdf(List<String> lines, int pages) {
            List<String> objects = new ArrayList<>();
            StringBuilder kids = new StringBuilder();
            for (int page = 0; page < pages; page++) {
                kids.append(4 + 2 * page).append(" 0 R ");
            }
            objects.add("<< /Type /Catalog /Pages 2 0 R >>");
            objects.add("<< /Type /Pages /Kids [" + kids.toString().trim() + "] /Count " + pages + " >>");
            objects.add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
            for (int page = 0; page < pages; page++) {
                StringBuilder text = new StringBuilder("BT /F1 12 Tf 56 780 Td 18 TL\n");
                List<String> shown = page == 0 ? lines : List.of("Page " + (page + 1));
                for (String line : shown) {
                    text.append('(')
                            .append(ascii(line)
                                    .replace("\\", "\\\\")
                                    .replace("(", "\\(")
                                    .replace(")", "\\)"))
                            .append(") Tj T*\n");
                }
                text.append("ET");
                objects.add("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents " + (5 + 2 * page)
                        + " 0 R /Resources << /Font << /F1 3 0 R >> >> >>");
                objects.add("<< /Length " + text.length() + " >>\nstream\n" + text + "\nendstream");
            }
            StringBuilder out = new StringBuilder("%PDF-1.4\n");
            List<Integer> starts = new ArrayList<>();
            for (int n = 0; n < objects.size(); n++) {
                starts.add(out.length());
                out.append(n + 1).append(" 0 obj\n").append(objects.get(n)).append("\nendobj\n");
            }
            int table = out.length();
            out.append("xref\n0 ").append(objects.size() + 1).append("\n0000000000 65535 f \n");
            for (int start : starts) {
                out.append("%010d 00000 n \n".formatted(start));
            }
            out.append("trailer\n<< /Size ")
                    .append(objects.size() + 1)
                    .append(" /Root 1 0 R >>\nstartxref\n")
                    .append(table)
                    .append("\n%%EOF\n");
            return out.toString().getBytes(StandardCharsets.US_ASCII);
        }

        /** The plain letters a simple PDF can show. */
        private static String ascii(String line) {
            return line.replace("€", "EUR ").replace("·", "-").replaceAll("[^\\x20-\\x7e]", "?");
        }

        /** A sheet of paper with these lines on it, and a small portrait when there is one, as a JPEG. */
        static byte[] scan(List<String> lines, Path face) {
            BufferedImage page = new BufferedImage(900, 620, BufferedImage.TYPE_INT_RGB);
            Graphics2D g = page.createGraphics();
            try {
                g.setColor(new Color(0xf6, 0xf3, 0xec));
                g.fillRect(0, 0, page.getWidth(), page.getHeight());
                g.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
                int left = 48;
                if (face != null) {
                    try {
                        BufferedImage portrait = ImageIO.read(face.toFile());
                        if (portrait != null) {
                            g.drawImage(portrait, 48, 96, 170, 210, null);
                            left = 250;
                        }
                    } catch (IOException noPortrait) {
                        // The page is fine without it.
                    }
                }
                g.setColor(new Color(0x2b, 0x2b, 0x2b));
                int y = 64;
                for (int n = 0; n < lines.size(); n++) {
                    String line = lines.get(n);
                    boolean machine = line.contains("<<");
                    g.setFont(new Font(
                            machine ? Font.MONOSPACED : Font.SANS_SERIF,
                            n == 0 ? Font.BOLD : Font.PLAIN,
                            machine ? 22 : n == 0 ? 28 : 22));
                    g.drawString(line, machine || n == 0 ? 48 : left, machine ? Math.max(y, 470) + (n % 2) * 34 : y);
                    y += n == 0 ? 70 : 40;
                }
            } catch (RuntimeException noFonts) {
                // A computer without fonts gives a blank sheet; the words are kept beside it all the same.
            } finally {
                g.dispose();
            }
            try {
                ByteArrayOutputStream bytes = new ByteArrayOutputStream();
                ImageIO.write(page, "jpg", bytes);
                return bytes.toByteArray();
            } catch (IOException e) {
                throw new java.io.UncheckedIOException(e);
            }
        }
    }
}

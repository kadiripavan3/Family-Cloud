package app.homeport.api.journey;

import app.homeport.api.folder.FolderService;
import app.homeport.api.folder.FolderService.FolderResponse;
import app.homeport.api.journey.GoodnightService.NewGoodnight;
import app.homeport.api.journey.JourneyJobs.Progress;
import app.homeport.api.journey.JourneyPort.StoryRemark;
import app.homeport.api.journey.KeepService.KeepRequest;
import app.homeport.api.journey.KeepService.KeptResponse;
import app.homeport.api.journey.LocalJourney.Doc;
import app.homeport.api.journey.LocalJourney.DocEntry;
import app.homeport.api.journey.LocalJourney.DocShot;
import app.homeport.api.journey.LocalJourney.Drawn;
import app.homeport.api.journey.TripService.TripChange;
import app.homeport.api.library.AlbumService;
import app.homeport.api.library.AlbumService.AlbumChange;
import app.homeport.api.library.LibraryForJourney;
import app.homeport.api.library.LibraryService;
import app.homeport.api.library.LibraryService.NewItem;
import app.homeport.api.list.ChecklistService;
import app.homeport.api.media.MediaKind;
import app.homeport.api.media.MediaStorage;
import app.homeport.api.media.MediaStore;
import app.homeport.api.page.BlockKind;
import app.homeport.api.page.BlockService;
import app.homeport.api.page.BlockService.NewBlock;
import app.homeport.api.page.PageService;
import app.homeport.api.page.PageService.NewPage;
import app.homeport.api.seed.SeedWorld;
import app.homeport.api.seed.Seeder;
import app.homeport.api.thing.Audience;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.MonthDay;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/**
 * The Linds and Journey, as the screens draw them. In the stand-in for Journey: Nora's "Iceland ring road"
 * (told with Alex in April, finished), a trip across Java two years ago, Alex away on "Lofoten by bike" on
 * day 6 of 9, and the family's 10K challenge. At home: Iceland and Java kept (the book in Trips, the photos
 * in the Library, by the same code that keeps a journey for anyone), a goodnight from Alex waiting for
 * tonight, and "Norway 2027" as a trip with its plan, its packing list, its budget and its dates.
 *
 * <p>The sample journeys carry a believable part of their photos. Where a screen draws a number that is only
 * a number (62 entries, 214 photos, 58 followers), the stand-in states that number ({@link Drawn}); what is
 * worked out here (how many photos were in the Library already) is worked out for real, from what is there.
 */
@Component
@ConditionalOnProperty(name = "homeport.seed.enabled", havingValue = "true")
class JourneySeed implements Seeder {

    private static final Logger log = LoggerFactory.getLogger(JourneySeed.class);
    private static final ZoneId HOME_TIME = SeedWorld.HOME;
    private static final Progress QUIETLY = new Progress() {
        @Override
        public void step(String words, int done, int total) {}

        @Override
        public void about(UUID subjectId) {}
    };

    /** A stop on the way: a place with its point. */
    private record Stop(String name, double lat, double lng) {}

    /** One day of a sample journey: who wrote it, where, its words, and its photos by file name ("!" in front: not on Nora's phone). */
    private record Told(int day, String by, Stop at, String title, String words, String... photos) {}

    private final ObjectProvider<LocalJourney> standIn;
    private final KeepService keeps;
    private final LibraryService library;
    private final LibraryForJourney shelf;
    private final AlbumService albums;
    private final HomeSettings homes;
    private final GoodnightService goodnights;
    private final AtHomeService atHome;
    private final TripService trips;
    private final PageService pages;
    private final BlockService blocks;
    private final ChecklistService lists;
    private final FolderService folders;
    private final MediaStore media;
    private final MediaStorage storage;
    private final Path images;

    JourneySeed(
            ObjectProvider<LocalJourney> standIn,
            KeepService keeps,
            LibraryService library,
            LibraryForJourney shelf,
            AlbumService albums,
            HomeSettings homes,
            GoodnightService goodnights,
            AtHomeService atHome,
            TripService trips,
            PageService pages,
            BlockService blocks,
            ChecklistService lists,
            FolderService folders,
            MediaStore media,
            MediaStorage storage,
            @Value("${homeport.seed.images:../../design/hub/img}") String images) {
        this.standIn = standIn;
        this.keeps = keeps;
        this.library = library;
        this.shelf = shelf;
        this.albums = albums;
        this.homes = homes;
        this.goodnights = goodnights;
        this.atHome = atHome;
        this.trips = trips;
        this.pages = pages;
        this.blocks = blocks;
        this.lists = lists;
        this.folders = folders;
        this.media = media;
        this.storage = storage;
        this.images = Path.of(images).toAbsolutePath().normalize();
    }

    @Override
    public int order() {
        return 80;
    }

    @Override
    public void seed(SeedWorld w) {
        LocalDate today = LocalDate.now(HOME_TIME);
        UUID linds = w.circle("linds");
        // Home is where Thursday's photos were taken, and bedtime is at eight.
        homes.set(linds, 46.0569, 14.5058, 150, LocalTime.of(20, 0), HOME_TIME.getId());
        norway(w, today);

        LocalJourney journey = standIn.getIfAvailable();
        if (journey == null) {
            // The sample people without the stand-in for Journey (it was switched off): the trip is there, nothing of
            // Journey is.
            return;
        }
        journey.join(w.user("nora"), "noralind", 58, 112);
        journey.join(w.user("alex"), "alexstrand", 31, 44);
        iceland(w, journey, today);
        java(w, journey, today);
        UUID lofoten = lofoten(w, journey, today);
        tenK(w, journey, today);
        goodnight(w, today, lofoten);
    }

    // ---------- Iceland ring road: told in April, kept the week after ----------

    private static final Stop REYKJAVIK = new Stop("Reykjavík", 64.1466, -21.9426);

    private void iceland(SeedWorld w, LocalJourney journey, LocalDate today) {
        LocalDate start = today.isAfter(LocalDate.of(today.getYear(), 4, 20))
                ? LocalDate.of(today.getYear(), 4, 1)
                : LocalDate.of(today.getYear() - 1, 4, 1);
        List<Told> story = List.of(
                new Told(
                        1,
                        "nora",
                        REYKJAVIK,
                        "",
                        "Picked up the van, got lost twice before leaving the car park, and ate hot dogs by the"
                                + " harbour in the rain.",
                        "van.jpg",
                        "road.jpg",
                        "fog.jpg",
                        "mugs.jpg",
                        "yellow-house.jpg",
                        "red-door.jpg",
                        "!breakfast.jpg"),
                new Told(
                        2,
                        "nora",
                        new Stop("Skógafoss", 63.5321, -19.5114),
                        "",
                        "A rainbow at the falls and nobody else there until nine.",
                        "waterfall.jpg",
                        "bench.jpg"),
                new Told(
                        3,
                        "nora",
                        new Stop("Vík", 63.4186, -19.0060),
                        "Black sand",
                        "Sideways wind all day. The van rocks at night like a boat.",
                        "sea-cave.jpg"),
                new Told(
                        4,
                        "nora",
                        new Stop("Jökulsárlón", 64.0784, -16.2306),
                        "The ice lagoon",
                        "Ice the size of buses, drifting out to sea. Alex counted seals; I counted the blues.",
                        "lake.jpg",
                        "clip:lake.jpg"),
                new Told(
                        5,
                        "nora",
                        new Stop("Höfn", 64.2539, -15.2082),
                        "",
                        "Langoustine soup, and the first proper shower in three days.",
                        "tea-table.jpg"),
                new Told(
                        6,
                        "nora",
                        new Stop("Seyðisfjörður", 65.2600, -14.0100),
                        "Over the pass",
                        "Up into the fog and down into a town with a blue church at the end of a rainbow street.",
                        "green-door.jpg",
                        "fog.jpg"),
                new Told(
                        7,
                        "nora",
                        new Stop("Mývatn", 65.6039, -16.9961),
                        "",
                        "The lake steams. So did we, in the lagoon, until our fingers wrinkled.",
                        "cabin.jpg"),
                new Told(
                        8,
                        "alex",
                        new Stop("Húsavík", 66.0449, -17.3389),
                        "Whales",
                        "Three humpbacks, and one very seasick me.",
                        "!clip:surf-video.jpg"),
                new Told(
                        9,
                        "nora",
                        new Stop("Akureyri", 65.6835, -18.1105),
                        "A rest day",
                        "Laundry, a bookshop, cinnamon buns. Nobody drove anywhere.",
                        "bed-mug.jpg",
                        "book.jpg"),
                new Told(
                        10,
                        "nora",
                        new Stop("Hvammstangi", 65.3960, -20.9430),
                        "",
                        "Seals on the rocks, and a farm that sells wool by the kilo.",
                        "heart-hands.jpg"),
                new Told(
                        11,
                        "nora",
                        new Stop("Ísafjörður", 66.0750, -23.1240),
                        "The Westfjords",
                        "One road, a hundred fjords, no hurry.",
                        "road.jpg"),
                new Told(
                        12,
                        "alex",
                        new Stop("Stykkishólmur", 65.0750, -22.7300),
                        "Ferry day",
                        "Puffins, finally.",
                        "!picnic.jpg"),
                new Told(
                        13,
                        "nora",
                        new Stop("Þingvellir", 64.2559, -21.1299),
                        "",
                        "We walked between two continents and argued about which side had the better view.",
                        "autumn.jpg"),
                new Told(
                        14, "nora", REYKJAVIK, "", "We drove the whole circle and it still wasn't enough.", "van.jpg"));
        UUID id = tell(
                w,
                journey,
                "Iceland ring road",
                "nora",
                List.of(w.user("alex")),
                JourneyVisibility.PUBLIC,
                JourneyStatus.COMPLETED,
                start,
                null,
                58,
                // The numbers of the recap as the screens draw it.
                new Drawn(14, 62, 214, 9, 11),
                "We drove the whole circle and it still wasn't enough.",
                "waterfall.jpg",
                story,
                true);
        keep(w, id, start.plusDays(19), "kept in April");
    }

    // ---------- two years ago today: sunrise over Bromo ----------

    private void java(SeedWorld w, LocalJourney journey, LocalDate today) {
        // Day 22 was this day, two years ago.
        LocalDate start = today.minusYears(2).minusDays(21);
        List<Told> story = List.of(
                new Told(
                        1,
                        "nora",
                        new Stop("Jakarta", -6.2088, 106.8456),
                        "Landed",
                        "Thirty-one degrees at midnight. The train leaves at six.",
                        "!market.jpg"),
                new Told(
                        9,
                        "nora",
                        new Stop("Yogyakarta", -7.7956, 110.3695),
                        "Batik and bicycles",
                        "A whole day on rented bikes, and a workshop where they let us ruin a piece of cloth.",
                        "!green-door.jpg"),
                new Told(
                        22,
                        "nora",
                        new Stop("Mount Bromo", -7.9425, 112.9530),
                        "Sunrise over Bromo",
                        "Up at three, a jeep in the dark, and then the whole crater turning gold.",
                        "!bromo.jpg"),
                new Told(
                        30,
                        "nora",
                        new Stop("Ubud", -8.5069, 115.2625),
                        "The last terraces",
                        "Green in more shades than we have words for.",
                        "!terraces.jpg"));
        UUID id = tell(
                w,
                journey,
                "Java and Bali by train",
                "nora",
                List.of(),
                JourneyVisibility.PUBLIC,
                JourneyStatus.COMPLETED,
                start,
                null,
                34,
                null,
                "Thirty days, eleven trains.",
                "bromo.jpg",
                story,
                false);
        keep(
                w,
                id,
                start.plusDays(40),
                "kept in "
                        + start.plusDays(40)
                                .getMonth()
                                .getDisplayName(java.time.format.TextStyle.FULL, java.util.Locale.ENGLISH));
    }

    // ---------- Alex is away: Lofoten by bike, day 6 of 9 ----------

    private UUID lofoten(SeedWorld w, LocalJourney journey, LocalDate today) {
        LocalDate start = today.minusDays(5);
        List<Told> story = List.of(
                new Told(
                        1,
                        "alex",
                        new Stop("Bodø", 67.2804, 14.4049),
                        "Off the night train",
                        "Bike in one piece. Ferry at noon.",
                        "!runner.jpg"),
                new Told(
                        2,
                        "alex",
                        new Stop("Å", 67.8792, 12.9820),
                        "The end of the road",
                        "The village is called Å. So is the last letter of the alphabet. Fitting.",
                        "!road.jpg"),
                new Told(
                        4,
                        "alex",
                        new Stop("Hamnøy", 67.9460, 13.1330),
                        "Headwind",
                        "Forty kilometres felt like ninety. Red cabins and cod on racks everywhere.",
                        "!cabin.jpg"),
                new Told(
                        5,
                        "alex",
                        new Stop("Nusfjord", 68.0340, 13.3490),
                        "Rain, then not",
                        "Dried my socks on the handlebars.",
                        "!lake.jpg"),
                new Told(
                        6,
                        "alex",
                        new Stop("Reine", 67.9320, 13.0890),
                        "Ferry day, and finally a rest",
                        "Legs up, coffee, a view I can't describe. Home on Sunday.",
                        "!bike.jpg"));
        UUID id = tell(
                w,
                journey,
                "Lofoten by bike",
                "alex",
                List.of(),
                JourneyVisibility.PUBLIC,
                JourneyStatus.ACTIVE,
                start,
                9,
                23,
                null,
                null,
                null,
                story,
                false);
        // Nora read it the day before yesterday: the last two entries are new to her.
        Doc doc = journey.doc(id).orElseThrow();
        List<DocEntry> entries = new ArrayList<>();
        for (DocEntry entry : doc.entries()) {
            boolean lately = !entry.happenedOn().isBefore(today.minusDays(1));
            entries.add(new DocEntry(
                    entry.id(),
                    entry.authorId(),
                    entry.happenedAt(),
                    entry.happenedOn(),
                    entry.title(),
                    entry.body(),
                    entry.place(),
                    entry.lat(),
                    entry.lng(),
                    entry.shots(),
                    entry.likes(),
                    entry.remarks(),
                    lately ? Instant.now().minusSeconds(3600) : Instant.now().minusSeconds(3 * 86_400)));
        }
        journey.start(new Doc(
                doc.id(),
                doc.ownerId(),
                doc.title(),
                doc.visibility(),
                doc.status(),
                doc.startDate(),
                doc.targetDays(),
                doc.closingNote(),
                doc.authors(),
                doc.followers(),
                Map.of(w.user("nora").toString(), Instant.now().minusSeconds(2 * 86_400)),
                doc.drawn(),
                doc.ref(),
                doc.cover(),
                entries));
        // Mia loved the latest one: a heart given at home, by her mum for her.
        atHome.away(w.circle("linds"), w.user("nora")).stream()
                .filter(away -> away.journey().id().equals(id))
                .findFirst()
                .ifPresent(away -> atHome.love(
                        w.circle("linds"), w.user("nora"), away.latest().entryId(), w.member("linds", "mia"), true));
        return id;
    }

    // ---------- the family's challenge, which the goal in Plan follows ----------

    private void tenK(SeedWorld w, LocalJourney journey, LocalDate today) {
        LocalDate start = today.minusDays(11);
        List<DocEntry> ticked = new ArrayList<>();
        String[] said = {
            "A slow loop round the park.", "Hill repeats. Leo won.", "Rain. We went anyway.", "Mia set the pace."
        };
        for (int day = 0; day < 12; day++) {
            Instant at = start.plusDays(day).atTime(18, 0).atZone(HOME_TIME).toInstant();
            ticked.add(new DocEntry(
                    UUID.randomUUID(),
                    w.user(day % 3 == 2 ? "alex" : "nora"),
                    at,
                    start.plusDays(day),
                    "",
                    said[day % said.length],
                    null,
                    null,
                    null,
                    List.of(),
                    0,
                    List.of(),
                    at));
        }
        journey.start(new Doc(
                UUID.randomUUID(),
                w.user("nora"),
                "Family 10K",
                // The two of them tick it; nobody else is shown it, in Journey or at home.
                JourneyVisibility.PRIVATE,
                JourneyStatus.ACTIVE,
                start,
                30,
                null,
                List.of(w.user("alex")),
                4,
                Map.of(),
                null,
                // What the goal "Family 10K" in Plan names as the place it reads its number from.
                "family-10k",
                null,
                ticked));
    }

    // ---------- a goodnight, waiting for tonight ----------

    private void goodnight(SeedWorld w, LocalDate today, UUID lofoten) {
        UUID alex = w.user("alex");
        byte[] clip;
        try (InputStream in = new ClassPathResource("seed/clip.mp4").getInputStream()) {
            clip = in.readAllBytes();
        } catch (IOException e) {
            log.warn("The sample clip isn't there; carrying on without the goodnight.");
            return;
        }
        UUID file = stored(alex, clip, 48);
        UUID still = w.photo("alex", "fog.jpg");
        if (file == null) {
            return;
        }
        UUID id = goodnights
                .create(
                        alex,
                        new NewGoodnight(
                                UUID.randomUUID(),
                                w.circle("linds"),
                                file,
                                still,
                                "Goodnight, you two",
                                today.atTime(19, 10)
                                        .atZone(ZoneId.of("Europe/Oslo"))
                                        .toOffsetDateTime(),
                                today,
                                "Reine, Norway",
                                "Day 6",
                                lofoten,
                                null))
                .id();
        // Leo loved it. He has no phone: his mum gave the heart for him.
        goodnights.love(id, w.user("nora"), w.member("linds", "leo"), true);
    }

    /** A clip the sample data brings itself, stored as this person's finished upload. */
    private UUID stored(UUID owner, byte[] clip, int seconds) {
        UUID id = UUID.randomUUID();
        String key = "videos/seed/" + id + "-clip.mp4";
        try {
            storage.put(key, clip, "video/mp4");
        } catch (IOException | RuntimeException e) {
            log.warn("The sample clip couldn't be stored: {}", e.toString());
            return null;
        }
        media.insert(id, owner, MediaKind.VIDEO, "video/mp4", "clip.mp4", key, seconds);
        media.fileReady(id, clip.length);
        return id;
    }

    // ---------- Norway 2027: a trip, planned here ----------

    private void norway(SeedWorld w, LocalDate today) {
        UUID nora = w.user("nora");
        UUID linds = w.circle("linds");
        Optional<UUID> folder = find(w, "folder", "Norway 2027");
        if (folder.isEmpty()) {
            return; // Notes' own sample data isn't there
        }
        UUID trip = folder.get();
        LocalDate starts = next(MonthDay.of(4, 3), today);

        UUID dayByDay = pages.create(
                        nora, linds, new NewPage("Day by day", null, Audience.CIRCLE, trip, "🧳"), UUID.randomUUID())
                .id();
        write(dayByDay, nora, words(BlockKind.PARAGRAPH, "14 days sketched · Bergen to Tromsø"));
        Stop[] route = {
            new Stop("Bergen", 60.3913, 5.3221),
            new Stop("Flåm", 60.8628, 7.1138),
            new Stop("Balestrand", 61.2094, 6.5311),
            new Stop("Ålesund", 62.4722, 6.1549),
            new Stop("Trondheim", 63.4305, 10.3951),
            new Stop("Bodø", 67.2804, 14.4049),
            new Stop("Lofoten", 68.2086, 13.9700),
            new Stop("Tromsø", 69.6492, 18.9553)
        };
        String[] plan = {
            "Days 1 and 2: fly in, the fish market, the funicular.",
            "Days 3 and 4: the Bergen railway to Myrdal, then down to the fjord. Kayaks.",
            "Day 5: the ferry, and a day with nothing in it.",
            "Days 6 and 7: the Art Nouveau town, and up the 418 steps.",
            "Day 8: the night train north.",
            "Day 9: the ferry across to the islands.",
            "Days 10 to 12: cabins by the water. Biscuit would love it; he stays with Grandma Astrid.",
            "Days 13 and 14: the cable car, the midnight light, and home."
        };
        for (int n = 0; n < route.length; n++) {
            write(
                    dayByDay,
                    nora,
                    new NewBlock(
                            BlockKind.PLACE,
                            route[n].name(),
                            null,
                            null,
                            null,
                            null,
                            null,
                            route[n].lat(),
                            route[n].lng(),
                            null,
                            null),
                    words(BlockKind.PARAGRAPH, plan[n]));
        }

        // Packing, per person: 61 lines, 22 packed already.
        UUID packing = lists.create(
                        nora,
                        linds,
                        new ChecklistService.NewList(
                                "Packing, per person", Audience.CIRCLE, List.of(), trip, "🧳", null, null),
                        UUID.randomUUID())
                .id();
        String[][] bags = {
            {
                "Everyone",
                "Passports and health cards",
                "Tickets and the ferry booking",
                "Chargers and the big power bank",
                "First-aid kit",
                "Sun cream",
                "Midge spray",
                "The small rucksacks",
                "Water bottles",
                "Card games",
                "Binoculars",
                "Head torches",
                "Swimming things",
                "Travel towels",
                "Snacks for the train",
                "The picnic blanket"
            },
            {
                "Nora",
                "Rain jacket",
                "Wool jumper",
                "Walking boots",
                "Trainers",
                "Wool socks, 5 pairs",
                "Thermal top",
                "Hat and gloves",
                "Camera and the spare battery",
                "Sunglasses",
                "Book",
                "Sleep mask",
                "Wash bag"
            },
            {
                "Alex",
                "Rain jacket",
                "Fleece",
                "Walking boots",
                "Sandals",
                "Wool socks, 5 pairs",
                "Thermal top",
                "Hat and gloves",
                "Bike shorts, in case",
                "Sunglasses",
                "Headphones",
                "Wash bag",
                "The good knife"
            },
            {
                "Mia",
                "Rain jacket",
                "Wool jumper",
                "Walking boots",
                "Trainers",
                "Wool socks, 5 pairs",
                "Thermals",
                "Hat and gloves",
                "Sketchbook and pencils",
                "Sunglasses",
                "Her rabbit",
                "Wash bag"
            },
            {
                "Leo",
                "Rain jacket",
                "Fleece",
                "Wellies",
                "Trainers",
                "Wool socks, 5 pairs",
                "Thermals",
                "Hat and gloves",
                "Dinosaur cards",
                "Sunglasses",
                "Bear",
                "Wash bag"
            }
        };
        int line = 0;
        for (String[] bag : bags) {
            for (int n = 1; n < bag.length; n++) {
                UUID item = lists.add(
                                packing,
                                nora,
                                new ChecklistService.NewItem(bag[n], null, bag[0], null, null),
                                UUID.randomUUID())
                        .id();
                // The first few of each bag are in the suitcase already: 22 in all.
                if (n <= (line % 5 == 0 ? 6 : 4)) {
                    lists.change(
                            item,
                            nora,
                            new ChecklistService.ItemChange(
                                    null, null, null, null, null, null, null, true, null, null));
                }
            }
            line++;
        }

        UUID budget = find(w, "sheet", "Norway budget").orElse(null);
        if (budget != null) {
            folders.file(budget, nora, trip, null, false);
        }

        UUID passports = pages.create(
                        nora, linds, new NewPage("Passports", null, Audience.CIRCLE, trip, ""), UUID.randomUUID())
                .id();
        write(passports, nora, words(BlockKind.PARAGRAPH, "Mia's needs renewing first"));
        write(
                passports,
                nora,
                words(
                        BlockKind.PARAGRAPH,
                        "It runs out before we are back plus six months, and Norway asks for three. The form is in"
                                + " the Library; the photo booth at the station does the right size."));
        find(w, "document", "Mia's passport")
                .ifPresent(scan -> write(
                        passports,
                        nora,
                        new NewBlock(BlockKind.LIVE, null, null, null, null, scan, null, null, null, null, null)));
        // What was there before goes after the four the screen draws.
        find(w, "page", "What to bring to Norway").ifPresent(page -> folders.file(page, nora, trip, passports, false));

        trips.save(trip, nora, new TripChange(starts, starts.plusDays(14), budget), today);
        // Sample data only: the plan was written last week. Notes' "lately" and the search keep the order their
        // screens draw, with "What to bring to Norway" (three days ago) in front of these.
        written(w, dayByDay, "6 days");
        written(w, packing, "5 days");
        written(w, passports, "4 days");
    }

    private static void written(SeedWorld w, UUID thing, String ago) {
        JdbcClient jdbc = w.jdbc();
        jdbc.sql(
                        "update things set created_at = now() - cast(:ago as interval), updated_at = now() - cast(:ago as interval) where id = :id")
                .param("id", thing)
                .param("ago", ago)
                .update();
        jdbc.sql("update pages set edited_at = now() - cast(:ago as interval) where thing_id = :id")
                .param("id", thing)
                .param("ago", ago)
                .update();
        jdbc.sql("update checklists set edited_at = now() - cast(:ago as interval) where thing_id = :id")
                .param("id", thing)
                .param("ago", ago)
                .update();
    }

    private void write(UUID page, UUID me, NewBlock... written) {
        for (NewBlock block : written) {
            blocks.add(page, me, block, UUID.randomUUID());
        }
    }

    private static NewBlock words(BlockKind kind, String text) {
        return new NewBlock(kind, text, null, null, null, null, null, null, null, null, null);
    }

    private static LocalDate next(MonthDay day, LocalDate today) {
        LocalDate thisYear = day.atYear(today.getYear());
        return thisYear.isAfter(today) ? thisYear : day.atYear(today.getYear() + 1);
    }

    /** Something another place's sample data made for The Linds, by its kind and title, as Nora may see it. */
    private static Optional<UUID> find(SeedWorld w, String kind, String title) {
        return w.jdbc()
                .sql(
                        "select id from things where circle_id = :circle and kind = :kind and title = :title order by created_at limit 1")
                .param("circle", w.circle("linds"))
                .param("kind", kind)
                .param("title", title)
                .query(UUID.class)
                .optional();
    }

    // ---------- telling a sample journey, and keeping it ----------

    /**
     * Puts a journey into the stand-in, the way it would have been told from the road. A photo that is on
     * Nora's phone (no "!" in front) is also put into her Library first, as the original her phone backed up:
     * taken at the same moment, so keeping the journey finds it.
     */
    private UUID tell(
            SeedWorld w,
            LocalJourney journey,
            String title,
            String owner,
            List<UUID> authors,
            JourneyVisibility visibility,
            JourneyStatus status,
            LocalDate start,
            Integer targetDays,
            int followers,
            Drawn drawn,
            String closingNote,
            String coverFile,
            List<Told> story,
            boolean originalsAtHome) {
        List<DocEntry> entries = new ArrayList<>();
        UUID cover = null;
        for (Told told : story) {
            LocalDate day = start.plusDays(told.day() - 1);
            List<DocShot> shots = new ArrayList<>();
            for (int n = 0; n < told.photos().length; n++) {
                String name = told.photos()[n];
                boolean onNorasPhone = originalsAtHome && !name.startsWith("!");
                name = name.startsWith("!") ? name.substring(1) : name;
                boolean clip = name.startsWith("clip:");
                String file = clip ? name.substring(5) : name;
                // Iceland keeps the clock London does; the other journeys are told in round hours anyway.
                Instant taken = day.atTime(9, 12).plusMinutes(47L * n).toInstant(ZoneOffset.UTC);
                byte[] picture = picture(file);
                if (picture == null) {
                    continue;
                }
                DocShot shot = clip ? clip(journey, picture, taken) : journey.photo(picture, taken, null);
                if (shot == null) {
                    continue;
                }
                shots.add(shot);
                if (file.equals(coverFile) && !clip && cover == null) {
                    cover = shot.id();
                }
                if (onNorasPhone) {
                    original(w, file, clip, taken, told.at());
                }
            }
            Instant at = day.atTime(20, 30).toInstant(ZoneOffset.UTC);
            entries.add(new DocEntry(
                    UUID.randomUUID(),
                    w.user(told.by()),
                    at,
                    day,
                    told.title(),
                    told.words(),
                    told.at().name(),
                    told.at().lat(),
                    told.at().lng(),
                    shots,
                    told.day() % 4 == 2 ? 24 : 9,
                    told.day() == 2
                            ? List.of(new StoryRemark("Lea", "Nobody there until nine? Teach me your ways."))
                            : List.of(),
                    at));
        }
        UUID id = UUID.randomUUID();
        journey.start(new Doc(
                id,
                w.user(owner),
                title,
                visibility,
                status,
                start,
                targetDays,
                closingNote,
                authors,
                followers,
                Map.of(),
                drawn,
                null,
                cover,
                entries));
        return id;
    }

    private byte[] picture(String file) {
        Path path = images.resolve(file);
        try {
            return Files.isRegularFile(path) ? Files.readAllBytes(path) : null;
        } catch (IOException e) {
            log.warn("Sample photo {} couldn't be read; carrying on without it.", path);
            return null;
        }
    }

    private DocShot clip(LocalJourney journey, byte[] still, Instant taken) {
        try (InputStream in = new ClassPathResource("seed/clip.mp4").getInputStream()) {
            return journey.clip(in.readAllBytes(), still, 14, taken, null);
        } catch (IOException e) {
            return null;
        }
    }

    /** The original of a photo or clip, in Nora's Library, as her phone backed it up on the day. */
    private void original(SeedWorld w, String file, boolean clip, Instant taken, Stop at) {
        UUID nora = w.user("nora");
        UUID still = w.photo("nora", file);
        UUID mediaId = still;
        if (clip) {
            try (InputStream in = new ClassPathResource("seed/clip.mp4").getInputStream()) {
                mediaId = stored(nora, in.readAllBytes(), 14);
            } catch (IOException e) {
                return;
            }
        }
        if (mediaId == null) {
            return;
        }
        library.add(
                nora,
                w.circle("linds"),
                List.of(new NewItem(
                        UUID.randomUUID(),
                        mediaId,
                        null,
                        null,
                        taken.atOffset(ZoneOffset.UTC),
                        at.lat(),
                        at.lng(),
                        at.name(),
                        "Iceland",
                        clip ? still : null,
                        null,
                        null,
                        Audience.CIRCLE,
                        null,
                        null,
                        null,
                        null)));
    }

    /**
     * Keeps a sample journey for Nora in The Linds, with everything switched on, by the code that keeps one
     * for anyone. Then it is made to look as old as it is: kept back then, not this minute.
     */
    private void keep(SeedWorld w, UUID journeyId, LocalDate keptOn, String note) {
        UUID nora = w.user("nora");
        UUID linds = w.circle("linds");
        UUID tripsSpace = folders.spaces(linds, nora).stream()
                .filter(space -> space.title().equals("Trips"))
                .map(FolderResponse::id)
                .findFirst()
                .orElse(null);
        UUID keptId = keeps.run(
                new Caller(nora, null),
                new KeepRequest(
                        UUID.randomUUID(), linds, journeyId, true, true, true, true, tripsSpace, Audience.CIRCLE, null),
                QUIETLY);
        KeptResponse kept = keeps.get(keptId, nora);
        Timestamp then = Timestamp.from(keptOn.atTime(21, 0).atZone(HOME_TIME).toInstant());
        JdbcClient jdbc = w.jdbc();
        List<UUID> aged = new ArrayList<>();
        if (kept.albumId() != null) {
            albums.change(kept.albumId(), nora, new AlbumChange(null, note, null, null));
            aged.add(kept.albumId());
            shelf.ofAlbum(kept.albumId(), nora).items().forEach(item -> aged.add(item.id()));
        }
        if (kept.pageId() != null) {
            aged.add(kept.pageId());
            jdbc.sql("update pages set edited_at = :at where thing_id = :id")
                    .param("at", then)
                    .param("id", kept.pageId())
                    .update();
        }
        jdbc.sql("update kept_journeys set kept_at = :at, synced_at = :at where id = :id")
                .param("at", then)
                .param("id", keptId)
                .update();
        if (aged.isEmpty()) {
            return;
        }
        // Sample data only: nothing here arrived today, so nothing here is "new" on anybody's Today.
        jdbc.sql("update things set created_at = least(created_at, :at), updated_at = :at where id in (:ids)")
                .param("at", then)
                .param("ids", aged)
                .update();
        jdbc.sql("update library_items set created_at = :at where thing_id in (:ids)")
                .param("at", then)
                .param("ids", aged)
                .update();
    }
}

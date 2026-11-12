package app.homeport.api.notes;

import app.homeport.api.folder.FolderService;
import app.homeport.api.folder.FolderService.FolderResponse;
import app.homeport.api.list.ChecklistService;
import app.homeport.api.list.ChecklistService.ChecklistResponse;
import app.homeport.api.list.ChecklistService.ItemChange;
import app.homeport.api.list.ChecklistService.ItemResponse;
import app.homeport.api.list.ChecklistService.NewItem;
import app.homeport.api.list.ChecklistService.NewList;
import app.homeport.api.list.Repeats;
import app.homeport.api.page.BlockKind;
import app.homeport.api.page.BlockService;
import app.homeport.api.page.BlockService.BlockResponse;
import app.homeport.api.page.BlockService.NewBlock;
import app.homeport.api.page.Mark;
import app.homeport.api.page.MarkKind;
import app.homeport.api.page.PageService;
import app.homeport.api.page.PageService.NewPage;
import app.homeport.api.seed.SeedWorld;
import app.homeport.api.seed.Seeder;
import app.homeport.api.thing.Audience;
import app.homeport.api.thing.ThingService;
import app.homeport.api.thing.ThingService.AudienceChange;
import app.homeport.api.thing.ThingService.Hidden;
import app.homeport.api.thing.ThingStore;
import java.time.LocalDate;
import java.time.MonthDay;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/**
 * The notes of the screens. The Linds: Home, Kids and Trips with their folders, the Wi‑Fi page as it is drawn,
 * Mia's birthday plan hidden from Mia, the shopping list Alex is ticking in the shop. The other three circles:
 * their starter spaces with a page or two each.
 *
 * <p>Everything is made the way the app makes it, by the sample people through the same services, so the
 * sample data can't hold anything the API wouldn't. The pages the first seeder made by name are filed here
 * and given their blocks. It runs late so that a page can show what other places have made by then (the
 * Wi‑Fi login, the party's budget): a live block is added when the thing it shows is there, and left out
 * when it isn't.
 */
@Component
@ConditionalOnProperty(name = "homeport.seed.enabled", havingValue = "true")
class NotesSeed implements Seeder {

    private final FolderService folders;
    private final PageService pages;
    private final BlockService blocks;
    private final ChecklistService lists;
    private final ThingService things;
    private final ThingStore thingStore;

    NotesSeed(
            FolderService folders,
            PageService pages,
            BlockService blocks,
            ChecklistService lists,
            ThingService things,
            ThingStore thingStore) {
        this.folders = folders;
        this.pages = pages;
        this.blocks = blocks;
        this.lists = lists;
        this.things = things;
        this.thingStore = thingStore;
    }

    @Override
    public int order() {
        return 50;
    }

    @Override
    public void seed(SeedWorld w) {
        linds(w);
        couple(w);
        crew(w);
        flat(w);
        // Nothing here was written this minute: spread it over the last weeks, then say what happened lately.
        settle(w);
        lately(w);
    }

    // ---------- The Linds ----------

    private void linds(SeedWorld w) {
        UUID nora = w.user("nora");
        UUID alex = w.user("alex");
        UUID circle = w.circle("linds");
        UUID mia = w.member("linds", "mia");
        UUID leo = w.member("linds", "leo");
        List<FolderResponse> spaces = folders.spaces(circle, nora);
        UUID home = space(spaces, "Home");
        UUID kids = space(spaces, "Kids");
        UUID trips = space(spaces, "Trips");

        // Home / House manual
        UUID manual = folder(w, "linds", "nora", home, "House manual", Audience.CIRCLE);
        UUID wifi = existing(w, "linds", "Wi‑Fi and smart home");
        folders.file(wifi, nora, manual, null, false);
        clear(w, wifi);
        pages.change(wifi, nora, null, null, "📶");
        live(w, wifi, nora, "linds", "Linds-Home-5G", "Home Wi‑Fi", "Home Wi-Fi");
        write(wifi, nora, words(BlockKind.HEADING, "If the internet drops"));
        BlockResponse drops = blocks.add(
                wifi,
                nora,
                list(
                        "If the internet drops",
                        "Unplug the white box for 10 seconds",
                        "Still nothing? Call Telemach, 080 12 34"),
                null);
        tick(drops.checklist().items().get(0), alex);
        UUID desk = w.photo("nora", "desk.jpg");
        if (desk != null) {
            write(wifi, nora, photo(desk, "Where the router lives"));
        }
        String heating = "The heating app is on the hallway tablet. @Alex knows the boiler code.";
        // Alex wrote the last line: "Edited by Alex".
        blocks.add(
                wifi,
                alex,
                new NewBlock(
                        BlockKind.PARAGRAPH,
                        heating,
                        List.of(new Mark(
                                heating.indexOf("@Alex"),
                                heating.indexOf("@Alex") + 5,
                                MarkKind.MENTION,
                                null,
                                w.member("linds", "alex"))),
                        null,
                        null,
                        null,
                        null,
                        null,
                        null,
                        null,
                        null),
                null);
        page(
                w,
                "linds",
                "nora",
                manual,
                "Bins and recycling days",
                "🗑️",
                Audience.CIRCLE,
                words(BlockKind.BULLET, "Rubbish: Tuesday and Friday evening, out by 20:00"),
                words(BlockKind.BULLET, "Paper and packaging: every other Wednesday"),
                words(BlockKind.BULLET, "Glass: the containers by the bakery"),
                words(BlockKind.PARAGRAPH, "Whoever has the bins on the chore wheel takes them out."));
        UUID appliances = folder(w, "linds", "nora", manual, "Appliances and manuals", Audience.CIRCLE);
        page(
                w,
                "linds",
                "nora",
                appliances,
                "Boiler",
                "",
                Audience.CIRCLE,
                text("Serviced every October. The pressure should read between 1 and 2."));
        page(
                w,
                "linds",
                "nora",
                appliances,
                "Washing machine",
                "",
                Audience.CIRCLE,
                text("Programme 4 for almost everything. Clean the filter when it smells."));
        page(
                w,
                "linds",
                "alex",
                appliances,
                "Dishwasher",
                "",
                Audience.CIRCLE,
                text("Salt and rinse aid are under the sink. The cutlery tray lifts out."));
        page(
                w,
                "linds",
                "alex",
                appliances,
                "Oven",
                "",
                Audience.CIRCLE,
                text("The fan setting runs hot: take 20° off what the recipe says."));

        // Home / Meals and Garden
        UUID meals = folder(w, "linds", "nora", home, "Meals", Audience.CIRCLE);
        UUID recipes = folder(w, "linds", "nora", meals, "Recipes", Audience.CIRCLE);
        UUID cookies = page(
                w,
                "linds",
                "alex",
                recipes,
                "Grandma's cookies",
                "",
                Audience.CIRCLE,
                words(BlockKind.PARAGRAPH, "Grandma Astrid's recipe, the way she says it."),
                words(BlockKind.HEADING, "You need"),
                words(BlockKind.BULLET, "250 g butter, soft"),
                words(BlockKind.BULLET, "200 g sugar, and a spoon of vanilla sugar"),
                words(BlockKind.BULLET, "2 eggs"),
                words(BlockKind.BULLET, "400 g flour, a pinch of salt"),
                words(BlockKind.HEADING, "How"),
                words(
                        BlockKind.PARAGRAPH,
                        "Mix, rest for an hour in the cold, cut out, bake at 180° for 10 minutes. They should stay pale."));
        UUID plate = w.photo("alex", "cookies.jpg");
        if (plate != null) {
            blocks.add(
                    cookies,
                    alex,
                    new NewBlock(
                            BlockKind.PHOTO,
                            "Straight from the oven",
                            null,
                            null,
                            true,
                            null,
                            plate,
                            null,
                            null,
                            null,
                            null),
                    null);
        }
        page(
                w,
                "linds",
                "nora",
                recipes,
                "Sunday pancakes",
                "",
                Audience.CIRCLE,
                text("Three eggs, 300 ml milk, 150 g flour. Leo flips."));
        page(
                w,
                "linds",
                "alex",
                recipes,
                "Tomato pasta",
                "",
                Audience.CIRCLE,
                text("25 minutes. Garlic first, tomatoes from the tin, basil at the very end."));
        UUID garden = folder(w, "linds", "nora", home, "Garden", Audience.CIRCLE);
        page(
                w,
                "linds",
                "nora",
                garden,
                "Watering while we're away",
                "",
                Audience.CIRCLE,
                text("Petra at number 7 has a key to the gate. Tomatoes every evening, the rest every other day."));
        page(
                w,
                "linds",
                "nora",
                garden,
                "What grows where",
                "",
                Audience.CIRCLE,
                text(
                        "Raised bed by the fence: tomatoes and basil. By the shed: raspberries. Pots on the steps: herbs."));
        page(
                w,
                "linds",
                "alex",
                garden,
                "Compost rules",
                "",
                Audience.CIRCLE,
                text("Peelings and coffee grounds, yes. Cooked food and citrus, no."));
        UUID seeds = folder(w, "linds", "nora", garden, "Seeds and bulbs", Audience.CIRCLE);
        page(
                w,
                "linds",
                "nora",
                seeds,
                "Tomatoes from seed",
                "",
                Audience.CIRCLE,
                text("Sow indoors in March. Out after the Ice Saints, in the middle of May."));
        page(
                w,
                "linds",
                "nora",
                seeds,
                "Bulbs to plant in October",
                "",
                Audience.CIRCLE,
                text("Tulips along the path, crocuses under the apple tree."));

        // Home: the shopping list, and the loose pages
        groceries(w, home);
        live(w, home, "linds", "Renovation budget");
        UUID sitter = existing(w, "linds", "Babysitter notes");
        folders.file(sitter, nora, home, null, false);
        clear(w, sitter);
        pages.change(sitter, nora, null, null, "👶");
        write(
                sitter,
                nora,
                words(BlockKind.HEADING, "Bedtimes"),
                words(BlockKind.BULLET, "Leo at 19:30, Mia at 20:30. One story each."),
                words(BlockKind.HEADING, "Snacks"),
                words(BlockKind.BULLET, "Fruit is in the bowl. No sweets after dinner."),
                words(BlockKind.HEADING, "What Leo will try"),
                words(BlockKind.PARAGRAPH, "\"Mum says I can stay up.\" She doesn't."));
        UUID christmas = page(
                w,
                "linds",
                "nora",
                home,
                "Christmas plan",
                "🎄",
                Audience.CIRCLE,
                words(BlockKind.HEADING, "Presents"),
                words(BlockKind.BULLET, "Mia: the art desk from the shop on Trubarjeva"),
                words(BlockKind.BULLET, "Leo: the wooden train set, and the bridge to go with it"),
                words(BlockKind.HEADING, "The days"),
                words(
                        BlockKind.PARAGRAPH,
                        "The 24th at home, the 25th at Grandma Astrid's. Alex hides the presents in the cellar."));
        LocalDate christmasEve = next(MonthDay.of(12, 24));
        things.share(
                christmas,
                nora,
                new AudienceChange(
                        Audience.CIRCLE,
                        null,
                        null,
                        List.of(new Hidden(mia, christmasEve), new Hidden(leo, christmasEve))));
        UUID numbers = existing(w, "linds", "Emergency numbers");
        folders.file(numbers, alex, home, null, false);
        clear(w, numbers);
        pages.change(numbers, alex, null, null, "🔔");
        write(
                numbers,
                alex,
                words(BlockKind.BULLET, "Nora: 041 555 010"),
                words(BlockKind.BULLET, "Alex: 041 555 011"),
                words(BlockKind.BULLET, "Grandma Astrid: 041 555 012"),
                words(BlockKind.BULLET, "The neighbours, Petra and Jan, at number 7: 041 555 013"));

        // Kids: for the adults. Each folder and page in it is shared the way the space is.
        UUID birthdays = folder(w, "linds", "nora", kids, "Birthdays", null);
        like(kids, birthdays, nora);
        birthday(w, birthdays);
        UUID gifts = existing(w, "linds", "Gift list for Alex");
        folders.file(gifts, nora, birthdays, null, false);
        UUID school = folder(w, "linds", "nora", kids, "School", null);
        like(kids, school, nora);
        like(
                kids,
                page(
                        w,
                        "linds",
                        "nora",
                        school,
                        "Class 4B: teachers and timetable",
                        "🎒",
                        null,
                        text("Ms Kovač, room 12. PE on Monday and Thursday: trainers in the bag.")),
                nora);
        like(
                kids,
                page(
                        w,
                        "linds",
                        "nora",
                        school,
                        "Class 1A",
                        "",
                        null,
                        text("Ms Novak. Reading book goes back every Friday.")),
                nora);
        UUID sizes = folder(w, "linds", "nora", kids, "Clothes and sizes", null);
        like(kids, sizes, nora);
        like(
                kids,
                page(
                        w,
                        "linds",
                        "nora",
                        sizes,
                        "Sizes right now",
                        "",
                        null,
                        words(BlockKind.BULLET, "Mia: shoes 33, clothes 134"),
                        words(BlockKind.BULLET, "Leo: shoes 29, clothes 122")),
                nora);
        UUID clubs = folder(w, "linds", "nora", kids, "Swimming and clubs", null);
        like(kids, clubs, nora);
        like(
                kids,
                page(
                        w,
                        "linds",
                        "nora",
                        clubs,
                        "Swimming on Thursdays",
                        "🏊",
                        null,
                        text("17:00 at the pool on Kodeljevo. Alex takes her; goggles are in the blue bag.")),
                nora);

        // Trips
        UUID norway = folder(w, "linds", "nora", trips, "Norway 2027", Audience.CIRCLE);
        page(
                w,
                "linds",
                "nora",
                norway,
                "What to bring to Norway",
                "🧳",
                Audience.CIRCLE,
                words(BlockKind.PARAGRAPH, "3 to 17 April. Cold in the morning, light until late."),
                words(BlockKind.BULLET, "Tickets and the ferry booking"),
                words(BlockKind.BULLET, "Chargers, and all four passports and the health cards"),
                words(BlockKind.BULLET, "Wool socks, rain jackets, the small rucksacks"),
                words(BlockKind.BULLET, "Biscuit stays with Grandma Astrid: his food and his blanket"));
        UUID weekends = folder(w, "linds", "nora", trips, "Weekends away", Audience.CIRCLE);
        page(
                w,
                "linds",
                "alex",
                weekends,
                "The cabin at Bohinj",
                "",
                Audience.CIRCLE,
                text("Key from the neighbour. Bring wood for the first evening and coffee for the morning."));
        UUID later = folder(w, "linds", "nora", trips, "Ideas for later", Audience.CIRCLE);
        page(
                w,
                "linds",
                "nora",
                later,
                "Places the kids asked for",
                "",
                Audience.CIRCLE,
                words(BlockKind.BULLET, "Legoland, says Leo"),
                words(BlockKind.BULLET, "\"Somewhere with horses\", says Mia"));

        // A space that is only Nora's.
        UUID work = folders.create(nora, circle, null, "Nora's work", "💼", Audience.ME, null)
                .id();
        UUID clients = folders.create(nora, circle, work, "Clients", "", Audience.ME, null)
                .id();
        page(
                w,
                "linds",
                "nora",
                clients,
                "Kovač kitchen: measurements",
                "",
                Audience.ME,
                text("Wall to window 3.42 m. The socket moves 20 cm to the left."));
        page(
                w,
                "linds",
                "nora",
                clients,
                "Questions for the Hribar family",
                "",
                Audience.ME,
                text("Oak or ash? And who is in the house on the day the floor comes."));
        UUID workshop = folders.create(nora, circle, work, "Workshop notes", "", Audience.ME, null)
                .id();
        page(
                w,
                "linds",
                "nora",
                workshop,
                "Oil finish: what worked",
                "",
                Audience.ME,
                text("Two thin coats, a day apart. Sand with 320 in between."));

        // What Nora keeps at the top of Notes.
        folders.pin(existing(w, "linds", "Groceries"), nora);
        find(w, "linds", "This week's meals").filter(id -> sees(id, nora)).ifPresent(id -> folders.pin(id, nora));
        folders.pin(wifi, nora);
    }

    /** The shopping list of the screen: twelve lines, seven left, Alex ticking in the shop while Mia adds from home. */
    private void groceries(SeedWorld w, UUID home) {
        UUID nora = w.user("nora");
        UUID alex = w.user("alex");
        UUID mia = w.member("linds", "mia");
        ChecklistResponse list = lists.create(
                nora,
                w.circle("linds"),
                new NewList(
                        "Groceries",
                        Audience.CIRCLE,
                        List.of("Bananas", "Red onions", "Strawberries, 2 boxes"),
                        home,
                        "🛒",
                        "EUR",
                        true),
                null);
        UUID id = list.id();
        ItemResponse onions = list.items().get(1);
        lists.add(id, nora, new NewItem("Milk, 2 litres", null, null, null, null, Repeats.WEEKLY, null), null);
        ItemResponse butter = lists.add(id, nora, new NewItem("Butter", null, null, null, null), null);
        lists.add(id, nora, new NewItem("Dog food for Biscuit", null, null, null, null), null);
        lists.add(id, nora, new NewItem("Birthday candles", null, null, null, null, null, List.of(mia)), null);
        ItemResponse toothpaste = lists.add(id, alex, new NewItem("Toothpaste", null, null, null, null), null);
        ItemResponse kitchenRoll = lists.add(id, alex, new NewItem("Kitchen roll", null, null, null, null), null);
        ItemResponse liquid = lists.add(id, nora, new NewItem("Washing-up liquid", null, null, null, null), null);
        lists.add(id, nora, new NewItem("Bin bags", null, null, null, null), null);
        lists.add(id, alex, new NewItem("Batteries AA", null, null, null, null), null);
        for (ItemResponse bought : List.of(onions, butter, toothpaste, kitchenRoll, liquid)) {
            tick(bought, alex);
        }
        JdbcClient jdbc = w.jdbc();
        // Mia has no phone: what she adds is added on a parent's. The sample data says it was her.
        jdbc.sql(
                        "update checklist_items set added_by = :mia where thing_id = :list and text in ('Bananas', 'Strawberries, 2 boxes')")
                .param("mia", mia)
                .param("list", id)
                .update();
        // What this list held most weeks and doesn't hold today: one tap away.
        int times = 9;
        for (String[] usual :
                new String[][] {{"Eggs", "Fridge"}, {"Bread", "Bakery"}, {"Coffee", "Cupboard"}, {"Yoghurt", "Fridge"}
                }) {
            jdbc.sql("""
                insert into checklist_usuals (thing_id, key, text, section, times, last_at)
                values (:list, lower(:text), :text, :section, :times, now() - interval '6 days')
                """)
                    .param("list", id)
                    .param("text", usual[0])
                    .param("section", usual[1])
                    .param("times", times--)
                    .update();
        }
    }

    /** Mia's 10th birthday as the "surprise" screen draws it: gift ideas with what they cost, and the party. */
    private void birthday(SeedWorld w, UUID birthdays) {
        UUID nora = w.user("nora");
        UUID alex = w.user("alex");
        UUID plan = existing(w, "linds", "Mia's 10th birthday");
        folders.file(plan, nora, birthdays, null, false);
        clear(w, plan);
        pages.change(plan, nora, null, null, "🎂");
        // Plan's sample data made plain versions of the party's two lists for its event. The ones made here are
        // the ones the screens draw (with prices, in their folder), so they take their place and their links.
        Optional<UUID> party = find(w, "linds", "Mia's birthday party", "Mia's 10th birthday party", "Mia's party");
        w.jdbc()
                .sql(
                        "delete from things where circle_id = :circle and kind = 'checklist' and title in ('Party prep', 'Gift ideas')")
                .param("circle", w.circle("linds"))
                .update();
        write(plan, nora, words(BlockKind.HEADING, "Gift ideas"));
        // A list started in the page is shared like the page: with everyone, and hidden from Mia until her day.
        ChecklistResponse gifts =
                blocks.add(plan, nora, list("Gift ideas"), null).checklist();
        ItemResponse skates =
                lists.add(gifts.id(), nora, new NewItem("Roller skates, size 33", null, null, 4500L, null), null);
        lists.add(
                gifts.id(),
                nora,
                new NewItem("Watercolour set", "Grandma Astrid wants this one", null, 2800L, null),
                null);
        lists.add(
                gifts.id(),
                nora,
                new NewItem("Climbing course, 5 lessons", "From both of us", null, 9000L, null),
                null);
        lists.change(
                skates.id(),
                alex,
                new ItemChange(null, "Alex bought them", null, null, null, null, null, true, null, null));
        write(plan, nora, words(BlockKind.HEADING, "The party"));
        live(w, plan, nora, "linds", "Mia's birthday party", "Mia's 10th birthday party", "Mia's party");
        live(w, plan, nora, "linds", "Party budget");
        ChecklistResponse prep = lists.create(
                nora,
                w.circle("linds"),
                new NewList(
                        "Party prep",
                        Audience.CIRCLE,
                        List.of(
                                "Send the invitations",
                                "Balloons and bunting",
                                "Party bags for eight",
                                "Ask Grandma Astrid to come early",
                                "Cake",
                                "Candles",
                                "Games for eight children",
                                "A playlist",
                                "Tidy the living room"),
                        birthdays,
                        "🎉",
                        null,
                        null),
                null);
        folders.shareLike(things.require(plan, nora), things.require(prep.id(), nora), nora);
        for (ItemResponse done : prep.items().subList(0, 4)) {
            tick(done, nora);
        }
        lists.change(
                prep.items().get(4).id(),
                nora,
                new ItemChange(
                        null,
                        "Alex has the cake",
                        null,
                        null,
                        null,
                        w.member("linds", "alex"),
                        null,
                        null,
                        null,
                        null));
        blocks.add(
                plan,
                nora,
                new NewBlock(BlockKind.LIVE, null, null, null, null, prep.id(), null, null, null, null, null),
                null);
        party.ifPresent(event -> {
            things.link(event, prep.id(), nora);
            things.link(event, gifts.id(), nora);
            w.jdbc()
                    .sql("update thing_links set created_at = created_at + interval '1 second' where to_id = :gifts")
                    .param("gifts", gifts.id())
                    .update();
        });
    }

    // ---------- The other circles: their starter spaces, with a page or two each ----------

    private void couple(SeedWorld w) {
        UUID nora = w.user("nora");
        List<FolderResponse> spaces = folders.spaces(w.circle("couple"), nora);
        page(
                w,
                "couple",
                "nora",
                space(spaces, "Our place"),
                "Before winter",
                "",
                null,
                words(BlockKind.BULLET, "Bleed the radiators"),
                words(BlockKind.BULLET, "The draught under the balcony door"),
                words(BlockKind.BULLET, "Winter tyres: Alex books it"));
        page(
                w,
                "couple",
                "alex",
                space(spaces, "Money"),
                "Who pays what",
                "",
                null,
                text("Rent and bills from the joint account. Everything else: whoever is there."));
        page(
                w,
                "couple",
                "alex",
                space(spaces, "Trips"),
                "A weekend without the kids",
                "",
                null,
                text("Grandma Astrid said yes to the last weekend of January. Somewhere with a sauna."));
        ChecklistResponse someday = lists.create(
                nora,
                w.circle("couple"),
                new NewList(
                        "Someday",
                        null,
                        List.of(
                                "See the northern lights",
                                "Learn to dance, properly",
                                "A night in a lighthouse",
                                "Walk the Soča trail end to end",
                                "Dinner at that place in Kobarid",
                                "Sleep under the stars with no tent"),
                        space(spaces, "Someday"),
                        "🌍",
                        null,
                        null),
                null);
        tick(someday.items().get(3), w.user("alex"));
        tick(someday.items().get(4), nora);
    }

    private void crew(SeedWorld w) {
        UUID lea = w.user("lea");
        List<FolderResponse> spaces = folders.spaces(w.circle("crew"), lea);
        UUID trips = space(spaces, "Trips");
        folders.file(existing(w, "crew", "Who brings what"), lea, trips, null, false);
        page(
                w,
                "crew",
                "kai",
                trips,
                "Lisbon in May: the plan",
                "",
                null,
                text("Thursday to Monday. Kai finds the flat, Lena books the fado night, Ana knows where to eat."));
        page(
                w,
                "crew",
                "nora",
                space(spaces, "Plans"),
                "When can everyone?",
                "",
                null,
                text("Not the first weekend of March: Nora has the kids' swimming gala."));
        page(
                w,
                "crew",
                "lea",
                space(spaces, "The dictionary"),
                "How the dictionary works",
                "📚",
                null,
                text("A word goes in when at least three of us have used it and nobody outside would understand."));
    }

    private void flat(SeedWorld w) {
        UUID kai = w.user("kai");
        List<FolderResponse> spaces = folders.spaces(w.circle("flat"), kai);
        UUID theFlat = space(spaces, "The flat");
        folders.file(existing(w, "flat", "House rules"), kai, theFlat, null, false);
        page(
                w,
                "flat",
                "lena",
                theFlat,
                "Bin days",
                "🗑️",
                null,
                words(BlockKind.BULLET, "Tuesday night: rubbish"),
                words(BlockKind.BULLET, "Every other Thursday: paper"));
        page(
                w,
                "flat",
                "lea",
                space(spaces, "Bills"),
                "How we split the bills",
                "",
                null,
                text("Rent by room size. Electricity and internet in three equal parts."));
        page(
                w,
                "flat",
                "kai",
                space(spaces, "Landlord"),
                "Who to call",
                "",
                null,
                text("Mr Zupan, weekdays before 17:00. For the boiler, call the service number on its door first."));
    }

    // ---------- when ----------

    /** Spreads the notes of the sample circles over the last two months, in the order they were made. */
    private void settle(SeedWorld w) {
        JdbcClient jdbc = w.jdbc();
        List<UUID> circles = List.of(w.circle("linds"), w.circle("couple"), w.circle("crew"), w.circle("flat"));
        jdbc.sql("""
            update things t set updated_at = now() - make_interval(days => 9 + (r.n % 50)::int, hours => (r.n % 7)::int)
            from (select id, row_number() over (order by created_at, id) as n from things
                  where place = 'notes' and circle_id in (:circles)) r
            where t.id = r.id
            """).param("circles", circles).update();
        jdbc.sql("""
            update pages p set edited_at = t.updated_at from things t
            where t.id = p.thing_id and t.circle_id in (:circles)
            """).param("circles", circles).update();
        jdbc.sql("""
            update checklists c set edited_at = t.updated_at from things t
            where t.id = c.thing_id and t.circle_id in (:circles)
            """).param("circles", circles).update();
    }

    /** What happened lately in The Linds, newest first, as the screens say it. */
    private void lately(SeedWorld w) {
        JdbcClient jdbc = w.jdbc();
        UUID alex = w.member("linds", "alex");
        UUID groceries = existing(w, "linds", "Groceries");
        when(jdbc, groceries, "0 minutes", alex);
        // Alex is in the shop. He counts as "here" for ten minutes after his last tick; the sample Alex is given a
        // week, so the list looks like its drawing whenever the sample data is opened.
        jdbc.sql(
                        "update checklist_people set did = 'ticked', did_at = now() + interval '7 days' where thing_id = :list and member_id = :alex")
                .param("list", groceries)
                .param("alex", alex)
                .update();
        jdbc.sql(
                        "update checklist_items set created_at = now() where thing_id = :list and text = 'Strawberries, 2 boxes'")
                .param("list", groceries)
                .update();
        when(jdbc, existing(w, "linds", "Wi‑Fi and smart home"), "2 hours", alex);
        when(jdbc, existing(w, "linds", "Mia's 10th birthday"), "1 day", w.member("linds", "nora"));
        when(jdbc, existing(w, "linds", "Grandma's cookies"), "2 days", alex);
        when(jdbc, existing(w, "linds", "What to bring to Norway"), "3 days", w.member("linds", "nora"));
    }

    private static void when(JdbcClient jdbc, UUID thing, String ago, UUID editor) {
        jdbc.sql("update things set updated_at = now() - cast(:ago as interval) where id = :id")
                .param("id", thing)
                .param("ago", ago)
                .update();
        jdbc.sql("update pages set edited_at = now() - cast(:ago as interval), edited_by = :by where thing_id = :id")
                .param("id", thing)
                .param("ago", ago)
                .param("by", editor)
                .update();
        jdbc.sql(
                        "update checklists set edited_at = now() - cast(:ago as interval), edited_by = :by where thing_id = :id")
                .param("id", thing)
                .param("ago", ago)
                .param("by", editor)
                .update();
    }

    /** The next time this day of the year comes round (today counts). */
    private static LocalDate next(MonthDay day) {
        LocalDate today = LocalDate.now();
        LocalDate thisYear = day.atYear(today.getYear());
        return thisYear.isBefore(today) ? day.atYear(today.getYear() + 1) : thisYear;
    }

    // ---------- small helpers ----------

    private static UUID space(List<FolderResponse> spaces, String title) {
        return spaces.stream()
                .filter(s -> s.title().equals(title))
                .findFirst()
                .orElseThrow(() -> new IllegalStateException("The sample circle has no space called " + title))
                .id();
    }

    private UUID folder(SeedWorld w, String circle, String owner, UUID parent, String title, Audience audience) {
        return folders.create(w.user(owner), w.circle(circle), parent, title, "", audience, null)
                .id();
    }

    /** Writes a page into a folder, block by block. Returns its id. */
    private UUID page(
            SeedWorld w,
            String circle,
            String owner,
            UUID folder,
            String title,
            String emoji,
            Audience audience,
            NewBlock... written) {
        UUID me = w.user(owner);
        UUID id = pages.create(me, w.circle(circle), new NewPage(title, null, audience, folder, emoji), null)
                .id();
        write(id, me, written);
        return id;
    }

    private void write(UUID page, UUID me, NewBlock... written) {
        for (NewBlock block : written) {
            blocks.add(page, me, block, null);
        }
    }

    /** Gives one of this person's things the audience another thing has: a folder in Kids is for the adults, like Kids. */
    private void like(UUID other, UUID mine, UUID me) {
        folders.shareLike(things.require(other, me), things.require(mine, me), me);
    }

    private void tick(ItemResponse line, UUID me) {
        lists.change(line.id(), me, new ItemChange(null, null, null, null, null, null, null, true, null, null));
    }

    private static NewBlock words(BlockKind kind, String text) {
        return new NewBlock(kind, text, null, null, null, null, null, null, null, null, null);
    }

    private static NewBlock text(String text) {
        return words(BlockKind.PARAGRAPH, text);
    }

    private static NewBlock photo(UUID media, String caption) {
        return new NewBlock(BlockKind.PHOTO, caption, null, null, null, null, media, null, null, null, null);
    }

    /** A new list, started in the page. */
    private static NewBlock list(String title, String... lines) {
        return new NewBlock(BlockKind.CHECKLIST, null, null, null, null, null, null, null, null, title, List.of(lines));
    }

    /** Takes a page's blocks away, to write it again the way it is drawn. */
    private static void clear(SeedWorld w, UUID page) {
        w.jdbc()
                .sql("delete from page_blocks where page_id = :page")
                .param("page", page)
                .update();
    }

    private static Optional<UUID> find(SeedWorld w, String circle, String... titles) {
        return w.jdbc()
                .sql("""
                select id from things where circle_id = :circle and title in (:titles) and kind <> 'folder'
                order by created_at, id limit 1
                """)
                .param("circle", w.circle(circle))
                .param("titles", List.of(titles))
                .query(UUID.class)
                .optional();
    }

    private static UUID existing(SeedWorld w, String circle, String title) {
        return find(w, circle, title)
                .orElseThrow(() -> new IllegalStateException("The sample data has no \"" + title + "\" yet."));
    }

    private boolean sees(UUID thing, UUID me) {
        return thingStore.find(thing, me).isPresent();
    }

    /**
     * Shows something another place made on a page, as a live block, when it is there and the writer may see
     * it. The sample data of a place that isn't built yet simply leaves the block out.
     */
    private void live(SeedWorld w, UUID page, UUID me, String circle, String... titles) {
        find(w, circle, titles)
                .filter(id -> sees(id, me))
                .ifPresent(id -> blocks.add(
                        page,
                        me,
                        new NewBlock(BlockKind.LIVE, null, null, null, null, id, null, null, null, null, null),
                        null));
    }

    /** Files something another place made (a sheet) in a folder, when it is there and isn't filed yet. */
    private void live(SeedWorld w, UUID folder, String circle, String title) {
        UUID nora = w.user("nora");
        find(w, circle, title)
                .filter(id -> sees(id, nora)
                        && thingStore.find(id, nora).orElseThrow().canEdit())
                .ifPresent(id -> folders.file(id, nora, folder, null, false));
    }
}

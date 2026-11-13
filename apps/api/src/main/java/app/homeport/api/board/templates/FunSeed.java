package app.homeport.api.board.templates;

import app.homeport.api.board.BoardService;
import app.homeport.api.board.Json;
import app.homeport.api.board.Template;
import app.homeport.api.folder.FolderService;
import app.homeport.api.list.ChecklistService;
import app.homeport.api.list.ChecklistService.ItemChange;
import app.homeport.api.list.ChecklistService.ItemResponse;
import app.homeport.api.list.ChecklistService.NewItem;
import app.homeport.api.money.split.ShareMode;
import app.homeport.api.money.split.SplitService;
import app.homeport.api.money.split.SplitService.ExpenseInput;
import app.homeport.api.plan.EventService;
import app.homeport.api.plan.EventService.NewEvent;
import app.homeport.api.plan.EventService.NewGuest;
import app.homeport.api.plan.EventService.When;
import app.homeport.api.seed.SeedWorld;
import app.homeport.api.seed.Seeder;
import app.homeport.api.thing.Audience;
import java.sql.Timestamp;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.MonthDay;
import java.time.ZoneOffset;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * The seven fair-and-fun boards of The Linds and the six of Nora and Alex, as their screens draw them, and
 * the few things a couple's Today shows that belong to other places: the run at seven (an event), what Alex
 * owes for last month (a split), and the Someday list with 14 of its 60 lines done (a checklist, pinned).
 * Dates are counted from the day this runs.
 *
 * <p>Boards are made through the service, so their settings are checked like anyone's. What has to lie in the
 * past (turns since March, last week's missions, a year of found notes) is written straight into the rows.
 */
@Component
@ConditionalOnProperty(name = "homeport.seed.enabled", havingValue = "true")
class FunSeed implements Seeder {

    private static final String LINDS = "linds";
    private static final String COUPLE = "couple";

    private final BoardService boards;
    private final EventService events;
    private final SplitService splits;
    private final ChecklistService lists;
    private final FolderService folders;

    private SeedWorld w;
    private LocalDate today;
    private double next = 1;
    private final List<UUID> made = new ArrayList<>();

    FunSeed(
            BoardService boards,
            EventService events,
            SplitService splits,
            ChecklistService lists,
            FolderService folders) {
        this.boards = boards;
        this.events = events;
        this.splits = splits;
        this.lists = lists;
        this.folders = folders;
    }

    @Override
    public int order() {
        return 70;
    }

    @Override
    public void seed(SeedWorld world) {
        w = world;
        today = LocalDate.now(ZoneOffset.UTC);
        made.clear();
        UUID turns = whoseTurn();
        piggyBank();
        secretMissions();
        saturdayJar();
        sleeps();
        whereIsIt();
        habitCharts();
        LocalDate began = today.minusDays(4503);
        ourStory(began);
        tuckedNotes();
        anniversary(began);
        mysteryDate();
        bothYes();
        fairShare();
        // These were set up a while ago: what changed last in each circle is what its screens draw, not
        // thirteen templates made in the same second.
        w.jdbc()
                .sql(
                        "update things set created_at = created_at - interval '20 days', updated_at = updated_at - interval '3 days'"
                                + " where id in (:ids)")
                .param("ids", made)
                .update();
        // "61 turns kept since March."
        LocalDate march = LocalDate.of(today.getYear(), 3, 14);
        w.jdbc()
                .sql("update things set created_at = :at where id = :id")
                .param(
                        "at",
                        Timestamp.from(at(march.isAfter(today.minusDays(60)) ? march.minusYears(1) : march, 18, 0)))
                .param("id", turns)
                .update();
        forTheirToday();
    }

    // ---------- helpers ----------

    private UUID board(String circle, String owner, Template template, String title, Map<String, Object> settings) {
        UUID id = boards.create(
                        w.user(owner),
                        w.circle(circle),
                        template,
                        title,
                        Audience.CIRCLE,
                        settings,
                        UUID.randomUUID(),
                        today)
                .id();
        made.add(id);
        return id;
    }

    private UUID add(String as, UUID board, String kind, Map<String, Object> fields) {
        return boards.add(board, w.user(as), kind, fields, UUID.randomUUID(), today)
                .entryId();
    }

    private UUID linds(String key) {
        return w.member(LINDS, key);
    }

    private UUID two(String key) {
        return w.member(COUPLE, key);
    }

    private static Instant at(LocalDate day, int hour, int minute) {
        return day.atTime(LocalTime.of(hour, minute)).toInstant(ZoneOffset.UTC);
    }

    /** A moment on a day, but never later than a little while ago. */
    private static Instant past(LocalDate day, int hour, int minute) {
        Instant when = at(day, hour, minute);
        return when.isAfter(Instant.now()) ? Instant.now().minusSeconds(1200) : when;
    }

    private static Map<String, Object> fields(Object... pairs) {
        Map<String, Object> map = new LinkedHashMap<>();
        for (int i = 0; i < pairs.length; i += 2) {
            if (pairs[i + 1] != null) {
                map.put(
                        (String) pairs[i],
                        pairs[i + 1] instanceof UUID
                                        || pairs[i + 1] instanceof LocalDate
                                        || pairs[i + 1] instanceof Instant
                                ? pairs[i + 1].toString()
                                : pairs[i + 1]);
            }
        }
        return map;
    }

    /** A row written as it would stand after some time: for what lies in the past. Set what it needs, then {@link #insert}. */
    private final class Row {
        private final UUID board;
        private final String kind;
        private UUID parent;
        private UUID author;
        private UUID forMember;
        private Object doc = Map.of();
        private LocalDate day;
        private Instant opensAt;
        private Instant doneAt;
        private UUID doneBy;
        private UUID media;
        private Long amount;
        private Instant createdAt;

        private Row(UUID board, String kind) {
            this.board = board;
            this.kind = kind;
        }

        Row under(UUID value) {
            parent = value;
            return this;
        }

        Row by(UUID value) {
            author = value;
            return this;
        }

        Row forMember(UUID value) {
            forMember = value;
            return this;
        }

        Row doc(Object value) {
            doc = value;
            return this;
        }

        Row day(LocalDate value) {
            day = value;
            return this;
        }

        Row opensAt(Instant value) {
            opensAt = value;
            return this;
        }

        Row done(Instant at, UUID by) {
            doneAt = at;
            doneBy = by;
            return this;
        }

        Row media(UUID value) {
            media = value;
            return this;
        }

        Row amount(long value) {
            amount = value;
            return this;
        }

        Row created(Instant value) {
            createdAt = value;
            return this;
        }

        UUID insert() {
            UUID id = UUID.randomUUID();
            Instant made = createdAt != null ? createdAt : doneAt != null ? doneAt : Instant.now();
            w.jdbc()
                    .sql("""
                insert into board_entries (id, board_id, parent_id, kind, author_id, for_id, doc, day, opens_at, done_at,
                  done_by, media_id, amount, position, created_at, updated_at)
                values (:id, :board, :parent, :kind, :author, :for, cast(:doc as jsonb), :day, :opens, :done, :doneBy,
                  :media, :amount, :position, :created, :created)
                """)
                    .param("id", id)
                    .param("board", board)
                    .param("parent", parent)
                    .param("kind", kind)
                    .param("author", author)
                    .param("for", forMember)
                    .param("doc", Json.text(Json.tree(doc)))
                    .param("day", day)
                    .param("opens", opensAt == null ? null : Timestamp.from(opensAt))
                    .param("done", doneAt == null ? null : Timestamp.from(doneAt))
                    .param("doneBy", doneBy)
                    .param("media", media)
                    .param("amount", amount)
                    .param("position", day == null ? next++ : day.toEpochDay() + (next++ % 1000) / 1000.0)
                    .param("created", Timestamp.from(made))
                    .update();
            return id;
        }
    }

    private Row row(UUID board, String kind) {
        return new Row(board, kind);
    }

    private void touch(UUID entry, String column, Instant at) {
        w.jdbc()
                .sql("update board_entries set " + column + " = :at where id = :id")
                .param("at", Timestamp.from(at))
                .param("id", entry)
                .update();
    }

    // ---------- 16.1 Whose turn? ----------

    private UUID whoseTurn() {
        UUID board = board(LINDS, "nora", Template.WHOSE_TURN, "Whose turn?", null);
        UUID mia = linds("mia");
        UUID leo = linds("leo");
        UUID nora = linds("nora");
        UUID alex = linds("alex");
        List<String> kids = List.of(mia.toString(), leo.toString());
        LocalDate friday = today.with(TemporalAdjusters.previous(DayOfWeek.FRIDAY));

        // Film night is tonight, and it is Leo's turn: Mia chose last Friday.
        UUID film = add(
                "nora",
                board,
                WhoseTurn.THING,
                fields(
                        "name",
                        "Film night",
                        "emoji",
                        "🎬",
                        "does",
                        "chooses the film",
                        "did",
                        "chose",
                        "people",
                        kids,
                        "nextMemberId",
                        leo,
                        "onDay",
                        today));
        for (int week = 29; week >= 0; week--) {
            row(board, WhoseTurn.TURN)
                    .under(film)
                    .by(nora)
                    .forMember(week % 2 == 0 ? mia : leo)
                    .day(friday.minusWeeks(week))
                    .doc(new WhoseTurn.Turn(week == 0 ? "Frozen, again" : null))
                    .created(at(friday.minusWeeks(week), 19, 30))
                    .insert();
        }

        UUID seat = add(
                "nora",
                board,
                WhoseTurn.THING,
                fields("name", "The front seat", "emoji", "🚗", "people", kids, "nextMemberId", mia));
        row(board, WhoseTurn.TURN)
                .under(seat)
                .by(alex)
                .forMember(mia)
                .day(today.minusDays(1))
                .created(at(today.minusDays(1), 7, 55))
                .insert();
        row(board, WhoseTurn.TURN)
                .under(seat)
                .by(alex)
                .forMember(leo)
                .day(today)
                .doc(new WhoseTurn.Turn("had it on the way to school"))
                .created(past(today, 7, 55))
                .insert();

        UUID pizza = add(
                "nora",
                board,
                WhoseTurn.THING,
                fields("name", "Pizza toppings", "emoji", "🍕", "people", kids, "nextMemberId", leo));
        row(board, WhoseTurn.TURN)
                .under(pizza)
                .by(nora)
                .forMember(leo)
                .day(friday.minusWeeks(1))
                .created(at(friday.minusWeeks(1), 18, 0))
                .insert();
        row(board, WhoseTurn.TURN)
                .under(pizza)
                .by(nora)
                .forMember(mia)
                .day(friday)
                .doc(new WhoseTurn.Turn("went for olives last time"))
                .created(at(friday, 18, 0))
                .insert();

        UUID bath = add(
                "nora",
                board,
                WhoseTurn.THING,
                fields(
                        "name",
                        "First in the bath",
                        "emoji",
                        "🛁",
                        "when",
                        "Every evening",
                        "people",
                        kids,
                        "nextMemberId",
                        mia));
        for (int back = 24; back >= 1; back--) {
            row(board, WhoseTurn.TURN)
                    .under(bath)
                    .by(alex)
                    .forMember(back % 2 == 1 ? leo : mia)
                    .day(today.minusDays(back))
                    .created(at(today.minusDays(back), 19, 0))
                    .insert();
        }

        // Nora did the last two mornings, so it is Alex's turn.
        UUID walk = add(
                "nora",
                board,
                WhoseTurn.THING,
                fields(
                        "name",
                        "The early walk with Biscuit",
                        "emoji",
                        "🐶",
                        "people",
                        List.of(nora.toString(), alex.toString()),
                        "nextMemberId",
                        alex));
        for (int back = 3; back >= 1; back--) {
            row(board, WhoseTurn.TURN)
                    .under(walk)
                    .by(nora)
                    .forMember(back == 3 ? alex : nora)
                    .day(today.minusDays(back))
                    .created(at(today.minusDays(back), 6, 40))
                    .insert();
        }
        return board;
    }

    // ---------- 16.2 The piggy bank ----------

    private void piggyBank() {
        UUID mia = linds("mia");
        UUID nora = linds("nora");
        UUID board = board(
                LINDS,
                "nora",
                Template.PIGGY_BANK,
                "Mia's piggy bank",
                fields(
                        "forMemberId", mia,
                        "interestPercent", 5,
                        "starCents", 20,
                        "fund", Map.of("name", "Skates fund", "stars", 50),
                        "spendGoalCents", 2000,
                        "giveGoalCents", 1500));
        // Its skates fund is the goal "Mia's skates fund" in Plan, which counts the same 34 stars.
        w.thing("board/mias-piggy-bank", board);
        w.link("board/mias-piggy-bank", "goal/skates-fund");
        LocalDate sunday = today.with(TemporalAdjusters.previousOrSame(DayOfWeek.SUNDAY));
        // Spend €8.40, Save €12.00, Give €3.00; 34 stars paid in towards the 50 of the skates fund.
        money(
                board,
                PiggyBank.IN,
                sunday.minusDays(70),
                720,
                nora,
                "save",
                null,
                "Pocket money, to start",
                null,
                null,
                null);
        money(board, PiggyBank.IN, sunday.minusDays(63), 430, nora, "spend", null, "Pocket money", null, null, null);
        money(
                board,
                PiggyBank.IN,
                sunday.minusDays(56),
                300,
                nora,
                "give",
                null,
                "For the animal shelter",
                null,
                null,
                null);
        money(
                board,
                PiggyBank.IN,
                sunday.minusDays(42),
                200,
                nora,
                "save",
                null,
                "10 stars from the chore wheel",
                null,
                null,
                10);
        money(
                board,
                PiggyBank.IN,
                sunday.minusDays(28),
                200,
                nora,
                "save",
                null,
                "10 stars from the chore wheel",
                null,
                null,
                10);
        money(
                board,
                PiggyBank.IN,
                sunday.minusDays(14),
                80,
                nora,
                "save",
                null,
                "4 stars from the chore wheel",
                null,
                null,
                4);
        // 5% of the €12.00 that was in Save: €0.60, on the first of this month.
        money(
                board,
                PiggyBank.INTEREST,
                today.withDayOfMonth(1),
                60,
                null,
                "save",
                null,
                "Interest, 5%",
                null,
                null,
                null);
        money(
                board,
                PiggyBank.MOVE,
                sunday.minusDays(8),
                260,
                nora,
                "save",
                "spend",
                "Moved to Spend",
                "For the school fair",
                null,
                null);
        money(
                board,
                PiggyBank.OUT,
                sunday.minusDays(5),
                350,
                nora,
                "spend",
                null,
                "Stickers",
                "Her own choice",
                null,
                null);
        money(
                board,
                PiggyBank.IN,
                sunday.minusDays(3),
                500,
                nora,
                "spend",
                null,
                "From Grandma Astrid",
                "For a good school report",
                "Astrid Lind",
                null);
        money(board, PiggyBank.IN, sunday, 200, nora, "save", null, "10 stars from the chore wheel", null, null, 10);
    }

    private void money(
            UUID board,
            String kind,
            LocalDate day,
            long cents,
            UUID by,
            String jar,
            String toJar,
            String title,
            String note,
            String fromName,
            Integer stars) {
        row(board, kind)
                .by(by)
                .forMember(linds("mia"))
                .day(day)
                .amount(cents)
                .doc(new PiggyBank.Money(jar, toJar, title, note, fromName, stars))
                .created(past(day, 17, 0))
                .insert();
    }

    // ---------- 16.3 Secret missions ----------

    private void secretMissions() {
        UUID board = board(LINDS, "nora", Template.SECRET_MISSIONS, "Secret missions", null);
        UUID nora = linds("nora");
        UUID alex = linds("alex");
        UUID mia = linds("mia");
        UUID leo = linds("leo");
        UUID biscuit = linds("biscuit");
        LocalDate week = MealPlan.monday(today);
        LocalDate last = week.minusDays(7);

        // Last week, revealed on Sunday.
        mission(
                board,
                last,
                alex,
                nora,
                "Make Nora's coffee before she asks.",
                "made your coffee three mornings running",
                "You guessed by Wednesday",
                true,
                null,
                2);
        mission(
                board,
                last,
                mia,
                leo,
                "Let Leo win at something.",
                "let him win at cards, twice",
                "Leo had no idea",
                null,
                null,
                3);
        mission(
                board,
                last,
                leo,
                alex,
                "Hide a small drawing where Dad will look.",
                "hid a drawing in Dad's bag",
                "Found in Reine, on day 3",
                null,
                w.photo("nora", "bike.jpg"),
                1);
        mission(
                board,
                last,
                nora,
                biscuit,
                "Take Biscuit on one very long walk.",
                "one very long walk",
                "Biscuit can't read, but knew",
                null,
                null,
                5);

        // This week: nobody has told yet. Nora's is for Mia; the children's are read to them by the other parent.
        mission(board, week, nora, mia, "Do one of Mia's jobs before she notices.", null, null, null, null, -1);
        mission(board, week, alex, leo, "Let Leo choose, for a whole evening.", null, null, null, null, -1);
        mission(board, week, mia, nora, "Leave a note where only Mum will find it.", null, null, null, null, -1);
        mission(
                board,
                week,
                leo,
                biscuit,
                "Give Biscuit ten minutes of scratches behind the ears.",
                null,
                null,
                null,
                null,
                -1);
    }

    /** @param doneOn the day of its week it was done on, counted from Monday as 0; below zero for not done */
    private void mission(
            UUID board,
            LocalDate week,
            UUID doer,
            UUID target,
            String text,
            String did,
            String reply,
            Boolean liked,
            UUID photo,
            int doneOn) {
        Row row = row(board, SecretMissions.MISSION)
                .by(doer)
                .forMember(target)
                .day(week)
                .media(photo)
                .doc(new SecretMissions.Mission(text, did, reply, 0, liked))
                .created(past(week, 6, 0));
        if (doneOn >= 0) {
            row.done(at(week.plusDays(doneOn), 20, 15), doer);
        }
        row.insert();
    }

    // ---------- 16.4 The Saturday jar ----------

    private void saturdayJar() {
        UUID board = board(LINDS, "nora", Template.SATURDAY_JAR, "The Saturday jar", null);
        // Who put it in, its emoji, the idea, where, how many minutes, about how many cents. 31 in all.
        String[] ideas = {
            "nora|🚲|Cycle to the river and back|outdoors|180|0",
            "alex|🥾|Walk up Šmarna gora for the view|outdoors|240|0",
            "mia|🧁|Bake something none of us has made before|home|120|800",
            "leo|🦖|The dinosaur room at the museum|indoors|180|2400",
            "nora|📚|An hour each at the library, then swap books|indoors|90|0",
            "alex|🛶|Canoes at the lake|outdoors|480|4500",
            "mia|🎨|Paint the old chairs for the balcony|home|180|1500",
            "leo|🚂|Take the train to anywhere and back|outdoors|300|2800",
            "nora|🧩|The thousand-piece puzzle, start to finish|home|240|0",
            "alex|🔭|Stay up for the stars with hot chocolate|outdoors|120|0",
            "mia|🐎|Watch the horses at the riding school|outdoors|120|0",
            "leo|🍦|Find the best ice cream in town|outdoors|120|1200",
            "nora|🌱|Plant something on the balcony|home|60|900",
            "alex|🎬|A film marathon with a blanket fort|home|300|0",
            "mia|🧺|A picnic by the pond in Tivoli|outdoors|120|0",
            "leo|⚽|Football in the park until someone wins|outdoors|90|0",
            "nora|🧵|Fix everything that has a button missing|home|60|0",
            "alex|🛼|The roller rink|indoors|150|3200",
            "mia|✉️|Write real letters to Grandma Astrid|home|45|300",
            "leo|🎣|Fishing with Grandpa's old rod|outdoors|240|0",
            "nora|🖼️|The gallery, and each of us picks a favourite|indoors|120|1800",
            "alex|🍝|Make pasta from scratch|home|150|600",
            "mia|🎤|A talent show in the living room|home|60|0",
            "leo|🏰|The castle and its tower|outdoors|180|2000",
            "nora|🧘|A slow morning: pyjamas until noon|home|240|0",
            "alex|🚌|Ride a bus line to its last stop|outdoors|150|500",
            "mia|🛍️|The flea market, with €5 each|outdoors|120|2000",
            "leo|🎲|Every board game we own, one round each|home|180|0",
            "mia|🥞|Pancakes for dinner|home|30|0",
            "alex|🏊|The big slides at the pool|indoors|240|6000",
            "leo|⛺|Build a den in the living room|home|null|0",
        };
        LocalDate june = LocalDate.of(today.getYear(), 6, 14);
        if (!june.isBefore(today.minusDays(30))) {
            june = june.minusYears(1);
        }
        UUID picnic = null;
        for (int i = 0; i < ideas.length; i++) {
            String[] idea = ideas[i].split("\\|");
            boolean thePicnic = idea[2].startsWith("A picnic");
            // Dropped in through the year; the last three in the last three weeks.
            LocalDate on = thePicnic ? june : today.minusDays(9L * (ideas.length - i));
            UUID id = row(board, SaturdayJar.IDEA)
                    .by(linds("nora"))
                    .forMember(linds(idea[0]))
                    .doc(new SaturdayJar.Idea(
                            idea[2],
                            idea[1],
                            idea[3],
                            idea[4].equals("null") ? null : Integer.valueOf(idea[4]),
                            Long.valueOf(idea[5]),
                            null,
                            null))
                    .created(at(on, 16, 0))
                    .insert();
            if (thePicnic) {
                picnic = id;
            }
        }
        // Shaken this morning, for a whole free day outdoors: the picnic came out.
        row(board, SaturdayJar.PULL)
                .under(picnic)
                .by(linds("nora"))
                .day(today)
                .doc(new SaturdayJar.Asked(null, null, true))
                .created(past(today, 8, 30))
                .insert();
    }

    // ---------- 16.5 Sleeps until… ----------

    private void sleeps() {
        UUID board = board(LINDS, "nora", Template.SLEEPS, "Sleeps until…", null);
        // The chain was made two days ago with fourteen links: twelve are left, and tonight's is still on.
        add(
                "nora",
                board,
                Sleeps.COUNT,
                fields(
                        "title",
                        "Grandma Astrid comes",
                        "emoji",
                        "👵",
                        "day",
                        today.plusDays(12),
                        "from",
                        today.minusDays(2),
                        "tearerMemberId",
                        linds("leo")));
        add(
                "nora",
                board,
                Sleeps.COUNT,
                fields("title", "Mia's birthday", "emoji", "🎂", "day", nextTime(MonthDay.of(12, 4)), "yearly", true));
        add(
                "nora",
                board,
                Sleeps.COUNT,
                fields(
                        "title",
                        "Christmas morning",
                        "emoji",
                        "🎄",
                        "day",
                        nextTime(MonthDay.of(12, 25)),
                        "yearly",
                        true));
        add(
                "nora",
                board,
                Sleeps.COUNT,
                fields("title", "Norway", "emoji", "✈️", "day", today.plusDays(143), "note", "from the trip"));
    }

    private LocalDate nextTime(MonthDay day) {
        LocalDate thisYear = day.atYear(today.getYear());
        return thisYear.isBefore(today) ? day.atYear(today.getYear() + 1) : thisYear;
    }

    // ---------- 16.6 Where is it? ----------

    private void whereIsIt() {
        UUID board = board(LINDS, "nora", Template.WHERE_IS_IT, "Where is it?", null);
        List<String> grownUps = List.of(linds("nora").toString(), linds("alex").toString());
        LocalDate september = LocalDate.of(today.getYear(), 9, 14);
        if (!september.isBefore(today)) {
            september = september.minusYears(1);
        }
        add(
                "alex",
                board,
                WhereIsIt.ITEM,
                fields(
                        "name",
                        "Tent",
                        "emoji",
                        "⛺",
                        "place",
                        "Attic, blue crate 3",
                        "note",
                        "Tent, pegs and both mats.",
                        "day",
                        september,
                        "mediaId",
                        w.photo("alex", "hallway.jpg")));
        // The list is read newest first: these four in the order the screen draws them, from the bottom up.
        add(
                "nora",
                board,
                WhereIsIt.ITEM,
                fields(
                        "name",
                        "The passports",
                        "emoji",
                        "🪪",
                        "place",
                        "Bedroom, grey folder",
                        "day",
                        today.minusDays(40),
                        "onlyMemberIds",
                        grownUps));
        UUID bag = add(
                "nora",
                board,
                WhereIsIt.ITEM,
                fields(
                        "name",
                        "Leo's swimming bag",
                        "emoji",
                        "🎒",
                        "place",
                        "Hall cupboard, bottom shelf",
                        "day",
                        today.minusDays(6)));
        add(
                "alex",
                board,
                WhereIsIt.ITEM,
                fields(
                        "name",
                        "Christmas lights",
                        "emoji",
                        "🎄",
                        "place",
                        "Cellar, top shelf, on the left",
                        "day",
                        today.minusDays(300)));
        add(
                "nora",
                board,
                WhereIsIt.ITEM,
                fields(
                        "name",
                        "Spare car key",
                        "emoji",
                        "🔑",
                        "place",
                        "With Marta next door",
                        "day",
                        today.minusDays(120),
                        "onlyMemberIds",
                        grownUps));
        // Mia saw the bag this morning, at ten to eight.
        boards.act(
                board,
                w.user("nora"),
                "seen",
                fields("entryId", bag, "place", "on the hall hook", "byMemberId", linds("mia")),
                today);
        touch(bag, "done_at", past(today, 7, 50));
    }

    // ---------- 16.7 Habit charts ----------

    private void habitCharts() {
        UUID board = board(LINDS, "nora", Template.HABIT_CHARTS, "Habit charts", null);
        UUID leo = linds("leo");
        UUID mia = linds("mia");
        LocalDate monday = MealPlan.monday(today);
        int soFar = (int) (today.toEpochDay() - monday.toEpochDay()) + 1;

        // Leo: both rows every day this week, except this evening's. 21 stars in all.
        UUID bed = add(
                "nora",
                board,
                HabitCharts.CHART,
                fields(
                        "title",
                        "Bed made, bag packed",
                        "people",
                        List.of(leo.toString()),
                        "rows",
                        List.of(
                                Map.of("label", "Bed made", "icon", "sun"),
                                Map.of("label", "Bag packed", "icon", "moon"))));
        int stars = 21;
        for (int d = 0; d < soFar; d++) {
            tick(board, bed, 0, monday.plusDays(d), leo, 1, 7);
            stars--;
            if (d < soFar - 1) {
                tick(board, bed, 1, monday.plusDays(d), leo, 1, 19);
                stars--;
            }
        }
        // The weeks before, with a gap here and there.
        for (int back = 1; stars > 0; back++) {
            LocalDate day = monday.minusDays(back);
            if (back % 4 == 0) {
                continue;
            }
            tick(board, bed, 0, day, leo, 1, 7);
            stars--;
            if (stars > 0 && back % 3 != 0) {
                tick(board, bed, 1, day, leo, 1, 19);
                stars--;
            }
        }

        // Mia: nine days in a row up to yesterday, and today still open. 34 stars in all.
        UUID reading = add(
                "nora",
                board,
                HabitCharts.CHART,
                fields(
                        "title",
                        "Reading, 20 minutes",
                        "people",
                        List.of(mia.toString()),
                        "rows",
                        List.of(Map.of("icon", "book"))));
        for (int back = 1; back <= 9; back++) {
            tick(board, reading, 0, today.minusDays(back), mia, 1, 20);
        }
        for (int back = 11; back <= 35; back++) {
            tick(board, reading, 0, today.minusDays(back), mia, 1, 20);
        }

        // The grown-ups: four dinners running, today's included; and Thursdays without screens.
        UUID phones = add(
                "nora",
                board,
                HabitCharts.CHART,
                fields("title", "Phones off the table at dinner", "emoji", "📱", "unit", "dinner"));
        for (int back = 3; back >= 0; back--) {
            tick(board, phones, 0, today.minusDays(back), null, 0, 19);
        }
        UUID screens = add(
                "nora",
                board,
                HabitCharts.CHART,
                fields(
                        "title",
                        "One evening a week with no screens",
                        "emoji",
                        "📺",
                        "people",
                        List.of(linds("nora").toString(), linds("alex").toString()),
                        "days",
                        List.of("thu")));
        LocalDate thursday = today.with(TemporalAdjusters.previous(DayOfWeek.THURSDAY));
        tick(board, screens, 0, thursday, null, 0, 21);
        tick(board, screens, 0, thursday.minusWeeks(1), null, 0, 21);
    }

    private void tick(UUID board, UUID chart, int rowOfChart, LocalDate day, UUID whose, long star, int hour) {
        Instant when = past(day, hour, 5);
        row(board, HabitCharts.TICK)
                .under(chart)
                .by(linds("nora"))
                .forMember(whose)
                .day(day)
                .done(when, linds("nora"))
                .amount(star)
                .doc(new HabitCharts.Tick(rowOfChart))
                .insert();
    }

    // ---------- 17.3 Our story ----------

    private void ourStory(LocalDate began) {
        UUID board = board(
                COUPLE,
                "nora",
                Template.OUR_STORY,
                "Our story",
                fields("since", began, "sinceWords", "a wedding in Piran"));
        add(
                "nora",
                board,
                OurStory.MOMENT,
                fields(
                        "day",
                        began,
                        "label",
                        "Piran",
                        "title",
                        "We met",
                        "text",
                        "At Jana's wedding. You asked if the seat was taken. It was, by your coat.",
                        "star",
                        true,
                        "mediaId",
                        w.photo("nora", "bench.jpg")));
        add(
                "nora",
                board,
                OurStory.MOMENT,
                fields(
                        "day",
                        began.plusMonths(13).withDayOfMonth(1),
                        "precision",
                        "month",
                        "label",
                        "First trip",
                        "title",
                        "Mallorca by kayak",
                        "text",
                        "A journey you kept · 9 days, 212 photos",
                        "from",
                        "journey"));
        add(
                "alex",
                board,
                OurStory.MOMENT,
                fields(
                        "day",
                        began.plusMonths(20).withDayOfMonth(1),
                        "precision",
                        "month",
                        "label",
                        "First flat",
                        "title",
                        "The keys to Trubarjeva",
                        "text",
                        "One mattress, no curtains, a borrowed kettle."));
        LocalDate miaWasBorn = w.jdbc()
                .sql("select birthday from members where id = :id")
                .param("id", linds("mia"))
                .query(LocalDate.class)
                .single();
        add(
                "alex",
                board,
                OurStory.MOMENT,
                fields(
                        "day",
                        miaWasBorn,
                        "label",
                        "Mia",
                        "title",
                        "Three of us",
                        "text",
                        "3,420 grams, at 6:12 in the morning.",
                        "star",
                        true));
    }

    // ---------- 17.4 Tucked notes ----------

    private void tuckedNotes() {
        UUID board = board(COUPLE, "nora", Template.TUCKED_NOTES, "Tucked notes", null);
        UUID nora = two("nora");
        UUID alex = two("alex");
        String[] found = {
            "The bins are out. I am a hero. Act accordingly.",
            "You snore a little. I like it.",
            "There is chocolate behind the flour. Tell no one.",
            "I booked the dentist for you. Thursday, 8:10. Sorry.",
            "You were right about the curtains.",
            "I put petrol in the car. You're welcome.",
            "Thank you for getting up with Leo last night.",
            "The good pen is in my bag. I'll bring it back. Probably.",
            "Dinner is on me on Friday. You pick.",
            "You looked nice this morning. That is all.",
            "I fixed the wobbly chair. Sit down carefully anyway.",
            "The children are asleep and I am proud of us.",
            "Your mother called. I was charming.",
            "I ate the last yoghurt. I regret nothing.",
            "Meet me on the balcony at nine. Bring the blanket.",
            "I miss you already and you are only at the shop.",
            "The song from the wedding was on the radio today.",
            "I ironed one shirt. One. For you.",
            "Remember Piran? I do, about once a day.",
            "You make the best coffee in this postcode.",
            "I hid your phone charger. Kidding. It is in the hall.",
            "Thank you for the school run in the rain.",
            "There is a parcel under the bed. Not yet.",
            "I love how you laugh at your own jokes.",
            "The plants are alive. This is my doing.",
            "Saturday morning is yours. I have the kids.",
            "You left your tea on the stairs again. I drank it.",
            "I am glad it is you.",
            "The car is washed. Don't look at the inside.",
            "Leo says you are the funniest. I said second funniest.",
            "I wrote this instead of doing the dishes.",
            "Good luck today. You know all of it already.",
            "Your keys are in the fruit bowl. As always.",
            "Come to bed. The emails can wait.",
            "Twelve years, and I still look for you at parties.",
        };
        // Thirty-five through the year, from one to the other in turn.
        for (int i = 0; i < found.length; i++) {
            LocalDate day = today.minusDays(18 + 9L * (found.length - 1 - i));
            UUID writer = i % 2 == 0 ? alex : nora;
            UUID reader = i % 2 == 0 ? nora : alex;
            foundNote(board, writer, reader, found[i], TuckedNotes.THIS_WEEK, at(day, 18 + i % 4, 7 * (i % 8)));
        }
        // He found this one at the airport: it was tucked away for when he landed.
        foundNote(
                board,
                nora,
                alex,
                "Look in the left pocket of your coat.",
                TuckedNotes.LANDS,
                at(today.minusDays(12), 16, 40));
        LocalDate tuesday = today.with(TemporalAdjusters.previous(DayOfWeek.TUESDAY));
        foundNote(
                board,
                alex,
                nora,
                "I folded your washing. You're welcome. I love you.",
                TuckedNotes.THIS_WEEK,
                at(tuesday, 22, 14));

        // One from each is tucked away now. Neither knows when the other's turns up.
        add("nora", board, TuckedNotes.NOTE, fields("text", "Your coffee this morning was the best part of my day."));
        add("alex", board, TuckedNotes.NOTE, fields("text", "Check the glove box before you drive on Friday."));
    }

    private void foundNote(UUID board, UUID writer, UUID reader, String text, String way, Instant foundAt) {
        row(board, TuckedNotes.NOTE)
                .by(writer)
                .forMember(reader)
                .opensAt(way.equals(TuckedNotes.LANDS) ? null : foundAt.minusSeconds(5400))
                .done(foundAt, reader)
                .doc(new TuckedNotes.Note(text, way, null))
                .created(foundAt.minusSeconds(3 * 86400))
                .insert();
    }

    // ---------- 17.5 The anniversary questions ----------

    private void anniversary(LocalDate began) {
        UUID board = board(COUPLE, "nora", Template.ANNIVERSARY, "The anniversary questions", fields("since", began));
        UUID nora = two("nora");
        UUID alex = two("alex");
        // The board has been in use since year twelve, which opened on the day; year thirteen is being written.
        w.jdbc()
                .sql("update boards set settings = jsonb_set(settings, '{firstYear}', '12') where thing_id = :id")
                .param("id", board)
                .update();
        w.jdbc()
                .sql(
                        "update board_entries set doc = jsonb_set(doc, '{fromYear}', '12') where board_id = :id and kind = 'question'")
                .param("id", board)
                .update();
        List<UUID> questions = w.jdbc()
                .sql("select id from board_entries where board_id = :id and kind = 'question' order by position, id")
                .param("id", board)
                .query(UUID.class)
                .list();
        String[][] twelve = {
            {"The canoe at Bled, when Mia steered.", "Bled. Obviously Bled."},
            {"Evenings with the phones away.", "Dancing in the kitchen."},
            {"Every school run in January.", "Remembering my mother's birthday. Every year."},
            {"Leo asking if the moon was following our car.", "The tent, the wind, and you holding one pole."},
            {"Norway, all four of us.", "A weekend with nothing in it."},
        };
        LocalDate theDay = began.plusYears(12);
        for (int q = 0; q < twelve.length; q++) {
            answer(board, questions.get(q), nora, 12, twelve[q][0], at(theDay.minusDays(3), 21, 10 + q));
            answer(board, questions.get(q), alex, 12, twelve[q][1], at(theDay.minusDays(1), 23, 30 + q));
        }
        // Year thirteen: his are sealed already; she has written two of hers.
        String[] alexThirteen = {
            "The night we got the sledge stuck.",
            "Mornings without a plan.",
            "The glove box.",
            "Mia's impression of the ferry captain.",
            "Seeing the fjords with you.",
        };
        for (int q = 0; q < alexThirteen.length; q++) {
            answer(board, questions.get(q), alex, 13, alexThirteen[q], past(today.minusDays(4), 22, q));
        }
        answer(
                board,
                questions.get(0),
                nora,
                13,
                "The first snow, and nobody had gloves.",
                past(today.minusDays(2), 21, 0));
        answer(board, questions.get(1), nora, 13, "Walks with no destination.", past(today.minusDays(2), 21, 4));
    }

    private void answer(UUID board, UUID question, UUID who, int year, String text, Instant when) {
        row(board, Anniversary.ANSWER)
                .under(question)
                .by(who)
                .amount(year)
                .done(when, who)
                .doc(new Anniversary.Reply(text))
                .insert();
    }

    // ---------- 17.6 Mystery date ----------

    private void mysteryDate() {
        UUID board = board(COUPLE, "nora", Template.MYSTERY_DATE, "Date night", null);
        UUID nora = two("nora");
        UUID alex = two("alex");
        // Nine dates this year, planned in turn. October's was his.
        String[] past = {
            "A cooking class",
            "Open-air cinema",
            "Mini golf, and he lost",
            "A swim in the lake at dusk",
            "The jazz cellar",
            "Breakfast on the castle hill",
            "A pottery evening",
            "Ice skating, badly",
        };
        for (int back = past.length; back >= 1; back--) {
            LocalDate day = today.minusMonths(back).with(TemporalAdjusters.previousOrSame(DayOfWeek.FRIDAY));
            UUID planner = back % 2 == 1 ? alex : nora;
            row(board, MysteryDate.DATE)
                    .by(planner)
                    .day(day)
                    .opensAt(at(day, 18, 30))
                    .done(at(day, 18, 30), planner)
                    .doc(new MysteryDate.Plan(past[back - 1], "19:30", "Come hungry.", null))
                    .created(at(day.minusDays(6), 21, 0))
                    .insert();
        }
        for (String idea : List.of(
                "A night walk with a thermos",
                "The escape room on Trubarjeva",
                "Karaoke, one song each",
                "A wine tasting in the old town",
                "Bowling in rented shoes",
                "The planetarium",
                "Dumplings we fold ourselves",
                "A ferry there, a train back",
                "Dancing lessons, one evening",
                "The late show at the small cinema",
                "A sauna and a cold lake",
                "Dinner where neither of us has been")) {
            add("nora", board, MysteryDate.IDEA, fields("text", idea));
        }

        // Friday is hers to plan. All he gets is a time and a hint, and two clues that open on the day.
        LocalDate friday = today.with(TemporalAdjusters.next(DayOfWeek.FRIDAY));
        Instant start = friday.atTime(20, 0).atZone(SeedWorld.HOME).toInstant();
        UUID date = add(
                "nora",
                board,
                MysteryDate.DATE,
                fields(
                        "day",
                        friday,
                        "time",
                        "20:00",
                        "at",
                        start,
                        "hint",
                        "Wear something warm.",
                        "title",
                        "Night sledging on Krvavec"));
        add(
                "nora",
                board,
                MysteryDate.LINE,
                fields(
                        "dateId",
                        date,
                        "icon",
                        "pin",
                        "title",
                        "Night sledging on Krvavec",
                        "note",
                        "Two tickets booked"));
        add(
                "nora",
                board,
                MysteryDate.LINE,
                fields(
                        "dateId",
                        date,
                        "icon",
                        "euro",
                        "title",
                        "€46, from the fun pot",
                        "note",
                        "He'll see “a date” in Money, not what",
                        "cents",
                        4600));
        add(
                "nora",
                board,
                MysteryDate.LINE,
                fields(
                        "dateId",
                        date,
                        "icon",
                        "users",
                        "title",
                        "Ines has the children until 23:30",
                        "note",
                        "Her guest pass is ready",
                        "ready",
                        true));
        add(
                "nora",
                board,
                MysteryDate.CLUE,
                fields("dateId", date, "text", "Bring the thick gloves.", "opensAt", start.minusSeconds(4 * 3600)));
        add(
                "nora",
                board,
                MysteryDate.CLUE,
                fields(
                        "dateId",
                        date,
                        "text",
                        "Be at the door at 19:15. We take the car.",
                        "opensAt",
                        start.minusSeconds(3600)));
    }

    // ---------- 17.7 Both said yes ----------

    private void bothYes() {
        UUID board = board(COUPLE, "nora", Template.BOTH_YES, "Both said yes", null);
        UUID nora = two("nora");
        UUID alex = two("alex");
        LocalDate saturday = today.with(TemporalAdjusters.nextOrSame(DayOfWeek.SATURDAY));

        // Dinner on Saturday: she is at the sixth of eight; Thai is what they both said yes to.
        UUID dinner = add(
                "nora",
                board,
                BothYes.DECK,
                fields(
                        "name",
                        "Dinner",
                        "emoji",
                        "🍽️",
                        "day",
                        saturday,
                        "mediaId",
                        w.photo("nora", "heart-hands.jpg")));
        deck(
                board,
                dinner,
                new String[] {
                    "🍜|Thai",
                    "🍕|Pizza from Parma",
                    "🍣|Sushi, the good place",
                    "🍔|Burgers by the river",
                    "🥣|Soup and bread at home",
                    "🌮|Tacos from the place on Trubarjeva",
                    "🍛|The Indian on Poljanska",
                    "🥞|Pancakes, again",
                },
                // y yes, n no, - not answered yet
                "yynny---",
                "ynyn-n--",
                nora,
                alex,
                2);

        UUID film = add(
                "nora",
                board,
                BothYes.DECK,
                fields(
                        "name",
                        "Friday's film",
                        "label",
                        "Film",
                        "emoji",
                        "🎬",
                        "day",
                        today.with(TemporalAdjusters.nextOrSame(DayOfWeek.FRIDAY))));
        deck(
                board,
                film,
                new String[] {
                    "🎬|The one with the lighthouse",
                    "🎬|A heist, any heist",
                    "🎬|The Finnish comedy",
                    "🎬|Something with subtitles",
                    "🎬|The space one, again",
                    "🎬|A documentary about octopuses",
                    "🎬|The musical everyone talks about",
                    "🎬|A black-and-white classic",
                    "🎬|The sequel nobody asked for",
                    "🎬|Whatever is shortest",
                },
                "yny-------",
                "nynnyn----",
                nora,
                alex,
                4);

        UUID summer = add(
                "alex",
                board,
                BothYes.DECK,
                fields("name", "Summer " + (today.getYear() + 1), "label", "Holiday", "emoji", "🌍"));
        deck(
                board,
                summer,
                new String[] {
                    "🏝️|An island with no cars",
                    "🚐|Two weeks in a camper van",
                    "⛰️|The Dolomites, hut to hut",
                    "🏡|Grandma's house by the sea",
                    "🚆|Trains to wherever",
                    "⛺|The same campsite as always",
                },
                "n-y---",
                "ynnyny",
                nora,
                alex,
                6);

        // Names: behind the phone's lock in the app. She has seen 214 of them; six they both like.
        UUID names = add("nora", board, BothYes.DECK, fields("name", "Names", "emoji", "👶", "locked", true));
        String[] all =
                ("Ada Agnes Alma Amalia Ana Anja Astrid Aurora Bela Bina Bruna Cecilia Clara Dora Edith Eli Ella Elsa Ema"
                                + " Emilia Erika Ester Eva Fani Flora Frida Gaja Greta Hana Helena Hedvig Ida Ines Inga Irena Iris"
                                + " Isa Iva Jana Jasna Julija Kaja Karin Katja Klara Lana Lara Laura Lea Lena Lili Lina Liv Lota"
                                + " Lucija Luna Maja Mara Marta Mila Mina Mira Nada Neja Nela Nika Nina Nora Olga Oliva Petra Pia"
                                + " Pika Rita Rosa Runa Saga Sara Signe Sofia Sonja Stina Tea Tilda Tina Tisa Tove Ula Una Ursa"
                                + " Vera Vida Vita Zala Zoja Zora Adam Aksel Aleks Anton Arne Axel Ben Bine Bor Bruno Dan David"
                                + " Edvard Elias Emil Erik Filip Finn Franc Gal Gregor Gustav Hugo Ian Ivan Izak Jaka Jakob Jan"
                                + " Jon Jonas Josip Jure Kai Karl Kasper Klemen Kristian Lars Lenart Leon Lev Lovro Luka Maks"
                                + " Marko Matej Matic Miha Mihael Nace Nejc Nik Niko Nils Noel Oskar Oto Pavel Peter Rok Rudi"
                                + " Samo Sebastian Simon Stefan Sven Tadej Teo Tilen Tim Tine Tobias Tom Urban Uros Val Valter"
                                + " Vid Viktor Vili Vito Zan Ziga Albin Alfred Andrej Bernard Bogdan Bojan Borut Ciril Damjan"
                                + " Darko Domen Drago Edo Ferdo Gaber Gorazd Henrik Igor Janez Joze Lado Marjan Martin Milan"
                                + " Mitja Nande Otmar Primoz Rado Robert Silvo Stane Tomaz Vinko Zdravko Alenka Barbara Breda"
                                + " Darja Jelka Majda Metka Mojca Polona Spela Tatjana Urska Vesna")
                        .split(" ");
        StringBuilder hers = new StringBuilder();
        StringBuilder his = new StringBuilder();
        for (int i = 0; i < all.length; i++) {
            hers.append(i >= 214 ? '-' : i % 7 == 0 ? 'y' : 'n');
            his.append(i % 6 == 0 ? 'y' : 'n');
            all[i] = "|" + all[i];
        }
        deck(board, names, all, hers.toString(), his.toString(), nora, alex, 30);
    }

    /** The ideas of a deck, and what each of the two said to each: y for yes, n for no, - for nothing yet. */
    private void deck(
            UUID board, UUID deck, String[] ideas, String hers, String his, UUID nora, UUID alex, int daysAgo) {
        for (int i = 0; i < ideas.length; i++) {
            String[] idea = ideas[i].split("\\|");
            UUID id = row(board, BothYes.IDEA)
                    .under(deck)
                    .by(nora)
                    .doc(new BothYes.Idea(idea[1], idea[0].isEmpty() ? null : idea[0]))
                    .created(past(today.minusDays(daysAgo + 1), 20, 0))
                    .insert();
            say(board, id, nora, hers.charAt(i), daysAgo);
            say(board, id, alex, his.charAt(i), daysAgo);
        }
    }

    private void say(UUID board, UUID idea, UUID who, char answer, int daysAgo) {
        if (answer == '-') {
            return;
        }
        Instant when = past(today.minusDays(daysAgo), 21, 0);
        row(board, BothYes.SAY)
                .under(idea)
                .by(who)
                .amount(answer == 'y' ? 1 : 0)
                .done(when, who)
                .insert();
    }

    // ---------- 17.8 The fair share ----------

    private void fairShare() {
        UUID board = board(COUPLE, "nora", Template.FAIR_SHARE, "Fair share", null);
        LocalDate lastMonth = today.minusMonths(1).withDayOfMonth(1);
        // Last month, as each of them ticked it: 31 hours and 22.
        claim(board, "Meals", "🍲", two("nora"), 11, lastMonth);
        claim(board, "School things", "🎒", two("nora"), 7, lastMonth);
        claim(board, "Laundry", "🧺", two("nora"), 6, lastMonth);
        claim(board, "Doctor, dentist", "🩺", two("nora"), 4, lastMonth);
        claim(board, "Birthdays", "🎂", two("nora"), 3, lastMonth);
        claim(board, "Bedtimes", "🌙", two("alex"), 9, lastMonth);
        claim(board, "Bins, repairs", "🛠️", two("alex"), 5, lastMonth);
        claim(board, "The car", "🚗", two("alex"), 4, lastMonth);
        claim(board, "Bills", "💶", two("alex"), 2, lastMonth);
        claim(board, "Biscuit", "🐶", two("alex"), 2, lastMonth);
    }

    private void claim(UUID board, String job, String emoji, UUID who, long hours, LocalDate month) {
        UUID id = add("nora", board, FairShare.JOB, fields("name", job, "emoji", emoji));
        row(board, FairShare.CLAIM)
                .under(id)
                .by(who)
                .forMember(who)
                .day(month)
                .amount(hours)
                .created(at(month.plusMonths(1).minusDays(1), 21, 0))
                .insert();
    }

    // ---------- 17.1 What their Today shows from other places ----------

    private void forTheirToday() {
        UUID couple = w.circle(COUPLE);
        UUID nora = w.user("nora");
        // 7:00, Run together: an event in the calendar, for both.
        events.create(
                nora,
                new NewEvent(
                        couple,
                        "Run together",
                        new When(
                                LocalDate.now(SeedWorld.HOME),
                                LocalTime.of(7, 0),
                                null,
                                LocalTime.of(7, 40),
                                SeedWorld.HOME_ZONE),
                        null,
                        "Week 3 of couch to 5K",
                        null,
                        null,
                        null,
                        List.of(
                                new NewGuest(two("nora"), null, null, null),
                                new NewGuest(two("alex"), null, null, null)),
                        null,
                        null),
                UUID.randomUUID());
        // €42: what Alex owes her for last month, kept as a split in Money.
        LocalDate lastMonth = today.minusMonths(1);
        UUID split = splits.create(nora, couple, Phrases.month(lastMonth), "EUR", null, UUID.randomUUID())
                .id();
        splits.addExpense(
                split,
                nora,
                new ExpenseInput(
                        "Groceries and the gas bill",
                        "🧾",
                        8400L,
                        two("nora"),
                        ShareMode.EQUAL,
                        null,
                        lastMonth.with(TemporalAdjusters.lastDayOfMonth())),
                UUID.randomUUID(),
                today);
        someday(couple, nora);
    }

    /** The Someday list the couple's Notes start with, grown to sixty lines with fourteen done, and pinned by both. */
    private void someday(UUID couple, UUID nora) {
        UUID list = w.jdbc()
                .sql(
                        "select id from things where circle_id = :circle and kind = 'checklist' and title = 'Someday' order by created_at limit 1")
                .param("circle", couple)
                .query(UUID.class)
                .optional()
                .orElse(null);
        if (list == null) {
            return; // Notes' own sample data isn't there
        }
        Timestamp changed = w.jdbc()
                .sql("select updated_at from things where id = :id")
                .param("id", list)
                .query(Timestamp.class)
                .single();
        String[] more = {
            "A hot-air balloon at sunrise",
            "Swim in the sea in every month of one year",
            "The night train to Vienna",
            "Grow tomatoes that actually taste of something",
            "See a play in a language neither of us speaks",
            "A week with no screens at all",
            "Learn to make her grandmother's potica",
            "Cycle around Lake Bohinj",
            "A cabin with a wood stove and snow outside",
            "Take the children to Piran, to the same bench",
            "Run ten kilometres together",
            "Paint the bedroom a colour we argue about",
            "A proper dinner party, with candles",
            "See the cherry blossom somewhere far away",
            "Kayak the Soča, the gentle part",
            "A long weekend in Lisbon",
            "Learn ten constellations by heart",
            "Build a bookshelf that stands straight",
            "Spend a whole day in a spa",
            "Walk a stretch of the Alpe Adria Trail",
            "Go to a concert neither of us has heard of",
            "Iceland, in a small car",
            "Make our own wine, once, badly",
            "A photo booth strip every year",
            "Watch the sun rise from Triglav",
            "Take a pottery course together",
            "Sleep in a treehouse",
            "A second honeymoon, wherever the first wasn't",
            "Learn enough Italian to order properly",
            "Plant a tree for each of the children",
            "See the Sahara, or at least a real desert",
            "Renew our vows on that bench in Piran",
            "A road trip with no bookings",
            "Go sailing for a week",
            "Cook our way through one whole cookbook",
            "See whales",
            "Have a garden with an apple tree",
            "Read the same book at the same time",
            "A ski hut at New Year, just us",
            "Find the best burek in the Balkans",
            "Visit every castle in Slovenia",
            "Learn to tango, not only to dance",
            "A hammock for two, and an afternoon",
            "Take the ferry to an island for lunch",
            "See the midnight sun",
            "Write down how we met, before we forget the details",
            "Go back to Mallorca, without the kayak",
            "Host both families for one Christmas",
            "Stay in a hotel in our own town",
            "Climb something with a rope",
            "A film night in the garden, with a sheet",
            "Scotland, by train",
            "Grow old somewhere with a view",
            "Dance at Mia's wedding, if she has one",
        };
        List<UUID> added = new ArrayList<>();
        for (String wish : more) {
            ItemResponse line = lists.add(list, nora, new NewItem(wish, null, null, null, null), UUID.randomUUID());
            added.add(line.id());
        }
        // Two were done already; twelve more make fourteen of sixty.
        for (int i = 0; i < 12; i++) {
            lists.change(
                    added.get(i * 4),
                    i % 2 == 0 ? nora : w.user("alex"),
                    new ItemChange(null, null, null, null, null, null, null, true, null, null));
        }
        folders.pin(list, nora);
        folders.pin(list, w.user("alex"));
        // It was written long ago: it doesn't jump to the top of what changed last in their Notes.
        w.jdbc()
                .sql("update things set updated_at = :at where id = :id")
                .param("at", changed)
                .param("id", list)
                .update();
        w.jdbc()
                .sql("update checklists set edited_at = :at where thing_id = :id")
                .param("at", changed)
                .param("id", list)
                .update();
    }
}

package app.homeport.api.board.templates;

import app.homeport.api.board.BoardService;
import app.homeport.api.board.Json;
import app.homeport.api.board.Template;
import app.homeport.api.plan.Recurrence;
import app.homeport.api.plan.ReminderService;
import app.homeport.api.plan.ReminderService.NewReminder;
import app.homeport.api.seed.SeedWorld;
import app.homeport.api.seed.Seeder;
import java.sql.Timestamp;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneOffset;
import java.time.format.TextStyle;
import java.time.temporal.ChronoUnit;
import java.time.temporal.TemporalAdjusters;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * The flat on Trubarjeva and Lisbon crew, as their screens draw them: the kitty, how the flat splits, its
 * heads-ups, what was heard in the kitchen, the guest book and the roll; the crew's reunion dinner, Secret
 * Santa, where next, the dictionary, predictions, awards and the walk to Lisbon. Dates are counted from the
 * day this runs, so weekdays and distances stay as drawn.
 *
 * <p>Boards are made through the service and filled through it wherever that can be done on the day itself
 * (taps, votes, agreeing), so the rules run on the sample data like on anyone's. What has to lie in the past
 * (last month's kitty, a draw made on the 1st, two years of guests) is written straight into the rows, which
 * is also how the tests move time.
 *
 * <p>Two things on the flat's Today belong to Plan, not to a template: whose turn the bins are, and the
 * boiler nobody has answered about. They are two ordinary reminders, made here because Plan's own sample
 * data has nothing in the flat.
 */
@Component
@ConditionalOnProperty(name = "homeport.seed.enabled", havingValue = "true")
class KindsSeed implements Seeder {

    private static final String FLAT = "flat";
    private static final String CREW = "crew";

    private final BoardService boards;
    private final ReminderService reminders;

    private SeedWorld w;
    private LocalDate today;
    private double next = 1;

    KindsSeed(BoardService boards, ReminderService reminders) {
        this.boards = boards;
        this.reminders = reminders;
    }

    @Override
    public int order() {
        return 75;
    }

    @Override
    public void seed(SeedWorld world) {
        w = world;
        today = LocalDate.now(ZoneOffset.UTC);
        // The flat. Heads-up comes before the split: last month's nights away are counted from it.
        kitty();
        UUID headsUp = headsUp();
        fairerSplit();
        heard();
        guestBook();
        livedHere();
        flatReminders();
        // The crew.
        UUID dinner = findDate();
        secretSanta(dinner);
        whereNext();
        dictionary();
        predictions();
        awards();
        walkTogether();
        // These were set up a while ago: what was changed last is what the screens show as new.
        world.jdbc()
                .sql(
                        "update things set created_at = created_at - interval '20 days', updated_at = updated_at - interval '2 days'"
                                + " where kind = 'board' and circle_id in (:circles)")
                .param("circles", List.of(world.circle(FLAT), world.circle(CREW)))
                .update();
        // The dinner was sent round on Monday; Lea's heads-up is an hour old.
        world.jdbc()
                .sql("update things set created_at = :at where id = :id")
                .param("at", Timestamp.from(at(monday(), 9, 0)))
                .param("id", dinner)
                .update();
        world.jdbc()
                .sql("update things set updated_at = now() - interval '1 hour' where id = :id")
                .param("id", headsUp)
                .update();
    }

    // ---------- helpers ----------

    private UUID board(String circle, String owner, Template template, String title, Map<String, Object> settings) {
        return boards.create(w.user(owner), w.circle(circle), template, title, null, settings, UUID.randomUUID(), today)
                .id();
    }

    private UUID add(String as, UUID board, String kind, Map<String, Object> fields) {
        return boards.add(board, w.user(as), kind, fields, UUID.randomUUID(), today)
                .entryId();
    }

    private void act(String as, UUID board, String verb, Map<String, Object> body) {
        boards.act(board, w.user(as), verb, body, today);
    }

    private static Instant at(LocalDate day, int hour, int minute) {
        return day.atTime(LocalTime.of(hour, minute)).toInstant(ZoneOffset.UTC);
    }

    private LocalDate monday() {
        return today.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
    }

    /** A day of this month that has already come: the day asked for, or today when that is still ahead. */
    private LocalDate thisMonth(int dayOfMonth) {
        LocalDate day = today.withDayOfMonth(Math.min(dayOfMonth, today.lengthOfMonth()));
        return day.isAfter(today) ? today : day;
    }

    private static String month(LocalDate day) {
        return day.getMonth().getDisplayName(TextStyle.FULL, Locale.ENGLISH);
    }

    /** A row written as it would stand after some time: for what lies in the past. */
    private UUID row(
            UUID board,
            String kind,
            UUID parent,
            UUID author,
            UUID forMember,
            Object doc,
            LocalDate day,
            Instant doneAt,
            UUID doneBy,
            UUID mediaId,
            Long amount,
            Instant createdAt) {
        UUID id = UUID.randomUUID();
        w.jdbc()
                .sql("""
            insert into board_entries (id, board_id, parent_id, kind, author_id, for_id, doc, day, done_at, done_by,
              media_id, amount, position, created_at, updated_at)
            values (:id, :board, :parent, :kind, :author, :for, cast(:doc as jsonb), :day, :done, :doneBy, :media,
              :amount, :position, :created, :created)
            """)
                .param("id", id)
                .param("board", board)
                .param("parent", parent)
                .param("kind", kind)
                .param("author", author)
                .param("for", forMember)
                .param("doc", Json.text(Json.tree(doc)))
                .param("day", day)
                .param("done", doneAt == null ? null : Timestamp.from(doneAt))
                .param("doneBy", doneBy)
                .param("media", mediaId)
                .param("amount", amount)
                .param("position", day == null ? next++ : day.toEpochDay() + (next++ % 1000) / 1000.0)
                .param("created", Timestamp.from(createdAt == null ? Instant.now() : createdAt))
                .update();
        return id;
    }

    private void backdate(UUID entry, Instant createdAt) {
        w.jdbc()
                .sql("update board_entries set created_at = :at, updated_at = :at where id = :id")
                .param("at", Timestamp.from(createdAt))
                .param("id", entry)
                .update();
    }

    private static Map<String, Object> fields(Object... pairs) {
        Map<String, Object> map = new LinkedHashMap<>();
        for (int i = 0; i < pairs.length; i += 2) {
            if (pairs[i + 1] != null) {
                map.put(
                        (String) pairs[i],
                        pairs[i + 1] instanceof UUID || pairs[i + 1] instanceof LocalDate
                                ? pairs[i + 1].toString()
                                : pairs[i + 1]);
            }
        }
        return map;
    }

    private UUID flat(String who) {
        return w.member(FLAT, who);
    }

    private UUID crew(String who) {
        return w.member(CREW, who);
    }

    // ---------- 18.3 the kitty ----------

    /** €10 left over from last month, €20 paid in, €14.70 and €8.90 spent: €6.40. Lena hasn't paid in, and it's her turn to shop. */
    private void kitty() {
        UUID kitty = board(FLAT, "kai", Template.KITTY, "The kitty", fields("eachCents", 1000));
        add("kai", kitty, Kitty.ITEM, fields("name", "Coffee"));
        Kitty.KittyViewResponse view = (Kitty.KittyViewResponse)
                boards.get(kitty, w.user("kai"), today, null).view();
        act("lea", kitty, "low", fields("itemId", view.items().get(0).id()));

        LocalDate lastMonth = today.withDayOfMonth(1).minusMonths(1);
        for (String who : List.of("kai", "lea", "lena")) {
            row(
                    kitty,
                    Kitty.IN,
                    null,
                    flat(who),
                    flat(who),
                    Map.of(),
                    lastMonth,
                    null,
                    null,
                    null,
                    1000L,
                    at(lastMonth, 9, 0));
        }
        row(
                kitty,
                Kitty.OUT,
                null,
                flat("lena"),
                flat("lena"),
                new Kitty.Bought("Dish soap, sponges, washing powder"),
                lastMonth.plusDays(14),
                null,
                null,
                null,
                2000L,
                at(lastMonth.plusDays(14), 18, 30));
        LocalDate first = thisMonth(1);
        for (String who : List.of("kai", "lea")) {
            row(
                    kitty,
                    Kitty.IN,
                    null,
                    flat(who),
                    flat(who),
                    Map.of(),
                    first,
                    null,
                    null,
                    null,
                    1000L,
                    at(first, 8, 30));
        }
        LocalDate second = thisMonth(2);
        row(
                kitty,
                Kitty.OUT,
                null,
                flat("kai"),
                flat("kai"),
                new Kitty.Bought("Olive oil, salt, sponges"),
                second,
                null,
                null,
                null,
                1470L,
                at(second, 17, 10));
        // "Tuesday", unless this month is younger than that.
        LocalDate tuesday = today.with(TemporalAdjusters.previousOrSame(DayOfWeek.TUESDAY));
        LocalDate shopped = tuesday.isBefore(second) ? second : tuesday;
        row(
                kitty,
                Kitty.OUT,
                null,
                flat("lea"),
                flat("lea"),
                new Kitty.Bought("Loo roll, bin bags"),
                shopped,
                null,
                null,
                w.photo("lea", "coffee-receipt.jpg"),
                890L,
                at(shopped, 18, 5));
    }

    // ---------- 18.5 heads-up ----------

    private UUID headsUp() {
        UUID board = board(
                FLAT,
                "kai",
                Template.HEADS_UP,
                "Heads-up",
                fields(
                        "standing",
                        "Quiet after 23:00 on weeknights",
                        "standingNote",
                        "From the House rules, agreed by all three."));
        // Last month's nights away, which the electricity is split by: Lea one night, Kai five, Lena nineteen.
        LocalDate from = billFrom();
        UUID leaAway = add(
                "lea",
                board,
                HeadsUp.NOTICE,
                fields(
                        "text",
                        "Away for a night",
                        "what",
                        "away",
                        "from",
                        from.plusDays(9),
                        "until",
                        from.plusDays(10)));
        UUID kaiAway = add(
                "kai",
                board,
                HeadsUp.NOTICE,
                fields(
                        "text",
                        "Away for five nights",
                        "what",
                        "away",
                        "from",
                        from.plusDays(12),
                        "until",
                        from.plusDays(17)));
        UUID lenaAway = add(
                "lena",
                board,
                HeadsUp.NOTICE,
                fields("text", "At my parents' for a while", "what", "away", "from", from, "until", from.plusDays(19)));
        backdate(leaAway, at(from.plusDays(7), 19, 0));
        backdate(kaiAway, at(from.plusDays(10), 19, 0));
        backdate(lenaAway, at(from.minusDays(2), 19, 0));

        // Kai is away for a week, from the Friday after next.
        LocalDate leaves = monday().plusDays(11);
        LocalDate back = leaves.plusDays(7);
        UUID away = add(
                "kai",
                board,
                HeadsUp.NOTICE,
                fields(
                        "text",
                        "I'm away " + leaves.getDayOfMonth()
                                + (leaves.getMonth() == back.getMonth() ? "" : " " + month(leaves)) + " to "
                                + back.getDayOfMonth() + " " + month(back),
                        "what",
                        "away",
                        "from",
                        leaves,
                        "until",
                        back));
        act("lea", board, "answer", fields("noticeId", away, "says", "fine", "text", "will water the plants"));
        backdate(away, Instant.now().minus(3, ChronoUnit.DAYS));

        // Lena's sister, this Friday to Sunday. Everyone said fine.
        LocalDate friday = monday().plusDays(4);
        UUID sister = add(
                "lena",
                board,
                HeadsUp.NOTICE,
                fields(
                        "text",
                        "My sister's staying, Friday to Sunday",
                        "detail",
                        "on the sofa",
                        "what",
                        "guests",
                        "from",
                        friday,
                        "until",
                        friday.plusDays(2)));
        act("kai", board, "answer", fields("noticeId", sister, "says", "fine"));
        act("lea", board, "answer", fields("noticeId", sister, "says", "fine"));
        backdate(sister, Instant.now().minus(1, ChronoUnit.DAYS));

        // Lea's Saturday, an hour ago. Lena is fine with it; Kai hasn't answered.
        UUID saturday = add(
                "lea",
                board,
                HeadsUp.NOTICE,
                fields(
                        "text",
                        "Six people over on Saturday, done by midnight",
                        "what",
                        "guests",
                        "from",
                        today.with(TemporalAdjusters.nextOrSame(DayOfWeek.SATURDAY))));
        act("lena", board, "answer", fields("noticeId", saturday, "says", "fine"));
        backdate(saturday, Instant.now().minus(1, ChronoUnit.HOURS));
        return board;
    }

    /** The 31 days the electricity bill is for: they end on the last day of last month. */
    private LocalDate billFrom() {
        return today.withDayOfMonth(1).minusDays(1).minusDays(30);
    }

    // ---------- 18.4 a fairer split ----------

    private void fairerSplit() {
        UUID board = board(FLAT, "kai", Template.FAIRER_SPLIT, "How we split", Map.of());
        // The rent: by room size with 20 m² shared, then nudged by hand to round numbers. Agreed on 1 September.
        UUID rent = add(
                "kai",
                board,
                FairerSplit.SPLIT,
                fields(
                        "name",
                        "Rent",
                        "group",
                        "rent",
                        "way",
                        "room",
                        "totalCents",
                        95000,
                        "shared",
                        20,
                        "parts",
                        List.of(
                                fields("memberId", flat("kai"), "measure", 18, "note", "the big room", "cents", 37200),
                                fields("memberId", flat("lea"), "measure", 14, "cents", 31000),
                                fields(
                                        "memberId",
                                        flat("lena"),
                                        "measure",
                                        11,
                                        "note",
                                        "facing the street",
                                        "cents",
                                        26800))));
        UUID pot = add(
                "kai",
                board,
                FairerSplit.SPLIT,
                fields("name", "The kitty", "group", "kitty", "way", "equal", "totalCents", 3000));
        // October's electricity, by nights at home: Lea 30, Kai 26, Lena 12 of 31. Lea paid the bill.
        LocalDate from = billFrom();
        UUID electricity = add(
                "lea",
                board,
                FairerSplit.SPLIT,
                fields(
                        "name",
                        "Electricity",
                        "group",
                        "bills",
                        "way",
                        "nights",
                        "totalCents",
                        15900,
                        "from",
                        from,
                        "to",
                        from.plusDays(30),
                        "payerMemberId",
                        flat("lea")));
        for (UUID split : List.of(rent, pot, electricity)) {
            UUID proposal = w.jdbc()
                    .sql("select id from board_entries where parent_id = :split and kind = 'proposal'")
                    .param("split", split)
                    .query(UUID.class)
                    .single();
            for (String who : List.of("kai", "lea", "lena")) {
                act(who, board, "agree", fields("proposalId", proposal));
            }
        }
        // The rent and the kitty were agreed on 1 September; the bill a week ago.
        LocalDate september = LocalDate.of(today.getYear(), 9, 1);
        Instant agreed = at(september.isAfter(today) ? september.minusYears(1) : september, 19, 30);
        w.jdbc()
                .sql("""
            update board_entries set done_at = :at, created_at = cast(:at as timestamptz) - interval '2 days'
            where kind = 'proposal' and parent_id in (:splits)
            """)
                .param("at", Timestamp.from(agreed))
                .param("splits", List.of(rent, pot))
                .update();
        w.jdbc()
                .sql(
                        "update board_entries set done_at = now() - interval '7 days' where kind = 'proposal' and parent_id = :split")
                .param("split", electricity)
                .update();
    }

    // ---------- 18.6 heard in the kitchen ----------

    /** 112 lines: Lea 44, Lena 38, Kai 30. */
    private void heard() {
        UUID board = board(FLAT, "lea", Template.HEARD, "Heard in the kitchen", Map.of());
        LocalDate sunday = today.with(TemporalAdjusters.previousOrSame(DayOfWeek.SUNDAY));
        quote(board, "lea", "kai", "I'm not hungover. I'm buffering.", null, sunday, at(sunday, 11, 40));
        quote(
                board,
                "kai",
                "lena",
                "That's not mould. That's character.",
                "about the bathroom ceiling",
                sunday.minusDays(9),
                at(sunday.minusDays(9), 21, 5));
        quote(
                board,
                "lena",
                "lea",
                "Whose turn is it to have opinions about the heating?",
                "the first cold night",
                sunday.minusDays(23),
                at(sunday.minusDays(23), 22, 15));
        // A hundred and nine more, two days apart: 43 from Lea, 37 from Lena, 29 from Kai.
        int[] left = {43, 37, 29};
        String[] who = {"lea", "lena", "kai"};
        int[] of = {43, 37, 29};
        for (int n = 0; n < 109; n++) {
            int pick = 0;
            for (int i = 1; i < 3; i++) {
                if ((long) left[i] * of[pick] > (long) left[pick] * of[i]) {
                    pick = i;
                }
            }
            left[pick]--;
            LocalDate day = sunday.minusDays(30 + 2L * n);
            quote(
                    board,
                    who[pick],
                    who[(pick + 1) % 3],
                    MORE_HEARD.get(n % MORE_HEARD.size()),
                    null,
                    day,
                    at(day, 20, 45));
        }
    }

    private void quote(
            UUID board, String saidBy, String writtenBy, String text, String about, LocalDate day, Instant at) {
        row(
                board,
                Heard.QUOTE,
                null,
                flat(writtenBy),
                flat(saidBy),
                new Heard.Quote(text, null, about),
                day,
                null,
                null,
                null,
                null,
                at);
    }

    private static final List<String> MORE_HEARD = List.of(
            "I'm not late. The clock is early.",
            "Who put the empty carton back? It wasn't me, and I live alone in this argument.",
            "That pan is soaking. It has been soaking since March.",
            "I'll do the dishes when the dishes have earned it.",
            "It's not a mess. It's a system you don't understand.",
            "We don't need a plumber. We need optimism.",
            "The fridge is making that noise again. I think it's lonely.",
            "I only had one biscuit. From each packet.",
            "Is this milk fine? Define fine.",
            "Somebody's alarm has been going since seven. It's mine. I know. I'm ignoring it.",
            "The landlord said soon. Soon is a mood, not a date.",
            "I cleaned the bathroom. With my eyes. It looks fine.",
            "This plant is thriving on neglect, like all of us.",
            "Whoever buys the next loo roll is a hero and we won't forget it.",
            "I'm not using your shampoo. I'm testing it for you.",
            "Dinner is whatever is in the freezer, with confidence.",
            "The Wi‑Fi is slow because someone is downloading their feelings.",
            "I'll be five minutes. Flat time.",
            "That's not my hair in the drain. Mine is better behaved.",
            "We agreed on quiet after eleven. The washing machine didn't sign.",
            "If the bins could talk they'd ask for you by name.",
            "I'm having a salad. On top of the pizza.",
            "The boiler works if you believe in it.",
            "Don't move that. It's holding the shelf up.",
            "I labelled my cheese. Someone ate the label.",
            "It's not a third coffee. It's the first one, continued.",
            "We should have a flat meeting. Not now. Never, ideally.",
            "The neighbours aren't loud. We're just very quiet people today.",
            "I could cook, but then we'd have to talk about what happened.",
            "That jacket has lived on that chair longer than Lena has lived here.",
            "The heating is on. Emotionally.",
            "I'm not hiding the good mugs. I'm protecting them.",
            "There are two kinds of people: those who rinse, and Kai.",
            "It's fine. Everything is fine. Don't open the oven.",
            "I didn't forget the rent. I was building suspense.",
            "One day we'll miss this kitchen. Not today.");

    // ---------- 18.7 the guest book ----------

    /** 23 guests and 61 nights since the year before last. All of them let in; nothing is waiting. */
    private void guestBook() {
        UUID board = board(FLAT, "kai", Template.GUEST_BOOK, "The guest book", Map.of());
        LocalDate tom = today.withDayOfMonth(1).minusMonths(1).plusDays(11);
        LocalDate maja = tom.minusDays(25);
        LocalDate newYear = LocalDate.of(maja.getYear(), 1, 1);
        guest(
                board,
                "Tom",
                "from Leeds",
                "Came for a weekend, stayed for the pancakes.",
                3L,
                tom,
                "breakfast.jpg",
                "lea");
        guest(
                board,
                "Maja",
                "Lena's sister",
                "Best sofa in Ljubljana. Sorry about the glass.",
                2L,
                maja,
                "mugs.jpg",
                "lena");
        guest(
                board,
                "Ana",
                "who used to live here",
                "Thank you for New Year. I remember most of it.",
                null,
                newYear,
                "sparkler.jpg",
                "kai");
        // Twenty more, back to the spring of the year before last: 56 nights between them.
        LocalDate first = LocalDate.of(today.getYear() - 2, 3, 14);
        long span = ChronoUnit.DAYS.between(first, newYear.minusDays(20));
        for (int n = 0; n < MORE_GUESTS.size(); n++) {
            String[] guest = MORE_GUESTS.get(n).split("\\|");
            guest(
                    board,
                    guest[0],
                    guest[1].isEmpty() ? null : guest[1],
                    guest[3],
                    Long.parseLong(guest[2]),
                    first.plusDays(span * n / (MORE_GUESTS.size() - 1)),
                    null,
                    List.of("kai", "lea", "kai").get(n % 3));
        }
    }

    private void guest(
            UUID board,
            String name,
            String about,
            String text,
            Long nights,
            LocalDate day,
            String photo,
            String letInBy) {
        row(
                board,
                GuestBook.LINE,
                null,
                null,
                null,
                new GuestBook.Line(name, about, text, null, true),
                day,
                at(day.plusDays(1), 10, 0),
                flat(letInBy),
                photo == null ? null : w.photo("kai", photo),
                nights,
                at(day, 9, 30));
    }

    /** name | who they are | nights | their line */
    private static final List<String> MORE_GUESTS = List.of(
            "Jure|Kai's brother|2|First guest. The sofa is longer than it looks.",
            "Petra|from Maribor|1|Thanks for the bed and the terrible advice.",
            "Oskar|Lea's cousin|4|Four nights, three films, two arguments about pineapple.",
            "Nina||2|The balcony at seven in the morning. That's all.",
            "Luca|from Trieste|3|Came for the concert. Stayed for the soup.",
            "Sara|from Graz|2|You have very loud pipes and very kind hearts.",
            "Tilen||1|Missed the last bus on purpose.",
            "Eva|Ana's friend|5|Five nights and nobody asked when I was leaving.",
            "Marko|from Zagreb|2|I fixed your shelf. You're welcome. Don't lean on it.",
            "Hana|from Prague|4|The best breakfast table in the city.",
            "Jon|from Bergen|3|It never rains here. I don't understand it.",
            "Zala|Lea's sister|2|I'm taking the blue blanket. Not really. Maybe.",
            "Filip||1|Thanks for the charger and the couch.",
            "Iris|from Vienna|3|Kai's playlist needs work. Everything else: perfect.",
            "Bine|from Koper|2|Brought wine, left with a plant cutting.",
            "Mila|from Belgrade|4|I've slept worse in hotels with stars.",
            "Rok||2|The stairs are a workout. The view is the reward.",
            "Anja|from Kranj|3|Whoever made the lasagne: marry me.",
            "David|from Lyon|6|Six nights. I know where the good mugs are now.",
            "Katja|Ana's sister|4|Came to help Ana move out. Cried on your sofa.");

    // ---------- 18.8 everyone who's lived here ----------

    private void livedHere() {
        UUID board = board(FLAT, "kai", Template.LIVED_HERE, "Trubarjeva 9, flat 3", Map.of());
        int year = today.getYear();
        add(
                "kai",
                board,
                LivedHere.RESIDENT,
                fields("memberId", flat("lena"), "fromYear", year, "note", "The small room, facing the street"));
        add("kai", board, LivedHere.RESIDENT, fields("memberId", flat("lea"), "fromYear", year - 2));
        add("kai", board, LivedHere.RESIDENT, fields("memberId", flat("kai"), "fromYear", year - 3));
        add(
                "kai",
                board,
                LivedHere.RESIDENT,
                fields(
                        "memberId",
                        flat("ana"),
                        "fromYear",
                        year - 3,
                        "untilYear",
                        year - 1,
                        "note",
                        "Moved to Lisbon. Still in the photos, off the Wi‑Fi."));
        add(
                "kai",
                board,
                LivedHere.BEFORE,
                fields(
                        "name",
                        "Two people before you",
                        "count",
                        2,
                        "fromYear",
                        year - 5,
                        "untilYear",
                        year - 3,
                        "note",
                        "Left the house manual and a cactus"));
        for (String title : List.of("House rules", "Bin days", "Who to call")) {
            w.jdbc()
                    .sql(
                            "select id from things where circle_id = :circle and title = :title order by created_at limit 1")
                    .param("circle", w.circle(FLAT))
                    .param("title", title)
                    .query(UUID.class)
                    .optional()
                    .ifPresent(thing -> add("kai", board, LivedHere.HANDED_ON, fields("thingId", thing)));
        }
    }

    // ---------- 18.1 two lines of the flat's Today that are Plan's ----------

    private void flatReminders() {
        reminders.create(
                w.user("kai"),
                new NewReminder(
                        w.circle(FLAT),
                        "Bins out",
                        null,
                        today,
                        LocalTime.of(20, 0),
                        "UTC",
                        null,
                        new Recurrence(Recurrence.Unit.WEEK, 1, null, null),
                        List.of(flat("lena"), flat("kai"), flat("lea")),
                        true,
                        null,
                        null,
                        null,
                        null),
                UUID.randomUUID());
        reminders.create(
                w.user("kai"),
                new NewReminder(
                        w.circle(FLAT),
                        "The boiler: no answer from the landlord",
                        "Reported to Mr Zupan by email. The service number is on the boiler's door.",
                        today.minusDays(12),
                        null,
                        "UTC",
                        null,
                        null,
                        List.of(),
                        false,
                        null,
                        null,
                        null,
                        null),
                UUID.randomUUID());
    }

    // ---------- 19.3 when can everyone? ----------

    /** Three weeks from next Monday. The second Saturday works for the four who answered; Kai has only looked. */
    private UUID findDate() {
        LocalDate from = monday().plusDays(7);
        UUID board =
                board(CREW, "lea", Template.FIND_DATE, "Reunion dinner", fields("from", from, "to", from.plusDays(20)));
        Map<String, int[]> free = new LinkedHashMap<>();
        free.put("lea", new int[] {2, 4, 5, 10, 11, 12, 18, 19});
        free.put("lena", new int[] {4, 6, 10, 11, 12, 13, 18, 20});
        free.put("ana", new int[] {5, 6, 11, 12, 13, 16, 19});
        free.put("nora", new int[] {4, 5, 9, 12, 13, 18, 19, 20});
        free.forEach((who, days) -> {
            for (int day : days) {
                act(who, board, "tap", fields("day", from.plusDays(day)));
            }
        });
        act("kai", board, "opened", Map.of());
        return board;
    }

    // ---------- 19.4 Secret Santa ----------

    /** Drawn on the 1st. Nora has Lena; nobody can see more than their own. Lea and Kai can't draw each other. */
    private void secretSanta(UUID dinner) {
        LocalDate swap = monday().plusDays(19);
        UUID board = board(
                CREW,
                "lea",
                Template.SECRET_SANTA,
                "Secret Santa",
                fields("budgetCents", 2500, "swapOn", swap, "swapAt", "the reunion dinner", "swapThingId", dinner));
        add(
                "lea",
                board,
                SecretSanta.APART,
                fields("memberId", crew("lea"), "otherMemberId", crew("kai"), "why", "They're a couple"));
        add("lena", board, SecretSanta.WISH, fields("text", "A plant that is hard to kill"));
        add("lena", board, SecretSanta.WISH, fields("text", "Anything from the ceramics stall"));
        add("nora", board, SecretSanta.WISH, fields("text", "Good walking socks"));
        add("nora", board, SecretSanta.WISH, fields("text", "A roll of 35 mm film"));
        add("kai", board, SecretSanta.WISH, fields("text", "A travel mug that doesn't leak"));
        add("ana", board, SecretSanta.WISH, fields("text", "Olive oil from that shop in Alfama"));
        add("lea", board, SecretSanta.WISH, fields("text", "Surprise me"));
        // The draw lies in the past, and the screen says who Nora has: written as it was drawn that day.
        LocalDate drawnOn = today.withDayOfMonth(1);
        String[][] drawn = {{"nora", "lena"}, {"lena", "kai"}, {"kai", "ana"}, {"ana", "lea"}, {"lea", "nora"}};
        for (String[] pair : drawn) {
            row(
                    board,
                    SecretSanta.DRAWN,
                    null,
                    null,
                    crew(pair[0]),
                    new SecretSanta.Drawn(crew(pair[1])),
                    null,
                    null,
                    null,
                    null,
                    null,
                    at(drawnOn, 20, 0));
        }
        w.jdbc()
                .sql(
                        "update boards set settings = jsonb_set(settings, '{drawnOn}', to_jsonb(cast(:day as text))) where thing_id = :id")
                .param("day", drawnOn.toString())
                .param("id", board)
                .update();
    }

    // ---------- 19.5 where next? ----------

    /** Five of five voted, so the vote is closed: Porto three, the Soča valley one, Sicily one. */
    private void whereNext() {
        UUID board = board(
                CREW, "nora", Template.WHERE_NEXT, "Where next?", fields("when", "Spring " + (today.getYear() + 1)));
        UUID porto = add(
                "nora",
                board,
                WhereNext.IDEA,
                fields("name", "Porto", "days", 4, "costCents", 31000, "mediaId", w.photo("nora", "sea-cave.jpg")));
        UUID soca = add(
                "kai",
                board,
                WhereNext.IDEA,
                fields(
                        "name",
                        "The Soča valley, by bike",
                        "days",
                        3,
                        "costCents",
                        18000,
                        "mediaId",
                        w.photo("kai", "terraces.jpg")));
        UUID sicily = add(
                "lena",
                board,
                WhereNext.IDEA,
                fields("name", "Sicily", "days", 6, "costCents", 52000, "mediaId", w.photo("lena", "el-nido.jpg")));
        act("nora", board, "vote", fields("ideaId", porto));
        act("lea", board, "vote", fields("ideaId", porto));
        act("kai", board, "vote", fields("ideaId", soca));
        act("lena", board, "vote", fields("ideaId", sicily));
        act("ana", board, "vote", fields("ideaId", porto));
    }

    // ---------- 19.6 the dictionary ----------

    /** 31 words. "doing a Kai" is two days old, first recorded on a Sunday five weeks back. */
    private void dictionary() {
        UUID board = board(CREW, "lea", Template.DICTIONARY, "The dictionary", Map.of());
        LocalDate airport =
                today.with(TemporalAdjusters.previousOrSame(DayOfWeek.SUNDAY)).minusWeeks(5);
        word(
                board,
                "lea",
                "doing a Kai",
                "verb",
                "Reaching the gate as it closes, with a pastry.",
                "Lisbon airport",
                null,
                airport,
                today.minusDays(2),
                w.photo("lea", "cappadocia.jpg"));
        word(
                board,
                "ana",
                "the Ramiro incident",
                "noun",
                "We don't talk about the bill.",
                null,
                "just one more plate",
                null,
                today.minusDays(9),
                null);
        word(
                board,
                "nora",
                "second breakfast",
                "noun",
                "Not optional. Scheduled.",
                "every trip since 2019",
                null,
                null,
                today.minusDays(16),
                null);
        for (int n = 0; n < MORE_WORDS.size(); n++) {
            String[] word = MORE_WORDS.get(n).split("\\|");
            word(board, word[0], word[1], word[2], word[3], null, null, null, today.minusDays(30 + 17L * n), null);
        }
    }

    private void word(
            UUID board,
            String by,
            String word,
            String part,
            String meaning,
            String origin,
            String seeAlso,
            LocalDate firstRecorded,
            LocalDate added,
            UUID photo) {
        UUID id = row(
                board,
                Dictionary.WORD,
                null,
                crew(by),
                crew(by),
                new Dictionary.Word(word, part, meaning, origin, seeAlso, null),
                added,
                null,
                null,
                photo,
                null,
                at(added, 19, 20));
        // The row's day placed it by the day it was added; the day kept is the one it was first recorded on.
        w.jdbc()
                .sql("update board_entries set day = :day where id = :id")
                .param("day", firstRecorded)
                .param("id", id)
                .update();
    }

    /** who coined it | the word | what kind | what it means */
    private static final List<String> MORE_WORDS = List.of(
            "kai|just one more plate|noun|The plate after the last plate. See: the Ramiro incident.",
            "lena|a Lena left|noun|A confident turn in the wrong direction.",
            "nora|tram o'clock|noun|Any time at which running would have helped.",
            "ana|the good bench|noun|The one with the view. Everyone knows which.",
            "lea|to pastel|verb|To stop for a custard tart when already late.",
            "kai|gate cardio|noun|The sprint from security to boarding.",
            "nora|hill tax|noun|What Lisbon charges for every nice view.",
            "lena|a quiet one|noun|A night out that ends at four.",
            "ana|sardine o'clock|noun|When the grill smoke decides dinner for you.",
            "lea|the long way|noun|The way Kai insists is shorter.",
            "kai|to tile|verb|To stop walking in order to photograph a wall.",
            "nora|a full Ana|noun|Knowing a person in every café on the street.",
            "lena|suitcase maths|noun|Proving that seven jumpers fit in a carry-on.",
            "ana|a soft no|noun|\"Let's see how we feel.\"",
            "lea|group nap|noun|Five people, one sofa, no plan.",
            "kai|the spare day|noun|The day nobody planned and everybody remembers.",
            "nora|to viewpoint|verb|To climb for twenty minutes and say it was worth it.",
            "lena|menu panic|noun|Ordering last and copying whoever went first.",
            "ana|a Lea list|noun|A list with times on it. Followed by nobody.",
            "lea|bag jail|noun|Where the wine goes when it won't fit in hand luggage.",
            "kai|the debrief|noun|Breakfast, the morning after, with sunglasses.",
            "nora|crumb evidence|noun|How we know who had second breakfast twice.",
            "lena|to fado|verb|To go quiet in a small room and feel things.",
            "ana|taxi diplomacy|noun|Deciding who sits in the front.",
            "lea|a Nora window|noun|Exactly forty minutes without children.",
            "kai|the kitty face|noun|The look when the shared money runs out.",
            "nora|last tram energy|noun|Sudden speed nobody knew they had.",
            "lena|home legs|noun|What arrives two days after you do.");

    // ---------- 19.7 predictions ----------

    /** Lea and Lena have written all four, Ana two, Nora three (the one about Kai is missing), Kai none. */
    private void predictions() {
        int year = today.getYear() + 5;
        UUID board = board(
                CREW,
                "lea",
                Template.PREDICTIONS,
                "Predictions for " + year,
                fields("opensOn", LocalDate.of(year, 10, 4), "occasion", "the reunion"));
        predict(board, "lea", "nora", "Runs a bookshop with a café in it. The café makes the money.");
        predict(board, "lea", "kai", "Still late. Now with a child who is also late.");
        predict(board, "lea", "lena", "Lives somewhere with a mountain in the window.");
        predict(board, "lea", "ana", "Has opened the restaurant. We eat there for free, once.");
        predict(board, "lena", "lea", "Has a spreadsheet for her spreadsheets, and a boat.");
        predict(board, "lena", "nora", "Has walked a very long path and written about it.");
        predict(board, "lena", "kai", "Owns exactly one suit and has worn it to all our weddings.");
        predict(board, "lena", "ana", "Speaks Portuguese better than the Portuguese.");
        predict(board, "ana", "lea", "Married to Kai. He was late to that too.");
        predict(board, "ana", "nora", "Still the only one of us who replies on the same day.");
        predict(board, "nora", "lea", "Organises the reunion, and has a laminated plan for it.");
        predict(board, "nora", "lena", "Has moved three more times and loves every flat.");
        predict(board, "nora", "ana", "Knows every baker in Lisbon by first name.");
    }

    private void predict(UUID board, String by, String about, String text) {
        add(by, board, Predictions.PREDICTION, fields("aboutMemberId", crew(about), "text", text));
    }

    // ---------- 19.8 the awards ----------

    /** Three decided because all five voted, two still open, and three earlier years on the shelf. */
    private void awards() {
        int year = today.getYear();
        UUID board = board(CREW, "lea", Template.AWARDS, "The " + year + " awards", Map.of());
        award(
                board,
                "Most likely to miss the flight",
                "🏆",
                new String[][] {{"kai", null, null}, {"lea", "the Porto bus", null}},
                new String[][] {{"lea", "0"}, {"nora", "0"}, {"lena", "0"}, {"kai", "0"}, {"ana", "1"}});
        award(
                board,
                "Find of the year",
                "🏆",
                new String[][] {{"lena", "the tiled bar in Alfama", null}, {"ana", "the bakery with no sign", null}},
                new String[][] {{"nora", "0"}, {"lea", "0"}, {"kai", "0"}, {"lena", "1"}, {"ana", "1"}});
        award(
                board,
                "Photo of the year",
                "📷",
                new String[][] {
                    {"ana", "the market at six in the morning", "market.jpg"}, {"nora", "the tram in the rain", null}
                },
                new String[][] {{"nora", "0"}, {"lea", "0"}, {"kai", "0"}, {"lena", "0"}, {"ana", "1"}});
        award(
                board,
                "Worst idea that worked",
                "🏆",
                new String[][] {
                    {"kai", "booking the 6 a.m. flight", null}, {"lea", "the shortcut through the cemetery", null}
                },
                new String[][] {{"lea", "0"}, {"ana", "1"}, {"kai", "1"}});
        award(
                board,
                "Best thing anyone cooked",
                "🏆",
                new String[][] {{"ana", "the clams", null}, {"lena", "second breakfast, obviously", null}},
                new String[][] {{"lena", "0"}, {"kai", "0"}});
        // Earlier years: decided long ago.
        String[][] before = {
            {"1", "Best wrong turn", "lena"},
            {"1", "Most improved packer", "nora"},
            {"2", "Loudest laugh", "ana"},
            {"2", "Best worst hostel", "kai"},
            {"3", "Founder of the crew", "lea"},
            {"3", "First to fall asleep", "kai"}
        };
        for (String[] past : before) {
            int then = year - Integer.parseInt(past[0]);
            Instant decided = at(LocalDate.of(then, 12, 31), 23, 0);
            UUID award = row(
                    board,
                    Awards.AWARD,
                    null,
                    crew("lea"),
                    null,
                    new Awards.Award(past[1], "🏆"),
                    null,
                    decided,
                    crew("lea"),
                    null,
                    (long) then,
                    at(LocalDate.of(then, 12, 20), 18, 0));
            UUID nominee = row(
                    board,
                    Awards.NOMINEE,
                    award,
                    crew("lea"),
                    crew(past[2]),
                    new Awards.Nominee(null),
                    null,
                    null,
                    null,
                    null,
                    null,
                    at(LocalDate.of(then, 12, 21), 18, 0));
            for (String voter : List.of("lea", "nora", "kai", "lena")) {
                row(
                        board,
                        Awards.VOTE,
                        nominee,
                        crew(voter),
                        null,
                        Map.of(),
                        null,
                        null,
                        null,
                        null,
                        null,
                        at(LocalDate.of(then, 12, 28), 18, 0));
            }
        }
    }

    /**
     * One of this year's awards, written as it stands: with all five votes in it was decided when the last one
     * came. (Written as rows, not through the service, so the sample data is the same on New Year's Eve, when
     * everything is decided and nothing more can be voted.)
     *
     * @param nominees who, what for, a photo
     * @param votes who votes, and for which nominee (by its place)
     */
    private void award(UUID board, String name, String emoji, String[][] nominees, String[][] votes) {
        Instant added = Instant.now().minus(12, ChronoUnit.DAYS);
        boolean everyone = votes.length == 5;
        UUID award = row(
                board,
                Awards.AWARD,
                null,
                crew("lea"),
                null,
                new Awards.Award(name, emoji),
                null,
                everyone ? Instant.now().minus(4, ChronoUnit.DAYS) : null,
                everyone ? crew(votes[votes.length - 1][0]) : null,
                null,
                (long) today.getYear(),
                added);
        UUID[] ids = new UUID[nominees.length];
        for (int n = 0; n < nominees.length; n++) {
            ids[n] = row(
                    board,
                    Awards.NOMINEE,
                    award,
                    crew("lea"),
                    crew(nominees[n][0]),
                    new Awards.Nominee(nominees[n][1]),
                    null,
                    null,
                    null,
                    nominees[n][2] == null ? null : w.photo("lea", nominees[n][2]),
                    null,
                    added.plus(1, ChronoUnit.HOURS));
        }
        for (String[] vote : votes) {
            row(
                    board,
                    Awards.VOTE,
                    ids[Integer.parseInt(vote[1])],
                    crew(vote[0]),
                    null,
                    Map.of(),
                    null,
                    null,
                    null,
                    null,
                    null,
                    added.plus(2, ChronoUnit.DAYS));
        }
    }

    // ---------- 19.9 a goal you walk together ----------

    /** 1,240 of 2,100 km. This week 152: Lea 44, Lena 38, Nora 31, Ana 27, Kai 12. */
    private void walkTogether() {
        UUID board = board(
                CREW,
                "lea",
                Template.WALK_TOGETHER,
                "Walk to Lisbon",
                fields("from", "Ljubljana", "to", "Lisbon", "unit", "km", "goal", 2_100_000));
        add("lea", board, WalkTogether.STOP, fields("name", "Milan", "at", 490_000));
        add("lea", board, WalkTogether.STOP, fields("name", "Lyon", "at", 950_000));
        add("lea", board, WalkTogether.STOP, fields("name", "Madrid", "at", 1_580_000));
        Map<String, int[]> walked = new LinkedHashMap<>();
        // This week's kilometres, and the kilometres of the eight weeks before.
        walked.put("lea", new int[] {44, 280});
        walked.put("lena", new int[] {38, 250});
        walked.put("nora", new int[] {31, 230});
        walked.put("ana", new int[] {27, 200});
        walked.put("kai", new int[] {12, 128});
        walked.forEach((who, km) -> {
            add(who, board, WalkTogether.WALK, fields("amount", km[0] * 1000, "day", monday()));
            for (int week = 1; week <= 8; week++) {
                LocalDate day = monday().minusWeeks(week).plusDays(5);
                row(
                        board,
                        WalkTogether.WALK,
                        null,
                        crew(who),
                        crew(who),
                        Map.of(),
                        day,
                        null,
                        null,
                        null,
                        km[1] * 1000L / 8,
                        at(day, 19, 0));
            }
        });
    }
}

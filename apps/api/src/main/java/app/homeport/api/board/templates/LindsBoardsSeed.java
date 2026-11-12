package app.homeport.api.board.templates;

import app.homeport.api.board.BoardService;
import app.homeport.api.board.Json;
import app.homeport.api.board.Scene;
import app.homeport.api.board.Template;
import app.homeport.api.media.MediaKind;
import app.homeport.api.media.MediaStorage;
import app.homeport.api.media.MediaStore;
import app.homeport.api.seed.SeedWorld;
import app.homeport.api.seed.Seeder;
import app.homeport.api.thing.Audience;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.sql.Timestamp;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
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
 * The ten templates in The Linds, as the screens draw them: this week's meals, the chore wheel's week and
 * stars, the capsule for Mia's 18th birthday, the letters to open, the interview, what the children said, the
 * first-day-of-school photos, Astrid's stories, the jar and the doorframe. Dates are counted from the day
 * this runs.
 *
 * <p>Boards are made through the service, so their settings are checked like anyone's. What has to lie in the
 * past (a letter sealed last week, ticks of earlier weeks, a year of slips) is then written straight into the
 * rows, which is also how the tests move time.
 *
 * <p>The sample recordings are half a second of silence each, with the lengths the screens show: there is
 * nobody to record.
 */
@Component
@ConditionalOnProperty(name = "homeport.seed.enabled", havingValue = "true")
class LindsBoardsSeed implements Seeder {

    private static final String LINDS = "linds";

    private final BoardService boards;
    private final MediaStore media;
    private final MediaStorage storage;

    private SeedWorld w;
    private LocalDate today;
    private double next = 1;

    LindsBoardsSeed(BoardService boards, MediaStore media, MediaStorage storage) {
        this.boards = boards;
        this.media = media;
        this.storage = storage;
    }

    @Override
    public int order() {
        return 60;
    }

    @Override
    public void seed(SeedWorld world) {
        w = world;
        today = LocalDate.now(ZoneOffset.UTC);
        mealPlan();
        choreWheel();
        timeCapsule();
        openWhen();
        birthdayInterview();
        said();
        sameSpot();
        stories();
        goodJar();
        doorframe();
        // The family set these up a while ago: what was changed last in Notes is the pages and the shopping
        // list, as its screens draw it, not ten templates made in the same second.
        world.jdbc()
                .sql(
                        "update things set created_at = created_at - interval '20 days', updated_at = updated_at - interval '3 days'"
                                + " where kind = 'board' and circle_id = :circle")
                .param("circle", world.circle(LINDS))
                .update();
    }

    // ---------- helpers ----------

    private UUID board(String owner, Template template, String title, Audience audience, Map<String, Object> settings) {
        return boards.create(
                        w.user(owner), w.circle(LINDS), template, title, audience, settings, UUID.randomUUID(), today)
                .id();
    }

    private UUID add(String as, UUID board, String kind, Map<String, Object> fields) {
        return boards.add(board, w.user(as), kind, fields, UUID.randomUUID(), today)
                .entryId();
    }

    private UUID member(String key) {
        return w.member(LINDS, key);
    }

    private LocalDate birthday(String key) {
        return w.jdbc()
                .sql("select birthday from members where id = :id")
                .param("id", member(key))
                .query(LocalDate.class)
                .single();
    }

    private static Instant at(LocalDate day, int hour, int minute) {
        return day.atTime(LocalTime.of(hour, minute)).toInstant(ZoneOffset.UTC);
    }

    /** A row written as it would stand after some time: for what lies in the past. */
    private UUID row(
            UUID board,
            String kind,
            UUID parent,
            String author,
            UUID forMember,
            Object doc,
            LocalDate day,
            Instant doneAt,
            String doneBy,
            UUID mediaId,
            Long amount,
            String token,
            Instant createdAt) {
        UUID id = UUID.randomUUID();
        w.jdbc()
                .sql("""
            insert into board_entries (id, board_id, parent_id, kind, author_id, for_id, doc, day, done_at, done_by,
              media_id, amount, token, position, created_at, updated_at)
            values (:id, :board, :parent, :kind, :author, :for, cast(:doc as jsonb), :day, :done, :doneBy, :media,
              :amount, :token, :position, :created, :created)
            """)
                .param("id", id)
                .param("board", board)
                .param("parent", parent)
                .param("kind", kind)
                .param("author", author == null ? null : member(author))
                .param("for", forMember)
                .param("doc", Json.text(Json.tree(doc)))
                .param("day", day)
                .param("done", doneAt == null ? null : Timestamp.from(doneAt))
                .param("doneBy", doneBy == null ? null : member(doneBy))
                .param("media", mediaId)
                .param("amount", amount)
                .param("token", token)
                .param("position", day == null ? next++ : day.toEpochDay() + (next++ % 1000) / 1000.0)
                .param("created", Timestamp.from(createdAt == null ? Instant.now() : createdAt))
                .update();
        return id;
    }

    private void share(UUID thing, String who, boolean canEdit) {
        w.jdbc()
                .sql("update things set audience = 'some' where id = :id")
                .param("id", thing)
                .update();
        w.jdbc()
                .sql("insert into thing_shares (thing_id, member_id, can_edit) values (:thing, :member, :edit)")
                .param("thing", thing)
                .param("member", member(who))
                .param("edit", canEdit)
                .update();
    }

    /** A recording for the sample data: half a second of silence that says it is this long. */
    private UUID recording(String owner, int seconds) {
        UUID id = UUID.randomUUID();
        String key = "audio/seed/" + id + "-" + UUID.randomUUID().toString().substring(0, 8) + ".wav";
        byte[] bytes = silence();
        try {
            storage.put(key, bytes, "audio/wav");
        } catch (IOException e) {
            throw new IllegalStateException("A sample recording couldn't be stored.", e);
        }
        media.insert(id, w.user(owner), MediaKind.AUDIO, "audio/wav", "recording.wav", key, seconds);
        media.fileReady(id, bytes.length);
        return id;
    }

    private static byte[] silence() {
        int samples = 4000;
        ByteBuffer header = ByteBuffer.allocate(44).order(ByteOrder.LITTLE_ENDIAN);
        header.put("RIFF".getBytes(java.nio.charset.StandardCharsets.US_ASCII));
        header.putInt(36 + samples);
        header.put("WAVEfmt ".getBytes(java.nio.charset.StandardCharsets.US_ASCII));
        header.putInt(16).putShort((short) 1).putShort((short) 1).putInt(8000).putInt(8000);
        header.putShort((short) 1).putShort((short) 8);
        header.put("data".getBytes(java.nio.charset.StandardCharsets.US_ASCII));
        header.putInt(samples);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        out.writeBytes(header.array());
        byte[] quiet = new byte[samples];
        java.util.Arrays.fill(quiet, (byte) 0x80);
        out.writeBytes(quiet);
        return out.toByteArray();
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

    // ---------- 5.7 the weekly meal plan ----------

    private void mealPlan() {
        // The switch is off while the sample week is filled in, and set on at the end (below).
        UUID plan = board(
                "nora",
                Template.MEAL_PLAN,
                "Weekly meal plan",
                Audience.CIRCLE,
                fields("cookingFor", 4, "toGroceries", false));
        LocalDate monday = MealPlan.monday(today);
        add(
                "nora",
                plan,
                MealPlan.RECIPE,
                fields(
                        "name",
                        "Baked salmon",
                        "emoji",
                        "🐟",
                        "minutes",
                        35,
                        "ingredients",
                        List.of("Salmon fillets", "Lemon", "New potatoes", "Green beans", "Dill")));
        add(
                "nora",
                plan,
                MealPlan.RECIPE,
                fields(
                        "name",
                        "Chicken curry",
                        "emoji",
                        "🍛",
                        "minutes",
                        45,
                        "ingredients",
                        List.of("Chicken thighs", "Coconut milk", "Curry paste", "Rice", "Onions", "Spinach")));
        add(
                "nora",
                plan,
                MealPlan.RECIPE,
                fields(
                        "name",
                        "Big salad",
                        "emoji",
                        "🥗",
                        "minutes",
                        15,
                        "ingredients",
                        List.of("Lettuce", "Cucumber", "Tomatoes", "Feta", "Olives", "Chickpeas")));

        // 29 ingredients this week; six are at home already, so 23 go to Groceries.
        meal(
                plan,
                monday,
                "Tomato pasta",
                "🍝",
                25,
                null,
                "alex",
                List.of("Spaghetti", "Tinned tomatoes", "Garlic", "Olive oil", "Basil", "Parmesan", "Onion"),
                List.of("Garlic", "Olive oil"));
        meal(
                plan,
                monday.plusDays(1),
                "Lentil soup",
                "🍲",
                40,
                "Makes two dinners",
                "nora",
                List.of("Red lentils", "Carrots", "Celery", "Onions", "Vegetable stock", "Cumin", "Lemon", "Bread"),
                List.of("Vegetable stock", "Cumin"));
        meal(
                plan,
                monday.plusDays(2),
                "Tacos",
                "🌮",
                30,
                null,
                "alex",
                List.of(
                        "Tortillas",
                        "Minced beef",
                        "Black beans",
                        "Avocados",
                        "Tomatoes",
                        "Lettuce",
                        "Cheddar",
                        "Sour cream",
                        "Taco seasoning"),
                List.of("Taco seasoning"));
        meal(
                plan,
                monday.plusDays(4),
                "Pizza night",
                "🍕",
                null,
                "Mia and Leo choose",
                "mia",
                List.of("Pizza dough", "Mozzarella", "Tomato sauce", "Olives", "Flour"),
                List.of("Flour"));
        // Saturday's "Dinner at Grandma Astrid's" is not a meal of the plan: it is in the calendar (Plan's sample
        // data has it), and the plan shows it on its day "from the calendar" (CalendarDinners).
        // "23 ingredients go to Groceries": the switch is on, pointing at the family's shopping list. That list
        // is drawn in Notes with twelve lines of its own, so the sample week's ingredients are not on it yet;
        // they are written the first time someone changes the plan, as when a list couldn't be reached.
        w.jdbc().sql("""
            update boards set settings = settings || jsonb_build_object('toGroceries', true)
              || coalesce((select jsonb_build_object('groceriesListId', t.id) from things t
                           where t.circle_id = :circle and t.kind = 'checklist' and t.title = 'Groceries'
                           order by t.created_at limit 1), '{}'::jsonb)
            where thing_id = :plan
            """).param("plan", plan).param("circle", w.circle(LINDS)).update();
    }

    private void meal(
            UUID plan,
            LocalDate day,
            String name,
            String emoji,
            Integer minutes,
            String note,
            String cook,
            List<String> ingredients,
            List<String> atHome) {
        UUID meal = add(
                "nora",
                plan,
                MealPlan.MEAL,
                fields(
                        "day",
                        day,
                        "name",
                        name,
                        "emoji",
                        emoji,
                        "minutes",
                        minutes,
                        "note",
                        note,
                        "cookMemberId",
                        cook == null ? null : member(cook),
                        "ingredients",
                        ingredients));
        for (String have : atHome) {
            UUID ingredient = w.jdbc()
                    .sql("select id from board_entries where parent_id = :meal and doc ->> 'name' = :name")
                    .param("meal", meal)
                    .param("name", have)
                    .query(UUID.class)
                    .single();
            boards.changeEntry(ingredient, w.user("nora"), fields("atHome", true), today);
        }
    }

    // ---------- 5.8 the chore wheel ----------

    private void choreWheel() {
        List<String> people = List.of("nora", "alex", "mia", "leo");
        UUID wheel = board(
                "nora",
                Template.CHORE_WHEEL,
                "Chore wheel",
                Audience.CIRCLE,
                fields(
                        "people", people.stream().map(p -> member(p).toString()).toList(),
                        "stars", Map.of("stars", 10, "cents", 200, "currency", "EUR", "into", "Mia's skates fund")));
        // Started nine weeks ago: the wheel has turned twice round and one job on, so this week the laundry is
        // Alex's, the table Mia's and Biscuit Leo's, and Nora has the week off. The bins are not on the wheel:
        // the family takes turns at those with a reminder in Plan ("Take the bins out"), and the same job kept
        // in two places would stand on Today twice.
        LocalDate monday = MealPlan.monday(today);
        LocalDate startedOn = monday.minusWeeks(9);
        w.jdbc()
                .sql(
                        "update boards set settings = jsonb_set(settings, '{startsOn}', to_jsonb(cast(:day as text))) where thing_id = :id")
                .param("day", startedOn.toString())
                .param("id", wheel)
                .update();
        List<UUID> jobs = List.of(
                add(
                        "nora",
                        wheel,
                        ChoreWheel.JOB,
                        fields("name", "Laundry", "emoji", "🧺", "when", "Two loads", "timesAWeek", 2)),
                add(
                        "nora",
                        wheel,
                        ChoreWheel.JOB,
                        fields("name", "Set the table", "emoji", "🍽️", "when", "Every day", "timesAWeek", 7)),
                add(
                        "nora",
                        wheel,
                        ChoreWheel.JOB,
                        fields("name", "Feed Biscuit", "emoji", "🐶", "when", "Every morning", "timesAWeek", 7)));
        int[] times = {2, 7, 7};

        // This week: Alex has done both loads, Mia missed one day, Leo fed Biscuit every morning.
        int daysSoFar = (int) (today.toEpochDay() - monday.toEpochDay()) + 1;
        Map<String, Integer> left = new LinkedHashMap<>(Map.of("mia", 34, "leo", 21));
        for (int d = 0; d < daysSoFar; d++) {
            LocalDate day = monday.plusDays(d);
            if (d < 2) {
                tick(wheel, jobs.get(0), "alex", "alex", day, 19);
            }
            if (d != 1 || daysSoFar < 3) {
                tick(wheel, jobs.get(1), "mia", "nora", day, 18);
                left.merge("mia", -1, Integer::sum);
            }
            tick(wheel, jobs.get(2), "leo", "nora", day, 7);
            left.merge("leo", -1, Integer::sum);
        }
        // The weeks before, by the rule of the wheel, until Mia has her 34 stars and Leo his 21.
        for (int back = 1; back <= 9; back++) {
            int week = 9 - back;
            for (String child : List.of("mia", "leo")) {
                for (int job = 0; job < jobs.size(); job++) {
                    if (!people.get(Math.floorMod(job + week, people.size())).equals(child)) {
                        continue;
                    }
                    for (int d = 0; d < times[job] && left.get(child) > 0; d++) {
                        tick(
                                wheel,
                                jobs.get(job),
                                child,
                                "nora",
                                monday.minusWeeks(back).plusDays(d),
                                18);
                        left.merge(child, -1, Integer::sum);
                    }
                }
            }
        }
        // "10 stars pay €2 into Mia's skates fund": the wheel and that goal in Plan know of each other, when
        // Plan's sample data is there.
        w.thing("board/chore-wheel", wheel);
        w.link("board/chore-wheel", "goal/skates-fund");
    }

    private void tick(UUID wheel, UUID job, String whose, String pressedBy, LocalDate day, int hour) {
        // Never later than now: today's ticks were pressed a little while ago.
        Instant when = at(day, hour, 10).isAfter(Instant.now()) ? Instant.now().minusSeconds(1200) : at(day, hour, 10);
        row(
                wheel,
                ChoreWheel.TICK,
                job,
                pressedBy,
                member(whose),
                Map.of(),
                day,
                when,
                pressedBy,
                null,
                1L,
                null,
                when);
    }

    // ---------- 5.9 the time capsule ----------

    private void timeCapsule() {
        LocalDate born = birthday("mia");
        LocalDate eighteenth = born.plusYears(18);
        UUID capsule = board(
                "nora",
                Template.TIME_CAPSULE,
                "For Mia, on her 18th birthday",
                Audience.CIRCLE,
                fields(
                        "opensOn",
                        eighteenth,
                        "countFrom",
                        born,
                        "forMemberIds",
                        List.of(member("mia").toString()),
                        // A surprise: Mia doesn't see that it exists until the day (the shared "hidden from, until").
                        "hideFromThem",
                        true));

        UUID letter = add("nora", capsule, TimeCapsule.LETTER, fields("text", LETTER_FROM_NORA));
        LocalDate sealed = today.minusDays(8);
        w.jdbc()
                .sql("update board_entries set done_at = :at, created_at = :at where id = :id")
                .param("at", Timestamp.from(at(sealed, 21, 5)))
                .param("id", letter)
                .update();
        add("alex", capsule, TimeCapsule.VOICE, fields("mediaId", recording("alex", 134)));
        add(
                "nora",
                capsule,
                TimeCapsule.PHOTO,
                fields(
                        "title",
                        "Grandma Astrid's cookie recipe",
                        "note",
                        "In her handwriting, with a photo",
                        "fromName",
                        "Astrid Lind",
                        "mediaId",
                        w.photo("nora", "cookies.jpg")));
        UUID photos = add(
                "nora",
                capsule,
                TimeCapsule.PHOTOS,
                fields("title", "12 photos from this year", "note", "One a month, picked by the family"));
        for (String file : List.of(
                "canoe.jpg",
                "picnic.jpg",
                "cake.jpg",
                "puppy.jpg",
                "tricycle.jpg",
                "strawberries.jpg",
                "lake.jpg",
                "autumn.jpg",
                "sparkler.jpg",
                "breakfast.jpg",
                "blueberries.jpg",
                "girl-field.jpg")) {
            UUID photo = w.photo("nora", file);
            if (photo != null) {
                add("nora", capsule, TimeCapsule.PHOTO, fields("parentId", photos, "mediaId", photo));
            }
        }
    }

    private static final String LETTER_FROM_NORA = """
        Dear Mia,

        You are nine as I write this, and asleep upstairs with a book on your face. By the time you read it you \
        will be eighteen, and I will probably have forgotten half of what I want to tell you, so here it is while I \
        still remember.

        This year you learned to dive, properly, head first, after a whole summer of standing on the edge with your \
        toes curled over. You told me afterwards that the trick was not to think about it. I have been trying to \
        take that advice ever since.

        You decided you would be a marine biologist. With a horse. I asked how the horse fitted in and you looked at \
        me as if I were being slow on purpose. I hope you still look at people that way when they tell you two good \
        things can't go together.

        You and Leo fight about the front seat, the last pancake and who Biscuit loves more. You also read to him \
        when he can't sleep and you think we don't know. We know. It is the thing I am proudest of, more than the \
        diving.

        I don't know who you are at eighteen. I know you are stubborn, because you were stubborn at two. I know you \
        are kind when nobody is looking, because you are now. I hope you are still a little bit ridiculous. I hope \
        you still say the thing everyone else is too polite to say.

        Some things I want you to have in writing, because I will deny them later. You were right about the \
        dog: we should have got Biscuit a year sooner. You were right that the blue coat was too small. You were \
        not right about bedtime, and I stand by every one of those evenings. And the night you asked whether the \
        dark is the same dark everywhere, I didn't know the answer, and I still don't, and it is still the best \
        question anyone has ever asked me.

        There is a recipe in this capsule in Grandma Astrid's handwriting. Make the cookies. Burn the first tray, \
        everybody does, and then ring me and I will pretend I never burned one in my life.

        Whatever you are about to do next, you don't have to be sure about it. I wasn't. Your dad certainly wasn't. \
        We made most of it up, including you, and you turned out to be the best idea we ever had.

        Come home often. Bring the horse.

        All my love, always,
        Mum
        """;

    // ---------- 15.1 Open when… ----------

    private void openWhen() {
        UUID letters =
                board("nora", Template.OPEN_WHEN, "Open when…", Audience.ME, fields("forMemberId", member("mia")));
        share(letters, "mia", false);
        add(
                "nora",
                letters,
                OpenWhen.LETTER,
                fields(
                        "when",
                        "you can't sleep",
                        "emoji",
                        "🌙",
                        "text",
                        "Count the stars on your ceiling, the ones we stuck up when you were four. There are forty-one. I"
                                + " checked. If you're still awake after that, come and find me. I'm probably awake too."));
        UUID badDay = add(
                "nora",
                letters,
                OpenWhen.LETTER,
                fields(
                        "when",
                        "you've had a bad day",
                        "emoji",
                        "🌧️",
                        "text",
                        "First: it's allowed. Everyone has them, even the people who look as if they don't. Second: it ends at"
                                + " midnight, that's the rule. Third: there is chocolate behind the flour. I love you on the"
                                + " bad days exactly as much as on the good ones."));
        LocalDate opened = today.minusDays(9);
        w.jdbc()
                .sql("update board_entries set done_at = :at, done_by = :by where id = :id")
                .param("at", Timestamp.from(at(opened, 21, 40)))
                .param("by", member("nora"))
                .param("id", badDay)
                .update();
        add(
                "nora",
                letters,
                OpenWhen.LETTER,
                fields(
                        "when",
                        "it's your first day at big school",
                        "emoji",
                        "🎒",
                        "text",
                        "You'll know nobody for about a morning. By lunch you'll know one person, and one is enough to start"
                                + " with. Press play: I recorded the rest.",
                        "mediaId",
                        recording("nora", 48)));
        add(
                "nora",
                letters,
                OpenWhen.LETTER,
                fields(
                        "when",
                        "you win, or you lose",
                        "emoji",
                        "🏆",
                        "text",
                        "If you won: well done, now be nice about it. If you lost: well done, now be nice about it. Either way"
                                + " we're having pancakes."));
        add(
                "nora",
                letters,
                OpenWhen.LETTER,
                fields(
                        "when",
                        "I'm away and you miss me",
                        "emoji",
                        "✈️",
                        "text",
                        "I miss you too, right now, wherever I am. Look at the moon tonight. I'll look at it as well, and"
                                + " that's nearly the same as a hug.",
                        "forwardOn",
                        "journey"));
    }

    // ---------- 15.2 the birthday interview ----------

    private void birthdayInterview() {
        UUID interview = board(
                "nora",
                Template.BIRTHDAY_INTERVIEW,
                "Mia's birthday interview",
                Audience.ME,
                fields("forMemberId", member("mia")));
        share(interview, "alex", true);
        List<UUID> questions = w.jdbc()
                .sql("select id from board_entries where board_id = :board and kind = 'question' order by position, id")
                .param("board", interview)
                .query(UUID.class)
                .list();
        LocalDate born = birthday("mia");
        answer(interview, questions.get(0), born, 7, "A vet", false);
        answer(interview, questions.get(0), born, 8, "A vet with a horse", true);
        answer(interview, questions.get(0), born, 9, "A marine biologist. With a horse.", true);
        answer(interview, questions.get(1), born, 7, "Pancakes", false);
        answer(interview, questions.get(1), born, 8, "Pancakes", false);
        answer(interview, questions.get(1), born, 9, "Sushi. And pancakes.", false);
        answer(interview, questions.get(2), born, 9, "“In a minute.”", true);
        answer(interview, questions.get(3), born, 8, "Ema, because she shares her crisps", false);
        answer(interview, questions.get(3), born, 9, "Ema. And Biscuit, but he's a dog.", false);
        answer(interview, questions.get(4), born, 9, "Diving. And finding things Dad has lost.", false);
    }

    private void answer(UUID interview, UUID question, LocalDate born, int age, String text, boolean voice) {
        LocalDate day = born.plusYears(age);
        row(
                interview,
                BirthdayInterview.ANSWER,
                question,
                "nora",
                member("mia"),
                Map.of("text", text),
                day,
                null,
                null,
                voice ? recording("nora", 5 + age) : null,
                (long) age,
                null,
                at(day, 17, 0));
    }

    // ---------- 15.3 things they said ----------

    private void said() {
        UUID board = board("nora", Template.SAID, "Things they said", Audience.CIRCLE, Map.of());
        LocalDate mia = birthday("mia");
        LocalDate leo = birthday("leo");
        quote(board, "leo", today.minusDays(1), "I'm not tired. My eyes are just heavy.", 6);
        quote(
                board,
                "mia",
                mia.plusYears(7).plusMonths(1).plusDays(9),
                "When I'm grown up I'll still live here, but I'll be the boss.",
                9);
        quote(board, "leo", leo.plusYears(4).plusMonths(9).plusDays(3), "The moon is following our car.", 0);
        // Eighty-three more, a few weeks apart, going back to when each of them was three.
        int n = 0;
        for (String line : MORE_QUOTES) {
            boolean byLeo = line.startsWith("L:");
            LocalDate earliest = (byLeo ? leo : mia).plusYears(3);
            LocalDate day = today.minusDays(12 + 19L * n);
            if (day.isBefore(earliest)) {
                day = earliest.plusDays(7L * n);
            }
            quote(board, byLeo ? "leo" : "mia", day, line.substring(2), 0);
            n++;
        }
    }

    private void quote(UUID board, String who, LocalDate day, String text, int voiceSeconds) {
        row(
                board,
                Said.QUOTE,
                null,
                who.equals("leo") ? "nora" : "alex",
                member(who),
                Map.of("text", text),
                day,
                null,
                null,
                voiceSeconds > 0 ? recording("nora", voiceSeconds) : null,
                null,
                null,
                at(day, 20, 15));
    }

    private static final List<String> MORE_QUOTES = List.of(
            "L:I didn't spill it. The cup fell over by itself.",
            "M:Can we get a second dog so Biscuit has someone to talk to?",
            "L:I'm full for dinner but not for pudding. They go in different tummies.",
            "M:I'm not arguing. I'm explaining why I'm right.",
            "L:Is today tomorrow?",
            "M:When you were little, was everything in black and white?",
            "L:I can't tidy up. My legs are out of batteries.",
            "M:I don't need a coat. I have warm blood.",
            "L:Biscuit told me he wants a biscuit.",
            "M:If I close my eyes, is it still my bedtime?",
            "L:I'm not scared of the dark. I'm scared of what's in it.",
            "M:You can't be cross with me. It's nearly my birthday.",
            "L:The rain is the sky having a shower.",
            "M:I love you more than pancakes. But only just.",
            "L:Why is it called a week-end if there's school after it?",
            "M:I was listening. I just wasn't doing it.",
            "L:My tooth is wobbly because it wants to see the world.",
            "M:Dad, your singing is making the car slower.",
            "L:I ate my peas. Biscuit helped.",
            "M:Reading in bed isn't staying up. It's lying down.",
            "L:When I'm five I'll be able to drive the tractor.",
            "M:I'm saving my vegetables for later. For never.",
            "L:Snow is just rain in its pyjamas.",
            "M:I can't hear you, my book is too loud.",
            "L:I'm not lost. I know where I am, I'm here.",
            "M:Grandma's house smells like yes.",
            "L:Can you turn the sun down? It's too bright.",
            "M:I didn't forget my homework. I remembered it too late.",
            "L:My shoes are on the right feet. They're both my feet.",
            "M:If you're the boss of me, who's the boss of you?",
            "L:I want to be a fireman and a cat.",
            "M:It's not a mess. I know where everything is.",
            "L:The bath is too wet.",
            "M:I'll be good when I'm nine. I'm busy being eight.",
            "L:I ran so fast my legs couldn't see me.",
            "M:Sleeping is boring. Nothing happens.",
            "L:Why do grown-ups get to stay up when they're the tired ones?",
            "M:I'm allergic to tidying. It makes me sit down.",
            "L:Dad, you have a hole in your hair.",
            "M:I only said it once, loudly.",
            "L:Is the moon the sun's night light?",
            "M:You said maybe. Maybe means yes if I'm patient.",
            "L:I can't wear those. They feel like Tuesday.",
            "M:I wasn't crying. My eyes were leaking.",
            "L:The cheese is too yellow.",
            "M:I love Leo. But can he live next door?",
            "L:When I grow up I'll marry Mum. And Biscuit.",
            "M:If I eat the broccoli, does that count for tomorrow too?",
            "L:My tummy is saying words. It's saying biscuit.",
            "M:I can do it myself. Can you help me?",
            "L:The wind tried to take my hat. I said no.",
            "M:Why is it a secret if you're telling me?",
            "L:I'm not a baby. I'm a big small boy.",
            "M:Homework is what teachers do to weekends.",
            "L:Can we go to the yesterday park?",
            "M:I'm not late. Everyone else is early.",
            "L:My sock has a window in it.",
            "M:When I'm a mum, pudding comes first.",
            "L:I heard a noise and it was me.",
            "M:I'm practising being famous. Please don't look.",
            "L:Is that a real dog or a walking one?",
            "M:I can't smile, my face is tired.",
            "L:I don't want to grow up. Who will play with my toys?",
            "M:Can we keep the Christmas tree until it's Christmas again?",
            "L:The sea is too big. Can they make a small one?",
            "M:I already said sorry in my head.",
            "L:I'm hiding. Don't tell me where I am.",
            "M:Dad doesn't cook. He warms.",
            "L:Why does bedtime come so early when I'm busy?",
            "M:I love my teacher, but she's not you. That's her only problem.",
            "L:My elbow hurts in my knee.",
            "M:I don't have a favourite parent. It depends on the day.",
            "L:The stars are holes where the light comes in.",
            "M:I'm not being bossy. I just have good ideas.",
            "L:Biscuit is my brother but with more hair.",
            "M:When I'm eighteen I'll come home for dinner. Every day.",
            "L:I want the big spoon. I'm very hungry in my mouth.",
            "M:Thank you for having me. As your child, I mean.",
            "L:I'll hold your hand so you don't get lost.",
            "M:This is the best day. Don't let it end, write it down.",
            "L:I love you up to the moon and back down the slide.",
            "M:One day I'll read this and laugh. Probably today.",
            "L:Goodnight. I'm going to dream about us.");

    // ---------- 15.4 same spot, every year ----------

    private void sameSpot() {
        UUID spot =
                board("nora", Template.SAME_SPOT, "First day of school", Audience.CIRCLE, fields("around", "09-01"));
        int year = today.getYear();
        shot(spot, year - 3, "girl-field.jpg");
        shot(spot, year - 2, "girl-sun.jpg");
        shot(spot, year - 1, "mum-kid.jpg");
    }

    private void shot(UUID spot, int year, String file) {
        UUID photo = w.photo("nora", file);
        if (photo != null) {
            add("nora", spot, SameSpot.PHOTO, fields("mediaId", photo, "year", year, "day", LocalDate.of(year, 9, 1)));
        }
    }

    // ---------- 15.5 Grandma's stories ----------

    private void stories() {
        UUID board = board(
                "nora",
                Template.STORIES,
                "Astrid's stories",
                Audience.CIRCLE,
                fields("tellerName", "Astrid Lind", "sendsOn", "sunday"));
        // The last Sunday before today: this week's question went out then, and was answered yesterday.
        LocalDate sunday = today.minusDays(1).with(TemporalAdjusters.previousOrSame(DayOfWeek.SUNDAY));
        // Fourteen told: this week's, answered yesterday, and thirteen from the Sundays before it.
        List<Object[]> told = new ArrayList<>(List.of(
                new Object[] {"What was your very first job?", 192},
                new Object[] {"How did you meet Grandpa?", 280},
                new Object[] {"What did your kitchen smell like?", 125},
                new Object[] {"What was your mother like?", 301},
                new Object[] {"What did you get up to on a Sunday when you were ten?", 174},
                new Object[] {"Which house did you love the most?", 233},
                new Object[] {"What was the first film you saw at the cinema?", 96},
                new Object[] {"What did you want to be when you grew up?", 142},
                new Object[] {"Who was your best friend at school?", 207},
                new Object[] {"What was your wedding day like?", 356},
                new Object[] {"What was Mum like when she was Mia's age?", 262},
                new Object[] {"What is the best meal you ever ate?", 118},
                new Object[] {"What did winter look like when you were a child?", 189},
                new Object[] {"What is the bravest thing you ever did?", 224}));
        for (int i = 0; i < told.size(); i++) {
            LocalDate out = sunday.minusWeeks(i);
            Instant answered = i == 0 ? at(today.minusDays(1), 16, 20) : at(out.plusDays(1 + i % 3), 11, 30);
            if (answered.isAfter(Instant.now())) {
                answered = Instant.now().minusSeconds(3600);
            }
            UUID question = row(
                    board,
                    Stories.QUESTION,
                    null,
                    "nora",
                    member("nora"),
                    Map.of("text", told.get(i)[0], "transcript", ""),
                    out,
                    answered,
                    null,
                    recording("nora", (Integer) told.get(i)[1]),
                    null,
                    Scene.newToken(),
                    at(out, 9, 0));
            if (i == 1) {
                for (String file : List.of("bench.jpg", "tea-table.jpg", "yellow-house.jpg")) {
                    UUID photo = w.photo("nora", file);
                    if (photo != null) {
                        row(
                                board,
                                Stories.PHOTO,
                                question,
                                "nora",
                                null,
                                Map.of(),
                                null,
                                null,
                                null,
                                photo,
                                null,
                                null,
                                null);
                    }
                }
            }
        }
        // Mia's question waits its turn: it goes out next Sunday.
        add(
                "nora",
                board,
                Stories.QUESTION,
                fields("text", "Were you ever in trouble at school?", "askedByMemberId", member("mia")));
    }

    // ---------- 15.6 the good things jar ----------

    private void goodJar() {
        UUID jar = board("nora", Template.GOOD_JAR, "The good things jar", Audience.CIRCLE, Map.of());
        LocalDate newYear = LocalDate.of(today.getYear(), 1, 1);
        long span = Math.max(1, today.minusDays(2).toEpochDay() - newYear.toEpochDay());
        List<String> names = List.of("Mia", "Leo", "Alex", "Nora");
        // 141 from the year so far, then yesterday's and today's: 143 good things.
        for (int i = 0; i < 141; i++) {
            String about = names.get(i % 4);
            // What is about one parent was written down by the other; the children's were written by either.
            String writer = about.equals("Alex") ? "nora" : about.equals("Nora") ? "alex" : i % 8 < 4 ? "nora" : "alex";
            LocalDate day = newYear.plusDays(Math.min(span, i * span / 140));
            row(
                    jar,
                    GoodJar.SLIP,
                    null,
                    writer,
                    member(about.toLowerCase(java.util.Locale.ROOT)),
                    Map.of("what", "note", "text", about + " " + GOOD_THINGS.get(i / 4)),
                    day,
                    null,
                    null,
                    null,
                    null,
                    null,
                    at(day, 19, 30));
        }
        LocalDate yesterday = today.minusDays(1);
        row(
                jar,
                GoodJar.SLIP,
                null,
                "alex",
                member("alex"),
                Map.of(
                        "what",
                        "note",
                        "text",
                        "Rode to the end of the road in Reine and there was nobody there but the" + " sea.",
                        "place",
                        "Reine",
                        "fromJourney",
                        true),
                yesterday,
                null,
                null,
                null,
                null,
                null,
                at(yesterday, 21, 0));
        UUID drawing = w.photo("nora", "tricycle.jpg");
        row(
                jar,
                GoodJar.SLIP,
                null,
                "nora",
                member("leo"),
                Map.of("what", "drawing", "text", "Leo drew all five of us on the tricycle, Biscuit driving."),
                today,
                null,
                null,
                drawing,
                null,
                null,
                Instant.now().minusSeconds(1800));
    }

    /** Thirty-six good things that could be anyone's; with four names in front they are the year so far. */
    private static final List<String> GOOD_THINGS = List.of(
            "made everyone laugh at dinner.",
            "found the first strawberry of the year.",
            "helped without being asked.",
            "said sorry first.",
            "read a whole story out loud to Biscuit.",
            "made pancakes that were actually round.",
            "let someone else have the front seat.",
            "noticed I was sad and sat with me.",
            "sang in the car and nobody minded.",
            "fixed the thing that had been broken since March.",
            "stayed up to watch the storm with me.",
            "shared the last piece without being told.",
            "learned something new and showed all of us.",
            "wrote a note and hid it in my bag.",
            "built the tallest tower the living room has seen.",
            "walked Biscuit in the rain and came back smiling.",
            "remembered Grandma Astrid's birthday before anyone else.",
            "danced in the kitchen while the pasta boiled over.",
            "was brave at the swimming pool.",
            "told a joke that was actually funny.",
            "made the beds on a Saturday, all of them.",
            "found my keys. Again.",
            "planted the tomatoes and they came up.",
            "said thank you to the bus driver, loudly.",
            "kept a secret for a whole week.",
            "carried the heavy bag the whole way home.",
            "made up a game that lasted all afternoon.",
            "fell over, got up and laughed first.",
            "chose the film and everyone liked it.",
            "tidied up before I asked. I checked twice.",
            "gave the best hug of the month.",
            "listened to the whole story, even the boring part.",
            "made hot chocolate for all four of us.",
            "waited for the slowest one on the walk.",
            "said goodnight to every room in the house.",
            "noticed the first snow and woke us all up.");

    // ---------- 15.7 the doorframe ----------

    private void doorframe() {
        UUID door = board("nora", Template.DOORFRAME, "The doorframe", Audience.CIRCLE, Map.of());
        int year = today.getYear();
        LocalDate latest = today.minusDays(10);
        mark(door, "mia", LocalDate.of(year - 4, 12, 6), 1175);
        mark(door, "mia", LocalDate.of(year - 3, 12, 6), 1215);
        mark(door, "mia", LocalDate.of(year - 2, 12, 6), 1260);
        mark(door, "mia", LocalDate.of(year - 1, 12, 6), 1320);
        mark(door, "mia", latest, 1380);
        mark(door, "leo", LocalDate.of(year - 2, 9, 15), 1050);
        mark(door, "leo", LocalDate.of(year - 1, 9, 15), 1120);
        mark(door, "leo", latest, 1190);
        add("nora", door, Doorframe.LANDMARK, fields("text", "Up to Grandma Astrid's shoulder", "heightMm", 1370));
        add("nora", door, Doorframe.LANDMARK, fields("text", "Tall enough for the big slide", "heightMm", 1150));
    }

    private void mark(UUID door, String who, LocalDate day, int mm) {
        if (!day.isAfter(today)) {
            add("alex", door, Doorframe.MARK, fields("memberId", member(who), "heightMm", mm, "day", day));
        }
    }
}

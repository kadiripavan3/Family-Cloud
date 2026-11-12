package app.homeport.api.jot;

import app.homeport.api.plan.Recurrence;
import app.homeport.api.plan.Weekday;
import app.homeport.api.plan.Words;
import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.DateTimeException;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.EnumSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Reads a line the way a person would say it and says what it means: "Haircut for Leo Saturday at 10, remind
 * me an hour before" is an event on Saturday at 10:00, for Leo, with a reminder an hour before. It is used by
 * "Type it" and by every way of jotting.
 *
 * <p>It works by rules, in plain Java: no service is asked and nothing leaves the API. That makes it private,
 * free and predictable, and it makes it wrong sometimes. So it never only answers: every reading comes with
 * <b>how it was read</b>, the pieces of the line it used and what each became, for the app to show and the
 * person to correct.
 *
 * <p>What it does, in the order it does it:
 *
 * <ol>
 *   <li>A long text (a letter) isn't read as a line: the days and amounts in it are handed back with the
 *       words around them, as suggestions.
 *   <li>A line is cut into the things it holds: at commas, full stops and new lines, and at "and" when a new
 *       thing starts after it ("…, buy plasters, and remind Alex about the bins").
 *   <li>Each part is looked at for a secret first (a code, a password, an IBAN, a card number). A secret is
 *       never filed: it is handed back as {@link ReadAs#CODE} for the Vault.
 *   <li>Then for when to remind ("an hour before"), how it repeats ("every Thursday"), a time, a day, a list
 *       ("on the packing list") and a person ("for Leo", "remind Alex").
 *   <li>What is left is the title, and what was found decides what it is: an event, a reminder, something
 *       to buy, or a note.
 * </ol>
 *
 * English only. A weekday means the next one after today; "next Friday" the Friday of next week; "12/4" the
 * 12th of April. "at 3" is three in the afternoon and "at 9" nine in the morning: an hour from 1 to 7 with
 * nothing said is taken to be after noon.
 */
public final class LineReader {

    private LineReader() {}

    // ---------- what goes in ----------

    /** Someone of the circle, by the name they are called. */
    public record Person(UUID id, String name) {}

    /** A checklist a line can be added to, by its title. */
    public record NamedList(UUID id, String title) {}

    /**
     * What the reader has to be told: the day (and, when known, the time) on the person's phone, who is
     * asking, the people and lists of the circle, and what a line with a day or a time becomes when its
     * words don't say.
     */
    public record Context(
            LocalDate today, LocalTime now, UUID me, List<Person> people, List<NamedList> lists, ReadAs whenUnsure) {

        public Context {
            people = people == null ? List.of() : List.copyOf(people);
            lists = lists == null ? List.of() : List.copyOf(lists);
            whenUnsure = whenUnsure == ReadAs.EVENT ? ReadAs.EVENT : ReadAs.REMINDER;
        }

        public static Context on(LocalDate today) {
            return new Context(today, null, null, List.of(), List.of(), ReadAs.REMINDER);
        }
    }

    // ---------- what comes out ----------

    /** A piece of the line that was used, where it stands in the line, and what it became: "Saturday" became "Sat 14 Nov". */
    @Schema(name = "ReadPieceResponse")
    public record Piece(
            @Schema(description = "Where the piece starts in the text that was sent")
            int start,

            @Schema(description = "Where it ends: the place just after its last letter")
            int end,

            String text,
            PieceKind what,

            @Schema(description = "What it became, in words: Sat 14 Nov, For Leo, 1 hour before")
            String became) {}

    /** One thing a line holds. */
    public record Item(
            ReadAs as,
            String words,
            String title,
            LocalDate day,
            LocalTime time,
            LocalTime endTime,
            UUID personId,
            PersonRole personRole,
            Integer remindMinutes,
            Recurrence repeat,
            boolean shopping,
            UUID listId,
            String listName,
            String quantity,
            CodeKind code,
            List<Piece> pieces) {}

    /** A day found in a letter, with the sentence it stands in. A deadline ("by Wednesday") reads as a reminder. */
    @Schema(name = "FoundDateResponse")
    public record FoundDate(
            LocalDate day,

            @Schema(nullable = true, type = "string", example = "08:00") @JsonFormat(pattern = "HH:mm")
            LocalTime time,

            boolean deadline,
            String title,
            String around,
            int start,
            int end) {}

    /** An amount of money found in a letter. */
    @Schema(name = "FoundAmountResponse")
    public record FoundAmount(long cents, String currency, String around, int start, int end) {}

    /** How a text was read: the things in a line, or for a letter the days and amounts found in it. */
    public record Reading(boolean letter, List<Item> items, List<FoundDate> dates, List<FoundAmount> amounts) {}

    /** A text longer than this, or of four lines or more, is a letter, not a line. */
    static final int LINE_AT_MOST = 280;

    public static Reading read(String text, Context context) {
        String line = text == null ? "" : text;
        if (line.isBlank()) {
            return new Reading(false, List.of(), List.of(), List.of());
        }
        if (line.strip().length() > LINE_AT_MOST || line.strip().lines().count() >= 4) {
            return letter(line, context);
        }
        return new Reading(false, things(line, context), List.of(), List.of());
    }

    // ---------- words the rules know ----------

    private static final String WD =
            "(?:mon(?:day)?|tue(?:s(?:day)?)?|wed(?:s|nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)";
    private static final String WD_FULL = "(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)";
    private static final String MONTH =
            "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
    private static final String COUNT_WORD = "one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve";
    private static final String NUM = "(?:\\d{1,3}|an?|" + COUNT_WORD + ")";
    private static final String LEAD =
            "(?:(?<lead>on|by|before|until|till|due(?:\\s+on|\\s+by)?|from|this|coming)\\s+)?";
    private static final String PART = "(?:\\s+(?<part>morning|afternoon|evening|night))?";
    private static final List<String> NUMBER_WORDS = List.of(COUNT_WORD.split("\\|"));

    /** Words that start something to do. A line that begins with one is a job, not an appointment. */
    private static final Set<String> DOING = words("""
            call phone ring text email message write buy get book pay order renew cancel collect return send
            post mail sign submit schedule fix repair clean wash feed walk water take bring pack charge print
            check ask tell make finish do prepare fill file register apply transfer replace change tidy hoover
            vacuum mow update install cook bake wrap invite confirm reserve organise organize arrange find sort
            empty put pick drop grab fetch remind remember review read plan set turn move defrost measure upload
            download reply answer thank wish
            """);

    /** Words that clearly start a new job after "and": "…and call the plumber". Fewer than above, so "milk and water" stays one line. */
    private static final List<String> NEXT_JOB =
            List.of(("call buy get pay book send cancel renew sign bring take feed clean fix schedule"
                            + " collect submit invite confirm reserve pick\\s+up drop\\s+off email phone order return tidy finish"
                            + " prepare make put empty post")
                    .split(" "));

    /** Words that name an appointment. A line with one and a day or a time is an event. */
    private static final Set<String> HAPPENINGS = words("""
            haircut dentist doctor doctors gp appointment meeting party dinner lunch breakfast brunch birthday
            wedding concert match game lesson lessons class practice training swimming football soccer tennis
            gym yoga flight train trip visit show movie cinema film recital playdate checkup check-up vet
            interview date bbq barbecue drinks exam test school conference rehearsal performance play assembly
            sleepover holiday vacation camp tournament race run walk hike picnic coffee orthodontist optician
            physio massage service inspection viewing delivery pickup drop-off festival market ceremony funeral
            christening graduation reunion workshop course seminar webinar call nursery kindergarten choir
            ballet dance judo karate piano violin guitar scouts babysitter sitter hairdresser barber vaccination
            jab scan surgery therapy
            """);

    /** What people buy for a home, in the singular. A short line whose last word is one of these is shopping. */
    private static final Set<String> GROCERIES = words("""
            milk egg bread butter flour coffee tea sugar salt pepper rice pasta cheese yoghurt yogurt cream
            juice water wine beer banana apple orange lemon lime strawberry blueberry raspberry berry grape pear
            peach plum melon mango avocado tomato potato onion garlic carrot cucumber lettuce salad spinach
            broccoli courgette zucchini aubergine mushroom bean pea corn chicken beef pork ham bacon sausage
            mince fish salmon tuna prawn tofu oil vinegar ketchup mustard mayo mayonnaise sauce jam honey cereal
            oat muesli granola biscuit cookie cake chocolate crisp chip nut almond peanut raisin yeast soda cola
            lemonade squash noodle soup stock spice cinnamon vanilla basil parsley herb ginger chilli paprika
            curry lentil chickpea tortilla wrap bagel roll bun croissant pizza soap shampoo conditioner
            toothpaste toothbrush deodorant razor tissue paper towel nappy diaper wipe plaster bandage
            paracetamol ibuprofen vitamin detergent liquid tablet sponge bag foil film battery bulb candle match
            food litter treat popcorn icecream sorbet hummus olive pickle cracker margarine kefir quark feta
            mozzarella parmesan pesto couscous quinoa bulgur polenta syrup pancake waffle sunscreen suncream
            lotion floss mouthwash bleach softener cleaner spray glove napkin straw tape glue pen pencil
            envelope stamp fruit vegetable veg meat snack sweet candy gum celery leek cabbage kale beetroot
            radish pumpkin cauliflower asparagus nectarine apricot kiwi pineapple coconut date fig walnut
            hazelnut cashew pistachio seed powder milkshake smoothie cocoa espresso decaf filter
            """);

    /** A word list written as words with spaces between them. */
    private static Set<String> words(String list) {
        return Set.copyOf(Arrays.asList(list.strip().split("\\s+")));
    }

    private static final Set<String> SHOPPING_NAMES = Set.of(
            "", "shopping", "grocery", "groceries", "food", "supermarket", "store", "shop", "market", "buy", "to buy");

    private static final Pattern BUYING = Pattern.compile(
            "^(?:(?:please|can you|could you|we|i)\\s+)*(?:buy|get|grab|purchase|need(?:\\s+to\\s+(?:buy|get))?|"
                    + "(?:we(?:'re| are)\\s+|i(?:'m| am)\\s+)?(?:out of|running low on|low on)|pick up some|some more|more)\\s+");

    private static final Pattern UNIT = Pattern.compile("^(?<n>\\d+(?:[.,]\\d+)?|an?|half an?|" + COUNT_WORD + ")\\s*"
            + "(?<u>kg|kilos?|g|grams?|l|litres?|liters?|ml|cl|dl|lbs?|oz|packs?|packets?|bottles?|cans?|tins?"
            + "|box(?:es)?|bags?|jars?|loa(?:f|ves)|bunch(?:es)?|dozen|pcs|pieces?|cartons?|rolls?|tubs?|slices?"
            + "|punnets?|crates?|tubes?|bars?|sticks?|heads?|cups?)\\b\\s*(?:of\\s+)?");
    private static final Pattern TIMES_BEFORE = Pattern.compile("^(?<n>\\d+)\\s*(?:x|×)\\s*");
    private static final Pattern TIMES_AFTER = Pattern.compile("\\s*(?:x|×)\\s*(?<n>\\d+)$");
    private static final Pattern SOME =
            Pattern.compile("^(?<n>\\d+|" + COUNT_WORD + "|an?|some|a few|a couple of|the)\\s+");

    // ---------- when ----------

    private static final Pattern REMIND_BEFORE = Pattern.compile(
            "\\b(?:and\\s+)?(?:(?:please\\s+)?remind\\s+(?:me|us)|(?:with\\s+)?(?:a\\s+)?reminder"
                    + "|alert\\s+me|nudge\\s+me|notify\\s+me|ping\\s+me)\\s+"
                    + "(?:the\\s+(?<the>day|evening|night|week)|(?<n>\\d{1,3}|an?|half\\s+an?|" + COUNT_WORD + ")\\s*"
                    + "(?<u>m|mins?|minutes?|h|hrs?|hours?|days?|weeks?))\\s+(?:before(?:hand)?|earlier|ahead|in\\s+advance|prior)\\b");

    private static final Pattern EVERY_DAYS =
            Pattern.compile("\\b(?:every|each)\\s+(?<other>other\\s+|second\\s+)?(?<days>" + WD
                    + "s?(?:(?:\\s*,\\s*and\\s+|\\s*,\\s*|\\s+and\\s+|\\s*&\\s*)" + WD + "s?)*)\\b" + PART);
    private static final Pattern PLURAL_DAYS = Pattern.compile("\\b(?:on\\s+)?(?<days>" + WD_FULL
            + "s(?:(?:\\s*,\\s*and\\s+|\\s*,\\s*|\\s+and\\s+|\\s*&\\s*)" + WD_FULL + "s)*)\\b" + PART);
    private static final Pattern EVERY_UNIT =
            Pattern.compile("\\b(?:every|each)\\s+(?:(?<other>other|second|2nd)\\s+|(?<n>\\d{1,2})\\s+)?"
                    + "(?<u>day|week|month|year|weekday|morning|afternoon|evening|night|fortnight)s?\\b");
    private static final Pattern WEEKDAYS =
            Pattern.compile("\\b(?:on\\s+|at\\s+(?:the\\s+)?)?(?<w>weekdays|weekends)\\b");
    private static final Pattern ADVERB =
            Pattern.compile("\\b(?<a>daily|weekly|monthly|yearly|annually|fortnightly|biweekly)\\b");

    private static final Pattern RANGE = Pattern.compile(
            "(?<![\\d:.])(?:(?<lead>from|at|between)\\s+)?(?<h1>\\d{1,2})(?:[:.](?<m1>\\d{2}))?\\s*(?<ap1>am|pm)?"
                    + "\\s*(?:-|–|—|to|until|till|and)\\s*(?<h2>\\d{1,2})(?:[:.](?<m2>\\d{2}))?\\s*(?<ap2>am|pm)?(?![\\d:a-z])");
    private static final Pattern CLOCK = Pattern.compile(
            "(?<![\\d:.])(?:(?:at|@|around)\\s*)?(?<h>\\d{1,2}):(?<m>\\d{2})\\s*(?<ap>am|pm|a\\.m\\.?|p\\.m\\.?)?(?![\\d:a-z])");
    private static final Pattern AT_DOT =
            Pattern.compile("\\b(?:at|@|around)\\s*(?<h>\\d{1,2})\\.(?<m>\\d{2})\\s*(?<ap>am|pm)?(?![\\d:a-z])");
    private static final Pattern AM_PM = Pattern.compile(
            "(?<![\\d:.])(?:(?:at|@|around)\\s*)?(?<h>\\d{1,2})(?:\\.(?<m>\\d{2}))?\\s*(?<ap>am|pm|a\\.m\\.?|p\\.m\\.?)(?![a-z])");
    private static final Pattern NAMED_TIME =
            Pattern.compile("\\b(?:(?:at|around)\\s+)?(?<n>noon|midday|midnight|lunchtime)\\b");
    private static final Pattern QUARTERS =
            Pattern.compile("\\b(?:(?:at|around)\\s+)?(?<q>half past|quarter past|quarter to|half)\\s+(?<h>\\d{1,2}|"
                    + COUNT_WORD + ")\\b");
    private static final Pattern WORD_HOUR = Pattern.compile("\\b(?:at|around)\\s+(?<h>" + COUNT_WORD
            + ")(?:\\s+(?<m>thirty|fifteen|forty[- ]five))?(?:\\s+o'?clock)?(?:\\s*(?<ap>am|pm))?\\b");
    private static final Pattern O_CLOCK =
            Pattern.compile("\\b(?:(?:at|around)\\s+)?(?<h>\\d{1,2}|" + COUNT_WORD + ")\\s+o'?clock\\b");
    private static final Pattern AT_HOUR = Pattern.compile(
            "(?:\\bat|\\baround|@)\\s*(?<h>\\d{1,2})\\b(?![:.]\\d)(?!\\s*(?:%|€|\\$|£|percent|people|kids|x\\b|kg|g\\b|ml|l\\b|pcs))");
    private static final Pattern AFTER_DAY = Pattern.compile(
            "^\\s*,?\\s*(?:(?:at|around)\\s+)?(?<h>\\d{1,2})(?:\\.(?<m>\\d{2}))?\\b(?![:./-]\\d)(?!\\s*(?:%|€|\\$|£|x\\b|kg|g\\b|ml|l\\b|pcs|people|kids|"
                    + MONTH + "\\b))");
    private static final Pattern PART_OF_DAY =
            Pattern.compile("\\b(?:in\\s+the\\s+|at\\s+)(?<part>morning|afternoon|evening|night)\\b");
    private static final Pattern IN_A_WHILE = Pattern.compile(
            "\\bin\\s+(?<n>\\d{1,3}|an?|half\\s+an?|" + COUNT_WORD + ")\\s+(?<u>mins?|minutes?|hours?|hrs?)\\b");

    private static final Pattern ISO = Pattern.compile("\\b" + LEAD + "(?<y>\\d{4})-(?<m>\\d{2})-(?<d>\\d{2})\\b");
    private static final Pattern DAY_MONTH = Pattern.compile(
            "\\b" + LEAD + "(?:" + WD + ",?\\s+)?(?:the\\s+)?(?<d>\\d{1,2})(?:st|nd|rd|th)?(?:\\s+of)?\\s+(?<mon>"
                    + MONTH + ")\\b\\.?(?:,?\\s+(?<y>\\d{4})\\b)?");
    private static final Pattern MONTH_DAY = Pattern.compile(
            "\\b" + LEAD + "(?:" + WD + ",?\\s+)?(?<mon>" + MONTH
                    + ")\\.?\\s+(?:the\\s+)?(?<d>\\d{1,2})(?:st|nd|rd|th)?\\b(?!\\s*(?:am|pm|o'clock)|[:.]\\d)(?:,?\\s+(?<y>\\d{4})\\b)?");
    private static final Pattern NUMBERS = Pattern.compile(
            "(?<![\\d.,/€$£])" + LEAD
                    + "(?<d>\\d{1,2})(?<sep>[/.])(?<m>\\d{1,2})(?:[/.](?<y>\\d{4}|\\d{2}))?(?<dot>\\.)?(?![\\d/])(?!\\s*(?:am|pm|€|eur|kg|g\\b|l\\b|ml|%|cups?|tsp|tbsp))");
    private static final Pattern THE_NTH = Pattern.compile("\\b" + LEAD + "the\\s+(?<d>\\d{1,2})(?:st|nd|rd|th)\\b");
    private static final Pattern NEAR = Pattern.compile(
            "\\b(?:(?<lead>by|before|until|till|due)\\s+)?(?<rel>the\\s+day\\s+after\\s+tomorrow|day\\s+after\\s+tomorrow|tomorrow|tmrw|tmr|today|tonight"
                    + "|this\\s+morning|this\\s+afternoon|this\\s+evening)\\b" + PART);
    private static final Pattern IN_SOME = Pattern.compile("\\b(?:(?<lead>by|before|until|till|due)\\s+)?(?:in\\s+(?<n>"
            + NUM + ")\\s+(?<u>days?|weeks?|months?|years?|fortnights?)" + "|(?<n2>" + NUM
            + ")\\s+(?<u2>days?|weeks?|months?)\\s+from\\s+(?:now|today))\\b");
    private static final Pattern NEXT = Pattern.compile(
            "\\b(?:(?<lead>by|before|until|till|due)\\s+)?(?<rel>next\\s+week|next\\s+month|next\\s+year|this\\s+weekend|next\\s+weekend"
                    + "|(?:at\\s+)?the\\s+weekend)\\b");
    private static final Pattern WEEKDAY = Pattern.compile(
            "\\b(?:(?<lead>on|by|before|until|till|due|from|this|coming|next)\\s+)?(?<wd>" + WD + ")\\b" + PART);

    // ---------- lists and secrets ----------

    private static final Pattern ADD_TO_LIST = Pattern.compile(
            "^(?:please\\s+)?(?:add|put)\\s+(?<what>.+?)\\s+(?:to|on|onto|in|into)\\s+(?:the\\s+|my\\s+|our\\s+)?(?:(?<name>.+?)\\s+)?list$");
    private static final Pattern ADD_TO = Pattern.compile(
            "^(?:please\\s+)?(?:add|put)\\s+(?<what>.+?)\\s+(?:to|on|onto|in|into)\\s+(?:the\\s+|my\\s+|our\\s+)?(?<name>.+)$");
    private static final Pattern ON_THE_LIST = Pattern.compile(
            "^(?<what>.+?)\\s+(?:to|on|onto|for)\\s+(?:the\\s+|my\\s+|our\\s+)(?:(?<name>.+?)\\s+)?list$");
    private static final Pattern LIST_COLON =
            Pattern.compile("^(?:(?:the\\s+|my\\s+|our\\s+)?(?<name>.+?)\\s+)?list\\s*:\\s*(?<what>.+)$");
    private static final Pattern SHOPPING_COLON =
            Pattern.compile("^(?<name>shopping|groceries|grocery|to buy|buy)\\s*:\\s*(?<what>.+)$");

    private static final Pattern SECRET_WORD = Pattern.compile(
            "\\b(?<kind>pass(?:word|code|phrase)|pwd|login|pin(?:\\s+code|\\s+number)?|code|combination|cvv|cvc)\\b"
                    + "(?<for>\\s+(?:for|to|of)\\s+[\\p{L}\\d' -]+?)??\\s*(?<sep>\\bis\\b|\\bare\\b|:|=|-|–)?\\s*(?<value>\\S.*)?$");
    private static final Pattern NOT_A_SECRET_CODE = Pattern.compile(
            "\\b(?:zip|post|postal|area|country|dialling|dialing|dress|bar|qr|colou?r|source|promo)\\s+code\\b");
    private static final Pattern IBAN =
            Pattern.compile("\\b[A-Z]{2}\\d{2}(?:[ ]?[A-Z0-9]{4}){2,7}(?:[ ]?[A-Z0-9]{1,4})?\\b");
    private static final Pattern CARD = Pattern.compile("(?<!\\d)\\d(?:[ -]?\\d){12,18}(?!\\d)");

    private static final Pattern AMOUNT = Pattern.compile(
            "(?:(?<c1>€|\\$|£|eur\\s)\\s?(?<a1>\\d{1,6}(?:[.,]\\d{2})?))|(?:(?<a2>\\d{1,6}(?:[.,]\\d{2})?)\\s?(?<c2>€|eur(?:os?)?\\b|euros?\\b))",
            Pattern.CASE_INSENSITIVE);

    private static final Set<String> SMALL_WORDS = Set.of(
            "and", "also", "then", "to", "that", "on", "at", "by", "this", "next", "every", "each", "from", "until",
            "till", "before", "due", "in", "for", "of", "the", "a", "an", "with", "please", "is", "are", "around");

    // ---------- a line into its things ----------

    private static List<Item> things(String line, Context context) {
        String names = names(context);
        List<int[]> spans = split(line, names);
        List<Item> items = new ArrayList<>();
        int[] before = null; // the part before, for a part that only adds to it
        int madeBefore = 0; // how many things the part before made
        Draft carried = null; // a list that goes on ("packing list: torch, batteries")
        for (int[] span : spans) {
            Clause clause = new Clause(line, span[0], span[1]);
            Draft draft = read(clause, context, names);
            Item last = items.isEmpty() ? null : items.get(items.size() - 1);
            boolean lastTakesMore = before != null
                    && madeBefore == 1
                    && (last.as() == ReadAs.EVENT || last.as() == ReadAs.REMINDER || last.as() == ReadAs.NOTE);
            boolean onlyRemind =
                    draft.nothingLeft && draft.remindMinutes != null && draft.day == null && draft.time == null;
            boolean onlyWhen = draft.nothingLeft && draft.hasWhen();
            boolean onlyYear = clause.text.strip().matches("(?:19|20)\\d{2}\\.?");
            if (lastTakesMore && onlyRemind && last.as() != ReadAs.NOTE) {
                // "…, remind me an hour before" belongs to the thing before it.
                List<Piece> pieces = new ArrayList<>(last.pieces());
                pieces.addAll(clause.pieces);
                items.set(
                        items.size() - 1, with(last, draft.remindMinutes, pieces, line.substring(before[0], span[1])));
                before = new int[] {before[0], span[1]};
                continue;
            }
            if (lastTakesMore && (onlyWhen || onlyYear)) {
                // "Haircut for Leo, Saturday 10": a part that is only a day or a time is read with the part before.
                Clause joined = new Clause(line, before[0], span[1]);
                Draft again = read(joined, context, names);
                if (!again.nothingLeft && again.as != ReadAs.LIST_ITEM) {
                    items.remove(items.size() - 1);
                    items.addAll(again.items(joined));
                    before = new int[] {before[0], span[1]};
                    continue;
                }
            }
            if (carried != null && draft.carriesOn()) {
                draft.as = ReadAs.LIST_ITEM;
                draft.shopping = carried.shopping;
                draft.listId = carried.listId;
                draft.listName = carried.listName;
                draft.listed = true;
            }
            carried = draft.as == ReadAs.LIST_ITEM && (draft.listed || draft.bought) ? draft : null;
            List<Item> made = draft.items(clause);
            items.addAll(made);
            madeBefore = made.size();
            before = span;
        }
        return items;
    }

    private static Item with(Item item, Integer remindMinutes, List<Piece> pieces, String words) {
        return new Item(
                item.as(),
                words.strip(),
                item.title(),
                item.day(),
                item.time(),
                item.endTime(),
                item.personId(),
                item.personRole(),
                remindMinutes,
                item.repeat(),
                item.shopping(),
                item.listId(),
                item.listName(),
                item.quantity(),
                item.code(),
                inOrder(pieces));
    }

    /** Pieces in the order they stand in the line. */
    private static List<Piece> inOrder(List<Piece> pieces) {
        return pieces.stream()
                .sorted((a, b) -> Integer.compare(a.start(), b.start()))
                .toList();
    }

    /**
     * Cuts a line into parts: at new lines and semicolons, at commas (not inside a number), at the end of a
     * sentence, and at "and" (or nothing at all) when what follows starts a new thing.
     */
    static List<int[]> split(String line, String names) {
        Pattern starts = Pattern.compile(
                "\\s+(?:(?:and\\s+then|and\\s+also|and|then|also|plus)\\s+(?=(?:please\\s+)?(?:remind|remember|don'?t\\s+forget|"
                        + "tell\\s|ask\\s|" + String.join("\\s|", NEXT_JOB) + "\\s|" + names + "\\s*:)"
                        + "|(?:the\\s+|my\\s+|our\\s+)?[a-z' -]{0,30}?(?:pass(?:word|code)|pin|code)\\b))"
                        + "|\\s+(?=remind\\s+(?:me|us|" + names + ")\\s+(?:to|about|that)\\b)",
                Pattern.CASE_INSENSITIVE);
        List<int[]> cuts = new ArrayList<>(); // each cut is [where the part before ends, where the next begins]
        for (int i = 0; i < line.length(); i++) {
            char c = line.charAt(i);
            boolean digitsAround = i > 0
                    && i + 1 < line.length()
                    && Character.isDigit(line.charAt(i - 1))
                    && Character.isDigit(line.charAt(i + 1));
            boolean spaceNext = i + 1 == line.length() || Character.isWhitespace(line.charAt(i + 1));
            if (c == '\n' || c == ';' || c == '!' || c == '?' || (c == ',' && !digitsAround && !betweenDays(line, i))) {
                cuts.add(new int[] {i, i + 1});
            } else if (c == '.' && spaceNext && !afterShortForm(line, i)) {
                cuts.add(new int[] {i, i + 1});
            }
        }
        Matcher m = starts.matcher(line);
        while (m.find()) {
            if (m.start() > 0) {
                cuts.add(new int[] {m.start(), m.end()});
            }
        }
        cuts.sort((a, b) -> Integer.compare(a[0], b[0]));
        List<int[]> spans = new ArrayList<>();
        int from = 0;
        for (int[] cut : cuts) {
            if (cut[0] < from) {
                continue;
            }
            add(spans, line, from, cut[0]);
            from = cut[1];
        }
        add(spans, line, from, line.length());
        return spans;
    }

    private static final Pattern DAY_BEFORE = Pattern.compile(WD + "s?\\s*$", Pattern.CASE_INSENSITIVE);
    private static final Pattern DAY_AFTER =
            Pattern.compile("^\\s*(?:and\\s+)?" + WD + "s?\\b", Pattern.CASE_INSENSITIVE);

    /** True when the comma at this place stands in a list of days: "Monday, Wednesday and Friday". */
    private static boolean betweenDays(String line, int comma) {
        return DAY_BEFORE.matcher(line.substring(0, comma)).find()
                && DAY_AFTER.matcher(line.substring(comma + 1)).find();
    }

    /** True when the full stop at this place ends a short form or a date ("Dr.", "12.4."), not a sentence. */
    private static boolean afterShortForm(String line, int dot) {
        int start = dot;
        while (start > 0 && !Character.isWhitespace(line.charAt(start - 1))) {
            start--;
        }
        String word = line.substring(start, dot).toLowerCase(Locale.ROOT);
        return word.matches("dr|mr|mrs|ms|st|no|vs|etc|approx|tel|e\\.g|i\\.e|\\d{1,2}\\.\\d{1,2}");
    }

    private static final Pattern LEADING =
            Pattern.compile("^(?:(?:oh\\s+)?and|also|then|plus)\\b[\\s,]*", Pattern.CASE_INSENSITIVE);

    /** Adds a part without the space around it and without an "and" in front. Nothing is added for an empty one. */
    private static void add(List<int[]> spans, String line, int from, int to) {
        while (from < to && (Character.isWhitespace(line.charAt(from)) || line.charAt(from) == ',')) {
            from++;
        }
        while (to > from
                && (Character.isWhitespace(line.charAt(to - 1)) || ".,;!?".indexOf(line.charAt(to - 1)) >= 0)) {
            to--;
        }
        Matcher lead = LEADING.matcher(line).region(from, to);
        if (lead.lookingAt() && lead.end() < to) {
            from = lead.end();
        }
        if (from < to) {
            spans.add(new int[] {from, to});
        }
    }

    /** The first names of the circle as one alternative for a pattern; something that matches nothing when there are none. */
    private static String names(Context context) {
        List<String> names = context.people().stream()
                .map(p -> p.name().strip().toLowerCase(Locale.ROOT))
                .filter(n -> !n.isEmpty())
                .sorted((a, b) -> b.length() - a.length())
                .map(Pattern::quote)
                .toList();
        return names.isEmpty() ? "(?!)" : "(?:" + String.join("|", names) + ")";
    }

    // ---------- one part ----------

    /** One part of a line while it is being read: which of its letters have been used, and for what. */
    private static final class Clause {
        final int start;
        final String text;
        final String low;
        final boolean[] used;
        final List<Piece> pieces = new ArrayList<>();

        Clause(String line, int start, int end) {
            this.start = start;
            this.text = line.substring(start, end);
            StringBuilder lower = new StringBuilder(text.length());
            for (int i = 0; i < text.length(); i++) {
                lower.append(Character.toLowerCase(text.charAt(i)));
            }
            this.low = lower.toString();
            this.used = new boolean[text.length()];
        }

        boolean free(int from, int to) {
            for (int i = from; i < to; i++) {
                if (used[i]) {
                    return false;
                }
            }
            return true;
        }

        void use(int from, int to) {
            Arrays.fill(used, from, to, true);
        }

        void piece(int from, int to, PieceKind what, String became) {
            use(from, to);
            pieces.add(new Piece(start + from, start + to, text.substring(from, to), what, became));
        }

        /** The first match of a pattern that touches nothing used yet. */
        Matcher find(Pattern pattern) {
            Matcher m = pattern.matcher(low);
            while (m.find()) {
                if (m.end() > m.start() && free(m.start(), m.end())) {
                    return m;
                }
            }
            return null;
        }

        /** What hasn't been used, as the person wrote it. */
        String rest() {
            StringBuilder rest = new StringBuilder();
            for (int i = 0; i < text.length(); i++) {
                rest.append(used[i] ? ' ' : text.charAt(i));
            }
            return rest.toString().replaceAll("\\s+", " ").strip();
        }

        /** Where the unused text begins. */
        int firstFree() {
            int i = 0;
            while (i < text.length() && (used[i] || Character.isWhitespace(text.charAt(i)))) {
                i++;
            }
            return i;
        }
    }

    /** What has been made of one part so far. */
    private static final class Draft {
        ReadAs as = ReadAs.NOTE;
        String title = "";
        LocalDate day;
        boolean deadline;
        int dayEnd = -1;
        LocalTime time;
        LocalTime endTime;
        String part;
        Integer remindMinutes;
        Recurrence repeat;
        UUID personId;
        PersonRole personRole;
        boolean asked; // "remind me to…", "don't forget…"
        boolean bought; // "buy…", "we need…"
        boolean listed; // "…on the packing list"
        boolean shopping;
        UUID listId;
        String listName;
        String what; // for a list: what goes on it
        int whatAt;
        CodeKind code;
        Integer looseHour; // a bare hour, kept so "in the morning" can still change what it means
        int looseMinute;
        boolean saidAmPm;
        boolean nothingLeft; // every word was used for a day, a time or a reminder: there is no title
        boolean oneLine; // "mac and cheese" is one thing to buy
        int nameAt = -1; // a name that stays in the title, and where it stands
        int nameEnd = -1;
        boolean nameBare;

        boolean hasWhen() {
            return day != null || time != null || repeat != null;
        }

        /** True for a bare few words that can go on with the list of the part before: "torch", "2 batteries". */
        boolean carriesOn() {
            String words = what != null ? what : title;
            return (as == ReadAs.NOTE || (as == ReadAs.LIST_ITEM && !listed))
                    && !hasWhen()
                    && personRole != PersonRole.GIVEN_TO
                    && !words.isEmpty()
                    && words.split("\\s+").length <= 4;
        }

        List<Item> items(Clause clause) {
            if (as != ReadAs.LIST_ITEM) {
                return List.of(new Item(
                        as,
                        clause.text.strip(),
                        title,
                        day,
                        time,
                        endTime,
                        personId,
                        personRole,
                        remindMinutes,
                        repeat,
                        false,
                        null,
                        null,
                        null,
                        code,
                        inOrder(clause.pieces)));
            }
            // One line for a list can name several things: "eggs and flour", "2x oat milk, bread".
            List<Item> items = new ArrayList<>();
            String all = what == null ? title : what;
            int at = 0;
            for (String each : oneLine ? new String[] {all} : all.split(BETWEEN_THINGS)) {
                if (each.isBlank()) {
                    continue;
                }
                int found = clause.low.indexOf(each.toLowerCase(Locale.ROOT), Math.max(at, 0));
                int from = found < 0 ? whatAt : found;
                at = from + each.length();
                List<Piece> pieces = new ArrayList<>();
                String[] counted = counted(each.strip());
                if (counted[0] != null) {
                    pieces.add(new Piece(
                            clause.start + from,
                            clause.start + from + each.length(),
                            each,
                            PieceKind.AMOUNT,
                            "×" + counted[0]));
                }
                for (Piece piece : clause.pieces) {
                    if (piece.what() == PieceKind.LIST || piece.what() == PieceKind.PERSON) {
                        pieces.add(piece);
                    }
                }
                items.add(new Item(
                        ReadAs.LIST_ITEM,
                        listed && listId == null && !shopping ? clause.text.strip() : each.strip(),
                        Words.capital(counted[1]),
                        null,
                        null,
                        null,
                        personId,
                        personRole,
                        null,
                        null,
                        shopping,
                        listId,
                        listName,
                        counted[0],
                        null,
                        List.copyOf(pieces)));
            }
            return items;
        }
    }

    private static Draft read(Clause c, Context context, String names) {
        Draft d = new Draft();
        if (secret(c, d)) {
            return d;
        }
        remindBefore(c, d);
        repeats(c, d, context);
        clockTimes(c, d);
        days(c, d, context);
        looseTimes(c, d, context);
        settleWhen(c, d, context);
        list(c, d, context);
        people(c, d, context, names);
        decide(c, d, context, names);
        return d;
    }

    // ---------- secrets ----------

    /** True when the part looks like a code or a password. It is then read no further. */
    private static boolean secret(Clause c, Draft d) {
        String text = c.text.strip();
        CodeKind kind = null;
        Matcher iban = IBAN.matcher(text);
        Matcher card = CARD.matcher(text);
        if (iban.find() && ibanAddsUp(iban.group())) {
            kind = CodeKind.IBAN;
        } else if (card.find() && luhn(card.group().replaceAll("[ -]", ""))) {
            kind = CodeKind.CARD;
        } else {
            Matcher word = SECRET_WORD.matcher(c.low.strip());
            if (word.find() && !NOT_A_SECRET_CODE.matcher(c.low).find()) {
                String value =
                        word.group("value") == null ? "" : word.group("value").strip();
                boolean password = word.group("kind").startsWith("pass")
                        || word.group("kind").equals("pwd")
                        || word.group("kind").equals("login");
                boolean said = word.group("sep") != null;
                boolean oneToken = !value.isEmpty() && !value.contains(" ");
                boolean hasDigit = value.chars().anyMatch(Character::isDigit);
                boolean looksMadeUp = oneToken && (hasDigit || value.matches(".*[^\\p{L}\\d].*"));
                // "The password is on the fridge" says where it is, not what it is.
                boolean aboutIt = value.matches(
                        "(?:on|in|at|under|with|written|saved|kept|stored|the same|wrong|not|changed|expired|here|there|somewhere)\\b.*");
                if (password
                        ? (!value.isEmpty() && ((said && !aboutIt) || looksMadeUp))
                        : (hasDigit && value.split("\\s+").length <= 3)) {
                    kind = password ? CodeKind.PASSWORD : CodeKind.CODE;
                }
            }
            if (kind == null && noWords(text)) {
                kind = text.contains(" ") || text.matches("[\\d#*-]+") ? CodeKind.CODE : CodeKind.PASSWORD;
            }
        }
        if (kind == null) {
            return false;
        }
        d.as = ReadAs.CODE;
        d.code = kind;
        d.title = Words.capital(text.replaceAll("(?i)^(?:and\\s+)?(?:the|my|our)\\s+", "")
                .replaceAll("(?i)\\s+(?:is|are)\\s+", " ")
                .replaceAll("\\s*[:=]\\s*", " ")
                .replaceAll("[.!]+$", "")
                .strip());
        c.piece(
                0,
                c.text.length(),
                PieceKind.CODE,
                switch (kind) {
                    case IBAN -> "Looks like a bank account number";
                    case CARD -> "Looks like a card number";
                    case PASSWORD -> "Looks like a password";
                    case CODE -> "Looks like a code";
                });
        return true;
    }

    /**
     * True for digits and symbols with no words: "4471", "8842-1173", "Xk9#mP2$vL". A day, a time or an
     * amount ("12/4", "10:30", "2x") is not that.
     */
    private static boolean noWords(String text) {
        if (text.contains(" ")) {
            return text.matches("[\\d#* -]+") && text.replaceAll("\\D", "").length() >= 4;
        }
        if (text.matches("\\d{1,2}[:./]\\d{1,2}(?:[./]\\d{2,4})?\\.?|\\d{1,3}\\s*(?:x|×)|(?:19|20)\\d{2}|\\d{1,3}")) {
            return false;
        }
        if (text.matches("[\\d#*-]+")) {
            return text.replaceAll("\\D", "").length() >= 4;
        }
        int kinds = (text.matches(".*[a-z].*") ? 1 : 0)
                + (text.matches(".*[A-Z].*") ? 1 : 0)
                + (text.matches(".*\\d.*") ? 1 : 0)
                + (text.matches(".*[^A-Za-z\\d].*") ? 1 : 0);
        return text.length() >= 8 && kinds >= 3 && text.matches(".*\\d.*");
    }

    /** The check every IBAN carries: moved round and read as one number, it leaves 1 when divided by 97. */
    static boolean ibanAddsUp(String iban) {
        String plain = iban.replace(" ", "");
        if (plain.length() < 15 || plain.length() > 34) {
            return false;
        }
        String moved = plain.substring(4) + plain.substring(0, 4);
        int rest = 0;
        for (char ch : moved.toCharArray()) {
            int value = Character.isDigit(ch) ? ch - '0' : ch - 'A' + 10;
            rest = (value > 9 ? rest * 100 + value : rest * 10 + value) % 97;
        }
        return rest == 1;
    }

    /** The check every card number carries (Luhn). */
    static boolean luhn(String digits) {
        int sum = 0;
        boolean twice = false;
        for (int i = digits.length() - 1; i >= 0; i--) {
            int n = digits.charAt(i) - '0';
            if (twice) {
                n = n * 2 > 9 ? n * 2 - 9 : n * 2;
            }
            sum += n;
            twice = !twice;
        }
        return digits.length() >= 13 && sum % 10 == 0;
    }

    // ---------- reminding and repeating ----------

    private static void remindBefore(Clause c, Draft d) {
        Matcher m = c.find(REMIND_BEFORE);
        if (m == null) {
            return;
        }
        int minutes;
        if (m.group("the") != null) {
            minutes = m.group("the").equals("week") ? 10080 : 1440;
        } else {
            String unit = m.group("u");
            int each = unit.startsWith("m") ? 1 : unit.startsWith("h") ? 60 : unit.startsWith("d") ? 1440 : 10080;
            String n = m.group("n").replaceAll("\\s+", " ");
            minutes = n.startsWith("half") ? each / 2 : number(n) * each;
        }
        d.remindMinutes = Math.clamp(minutes, 0, 40320);
        c.piece(m.start(), m.end(), PieceKind.REMIND, Words.before(d.remindMinutes));
    }

    private static void repeats(Clause c, Draft d, Context context) {
        Matcher m = c.find(EVERY_DAYS);
        if (m == null) {
            m = c.find(PLURAL_DAYS);
        }
        if (m != null) {
            Set<Weekday> days = EnumSet.noneOf(Weekday.class);
            Matcher each = Pattern.compile(WD).matcher(m.group("days"));
            while (each.find()) {
                days.add(weekday(each.group()));
            }
            boolean other = m.pattern() == EVERY_DAYS && m.group("other") != null;
            d.repeat = new Recurrence(Recurrence.Unit.WEEK, other ? 2 : 1, days, null);
            d.part = m.group("part");
            c.piece(m.start(), m.end(), PieceKind.REPEAT, d.repeat.label());
            return;
        }
        m = c.find(WEEKDAYS);
        if (m != null) {
            d.repeat = m.group("w").equals("weekdays")
                    ? Recurrence.weekly(Weekday.MON, Weekday.TUE, Weekday.WED, Weekday.THU, Weekday.FRI)
                    : Recurrence.weekly(Weekday.SAT, Weekday.SUN);
            c.piece(m.start(), m.end(), PieceKind.REPEAT, d.repeat.label());
            return;
        }
        m = c.find(EVERY_UNIT);
        if (m != null) {
            int every = m.group("other") != null ? 2 : m.group("n") != null ? Integer.parseInt(m.group("n")) : 1;
            String unit = m.group("u");
            d.repeat = switch (unit) {
                case "week" -> new Recurrence(Recurrence.Unit.WEEK, every, Set.of(), null);
                case "fortnight" -> new Recurrence(Recurrence.Unit.WEEK, 2 * every, Set.of(), null);
                case "month" -> new Recurrence(Recurrence.Unit.MONTH, every, Set.of(), null);
                case "year" -> new Recurrence(Recurrence.Unit.YEAR, every, Set.of(), null);
                case "weekday" -> Recurrence.weekly(Weekday.MON, Weekday.TUE, Weekday.WED, Weekday.THU, Weekday.FRI);
                default -> new Recurrence(Recurrence.Unit.DAY, every, Set.of(), null);
            };
            if (Set.of("morning", "afternoon", "evening", "night").contains(unit)) {
                d.part = unit;
            }
            c.piece(m.start(), m.end(), PieceKind.REPEAT, d.repeat.label());
            return;
        }
        m = c.find(ADVERB);
        if (m != null) {
            d.repeat = switch (m.group("a")) {
                case "daily" -> Recurrence.every(Recurrence.Unit.DAY);
                case "weekly" -> Recurrence.every(Recurrence.Unit.WEEK);
                case "fortnightly", "biweekly" -> new Recurrence(Recurrence.Unit.WEEK, 2, Set.of(), null);
                case "monthly" -> Recurrence.every(Recurrence.Unit.MONTH);
                default -> Recurrence.every(Recurrence.Unit.YEAR);
            };
            c.piece(m.start(), m.end(), PieceKind.REPEAT, d.repeat.label());
        }
    }

    // ---------- times ----------

    /** Times that say so themselves: "15:30", "3pm", "at six", "noon", "from 10 to 11:30". */
    private static void clockTimes(Clause c, Draft d) {
        Matcher m = c.find(RANGE);
        if (m != null) {
            boolean clear = m.group("m1") != null
                    || m.group("m2") != null
                    || m.group("ap1") != null
                    || m.group("ap2") != null
                    || "from".equals(m.group("lead"))
                    || "between".equals(m.group("lead"));
            boolean and = c.low.substring(m.start(), m.end()).contains(" and ");
            int h1 = Integer.parseInt(m.group("h1"));
            int h2 = Integer.parseInt(m.group("h2"));
            if (clear && h1 <= 23 && h2 <= 23 && (!and || "between".equals(m.group("lead")))) {
                String ap1 = m.group("ap1") != null ? m.group("ap1") : m.group("ap2");
                LocalTime from = clock(h1, minute(m.group("m1")), ap1, m.group("m1") != null, null);
                LocalTime to = clock(h2, minute(m.group("m2")), m.group("ap2"), m.group("m2") != null, null);
                if (m.group("ap1") == null
                        && m.group("ap2") != null
                        && from != null
                        && to != null
                        && from.isAfter(to)) {
                    from = clock(h1, minute(m.group("m1")), "am", true, null); // "10-2pm" starts in the morning
                }
                if (from != null && to != null && !to.isAfter(from) && to.getHour() < 12) {
                    to = to.plusHours(12); // "from 10 to 1"
                }
                if (from != null && to != null && to.isAfter(from)) {
                    d.saidAmPm = ap1 != null || from.getHour() > 12;
                    d.time = from;
                    d.endTime = to;
                    c.piece(m.start(), m.end(), PieceKind.TIME, Words.time(from) + " to " + Words.time(to));
                    return;
                }
            }
        }
        for (Pattern pattern : List.of(CLOCK, AT_DOT, AM_PM)) {
            m = c.find(pattern);
            if (m != null) {
                int hour = Integer.parseInt(m.group("h"));
                String ap = m.group("ap") == null ? null : m.group("ap").replace(".", "");
                LocalTime time = hour > 23 ? null : clock(hour, minute(m.group("m")), ap, true, null);
                if (time != null) {
                    d.saidAmPm = ap != null || hour > 12;
                    time(c, d, m, time);
                    return;
                }
            }
        }
        m = c.find(NAMED_TIME);
        if (m != null) {
            time(
                    c,
                    d,
                    m,
                    switch (m.group("n")) {
                        case "midnight" -> LocalTime.MIDNIGHT;
                        case "lunchtime" -> LocalTime.of(12, 30);
                        default -> LocalTime.NOON;
                    });
            return;
        }
        m = c.find(QUARTERS);
        if (m != null) {
            int hour = number(m.group("h"));
            LocalTime full = clock(hour, 0, null, false, null);
            if (full != null) {
                time(
                        c,
                        d,
                        m,
                        switch (m.group("q")) {
                            case "quarter past" -> full.plusMinutes(15);
                            case "quarter to" -> full.minusMinutes(15);
                            default -> full.plusMinutes(30);
                        });
                return;
            }
        }
        m = c.find(WORD_HOUR);
        if (m == null) {
            m = c.find(O_CLOCK);
        }
        if (m != null) {
            boolean word = m.pattern() == WORD_HOUR;
            String minutes = word ? m.group("m") : null;
            int minute =
                    minutes == null ? 0 : minutes.startsWith("thirty") ? 30 : minutes.startsWith("fifteen") ? 15 : 45;
            LocalTime time = clock(number(m.group("h")), minute, word ? m.group("ap") : null, false, null);
            if (time != null) {
                d.saidAmPm = word && m.group("ap") != null;
                d.looseHour = d.saidAmPm ? null : number(m.group("h"));
                d.looseMinute = minute;
                time(c, d, m, time);
            }
        }
    }

    /** A bare hour that needs its neighbours to make sense: "at 10", or the "10" in "Saturday 10". */
    private static void looseTimes(Clause c, Draft d, Context context) {
        if (d.time != null) {
            return;
        }
        Matcher m = c.find(AT_HOUR);
        if (m != null && Integer.parseInt(m.group("h")) <= 23) {
            d.looseHour = Integer.parseInt(m.group("h"));
            time(c, d, m, clock(d.looseHour, 0, null, false, d.part));
            return;
        }
        if (d.dayEnd >= 0 && d.dayEnd <= c.low.length()) {
            m = AFTER_DAY.matcher(c.low.substring(d.dayEnd));
            if (m.find() && Integer.parseInt(m.group("h")) <= 23 && c.free(d.dayEnd + m.start(), d.dayEnd + m.end())) {
                int minute = minute(m.group("m"));
                LocalTime time = clock(Integer.parseInt(m.group("h")), minute, null, m.group("m") != null, d.part);
                if (time != null) {
                    if (m.group("m") == null) {
                        d.looseHour = Integer.parseInt(m.group("h"));
                    }
                    d.time = time;
                    c.piece(d.dayEnd + m.start(), d.dayEnd + m.end(), PieceKind.TIME, Words.time(time));
                    return;
                }
            }
        }
        m = c.find(IN_A_WHILE);
        if (m != null && context.now() != null) {
            String n = m.group("n").replaceAll("\\s+", " ");
            int each = m.group("u").startsWith("m") ? 1 : 60;
            int minutes = n.startsWith("half") ? each / 2 : number(n) * each;
            java.time.LocalDateTime then = context.today().atTime(context.now()).plusMinutes(minutes);
            d.day = then.toLocalDate();
            d.time = then.toLocalTime().withSecond(0).withNano(0);
            c.piece(m.start(), m.end(), PieceKind.TIME, Words.when(d.day, d.time, context.today()));
        }
    }

    private static void time(Clause c, Draft d, Matcher m, LocalTime time) {
        d.time = time;
        c.piece(m.start(), m.end(), PieceKind.TIME, Words.time(time));
    }

    private static int minute(String digits) {
        return digits == null ? 0 : Integer.parseInt(digits);
    }

    /**
     * An hour and a minute as a time of day. With am or pm it is what it says. A time written out
     * ("7:30") is taken as written. A bare hour from 1 to 7 is after noon, unless the morning was named; any
     * bare hour is after noon when the evening was.
     */
    private static LocalTime clock(int hour, int minute, String amPm, boolean written, String part) {
        if (minute > 59 || hour > 23) {
            return null;
        }
        int h = hour;
        if (amPm != null) {
            if (hour < 1 || hour > 12) {
                return hour <= 23 ? LocalTime.of(hour, minute) : null;
            }
            h = amPm.startsWith("p") ? (hour == 12 ? 12 : hour + 12) : (hour == 12 ? 0 : hour);
        } else if ("evening".equals(part) || "night".equals(part)) {
            h = hour < 12 ? hour + 12 : hour;
        } else if ("afternoon".equals(part)) {
            h = hour < 12 && hour >= 1 && hour <= 7 ? hour + 12 : hour;
        } else if (!written && !"morning".equals(part) && hour >= 1 && hour <= 7) {
            h = hour + 12;
        }
        return LocalTime.of(h % 24, minute);
    }

    // ---------- days ----------

    private static void days(Clause c, Draft d, Context context) {
        LocalDate today = context.today();
        Matcher m = c.find(ISO);
        if (m != null) {
            LocalDate day = date(
                    Integer.parseInt(m.group("y")), Integer.parseInt(m.group("m")), Integer.parseInt(m.group("d")));
            if (day != null) {
                day(c, d, m, day, m.group("lead"), today);
                return;
            }
        }
        for (Pattern pattern : List.of(DAY_MONTH, MONTH_DAY)) {
            m = c.find(pattern);
            if (m != null) {
                int month = month(m.group("mon"));
                int dayOfMonth = Integer.parseInt(m.group("d"));
                LocalDate day = m.group("y") != null
                        ? date(Integer.parseInt(m.group("y")), month, dayOfMonth)
                        : coming(month, dayOfMonth, today);
                if (day != null) {
                    day(c, d, m, day, m.group("lead"), today);
                    return;
                }
            }
        }
        m = c.find(NUMBERS);
        if (m != null) {
            // Day first: 12/4 is the 12th of April. With a dot it needs more to be a day: "on 12.4", "12.4.",
            // "12.4.2027".
            boolean sure = m.group("sep").equals("/")
                    || m.group("lead") != null
                    || m.group("y") != null
                    || m.group("dot") != null;
            int month = Integer.parseInt(m.group("m"));
            int dayOfMonth = Integer.parseInt(m.group("d"));
            LocalDate day = !sure
                    ? null
                    : m.group("y") != null
                            ? date(year(m.group("y")), month, dayOfMonth)
                            : coming(month, dayOfMonth, today);
            if (day != null) {
                day(c, d, m, day, m.group("lead"), today);
                return;
            }
        }
        m = c.find(NEAR);
        if (m != null) {
            String rel = m.group("rel").replaceAll("\\s+", " ");
            LocalDate day = rel.endsWith("after tomorrow")
                    ? today.plusDays(2)
                    : rel.startsWith("tom") || rel.startsWith("tm") ? today.plusDays(1) : today;
            if (rel.equals("tonight")) {
                d.part = "evening";
            } else if (rel.startsWith("this ")) {
                d.part = rel.substring(5);
            } else if (m.group("part") != null) {
                d.part = m.group("part");
            }
            day(c, d, m, day, m.group("lead"), today);
            return;
        }
        m = c.find(IN_SOME);
        if (m != null) {
            String n = m.group("n") != null ? m.group("n") : m.group("n2");
            String unit = m.group("u") != null ? m.group("u") : m.group("u2");
            int count = number(n);
            LocalDate day = unit.startsWith("day")
                    ? today.plusDays(count)
                    : unit.startsWith("week")
                            ? today.plusWeeks(count)
                            : unit.startsWith("fortnight")
                                    ? today.plusWeeks(2L * count)
                                    : unit.startsWith("month") ? today.plusMonths(count) : today.plusYears(count);
            day(c, d, m, day, m.group("lead"), today);
            return;
        }
        m = c.find(NEXT);
        if (m != null) {
            String rel = m.group("rel").replaceAll("\\s+", " ");
            LocalDate monday = today.minusDays(today.getDayOfWeek().getValue() - 1L);
            LocalDate saturday = monday.plusDays(5);
            LocalDate day = switch (rel) {
                case "next week" -> monday.plusWeeks(1);
                case "next month" -> YearMonth.from(today).plusMonths(1).atDay(1);
                case "next year" -> LocalDate.of(today.getYear() + 1, 1, 1);
                case "next weekend" -> saturday.plusWeeks(1);
                default -> today.isAfter(saturday) ? today : saturday; // this weekend
            };
            day(c, d, m, day, m.group("lead"), today);
            return;
        }
        m = c.find(THE_NTH);
        if (m != null) {
            int dayOfMonth = Integer.parseInt(m.group("d"));
            YearMonth month = YearMonth.from(today);
            for (int tries = 0; tries < 12; tries++, month = month.plusMonths(1)) {
                if (dayOfMonth <= month.lengthOfMonth()
                        && !month.atDay(dayOfMonth).isBefore(today)) {
                    day(c, d, m, month.atDay(dayOfMonth), m.group("lead"), today);
                    return;
                }
            }
        }
        Matcher w = WEEKDAY.matcher(c.low);
        while (w.find()) {
            if (!c.free(w.start(), w.end()) || !reallyADay(c, w)) {
                continue;
            }
            int wanted = weekday(w.group("wd")).ordinal() + 1;
            int ahead = Math.floorMod(wanted - today.getDayOfWeek().getValue(), 7);
            String lead = w.group("lead");
            LocalDate day;
            if ("next".equals(lead)) {
                day = today.minusDays(today.getDayOfWeek().getValue() - 1L)
                        .plusWeeks(1)
                        .plusDays(wanted - 1L);
            } else {
                day = today.plusDays(ahead == 0 && !"this".equals(lead) ? 7 : ahead);
            }
            if (w.group("part") != null) {
                d.part = w.group("part");
            }
            day(c, d, w, day, lead, today);
            return;
        }
    }

    /**
     * "Sun", "sat", "mon" and "wed" are words too ("sun cream"). The short form counts as a day only with
     * "on", "next" and the like in front, with a time or a part of the day behind it, or at the end of the line.
     */
    private static boolean reallyADay(Clause c, Matcher w) {
        String word = w.group("wd");
        if (!Set.of("sun", "sat", "mon", "wed").contains(word)) {
            return true;
        }
        if (w.group("lead") != null || w.group("part") != null) {
            return true;
        }
        String after = c.low.substring(w.end());
        return (after.isBlank() && w.start() > 0) || after.matches("^\\s*(?:at\\b|@|\\d).*");
    }

    private static void day(Clause c, Draft d, Matcher m, LocalDate day, String lead, LocalDate today) {
        d.day = day;
        d.dayEnd = m.end();
        d.deadline = lead != null && lead.matches("by|before|until|till|due.*");
        c.piece(m.start(), m.end(), PieceKind.DAY, Words.day(day, today));
    }

    /** The next time this day of the year comes round, today counted. */
    private static LocalDate coming(int month, int dayOfMonth, LocalDate today) {
        LocalDate thisYear = date(today.getYear(), month, dayOfMonth);
        if (thisYear != null && !thisYear.isBefore(today)) {
            return thisYear;
        }
        LocalDate nextYear = date(today.getYear() + 1, month, dayOfMonth);
        return nextYear != null ? nextYear : date(today.getYear() + 2, month, dayOfMonth);
    }

    private static LocalDate date(int year, int month, int dayOfMonth) {
        try {
            return LocalDate.of(year, month, dayOfMonth);
        } catch (DateTimeException noSuchDay) {
            return null;
        }
    }

    private static int year(String digits) {
        int year = Integer.parseInt(digits);
        return year < 100 ? 2000 + year : year;
    }

    private static int month(String word) {
        return List.of("jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec")
                        .indexOf(word.substring(0, 3))
                + 1;
    }

    private static Weekday weekday(String word) {
        return Weekday.values()[
                List.of("mon", "tue", "wed", "thu", "fri", "sat", "sun").indexOf(word.substring(0, 3))];
    }

    private static int number(String word) {
        String n = word.strip();
        if (n.equals("a") || n.equals("an")) {
            return 1;
        }
        int index = NUMBER_WORDS.indexOf(n);
        return index >= 0 ? index + 1 : Integer.parseInt(n);
    }

    /**
     * Fills in what the words left out: a part of the day without a time is a usual time for it, a time
     * without a day is today (or tomorrow, when that time has passed), something that repeats starts the
     * next time it comes round, and an event takes half an hour.
     */
    private static void settleWhen(Clause c, Draft d, Context context) {
        Matcher part = d.part == null ? c.find(PART_OF_DAY) : null;
        if (part != null) {
            d.part = part.group("part");
            if (d.time == null) {
                c.piece(part.start(), part.end(), PieceKind.TIME, Words.time(usual(d.part)));
            } else {
                c.use(part.start(), part.end());
            }
        }
        if (d.time != null && d.looseHour != null && d.part != null) {
            d.time = clock(d.looseHour, d.looseMinute, null, false, d.part); // "at 6 in the morning"
        } else if (d.time != null && !d.saidAmPm && d.part != null && d.time.getHour() >= 1 && d.time.getHour() < 12) {
            // "tonight 7:30" is half past seven in the evening
            boolean late = d.part.equals("evening") || d.part.equals("night");
            if (late || (d.part.equals("afternoon") && d.time.getHour() <= 7)) {
                d.time = d.time.plusHours(12);
                d.endTime = d.endTime == null || d.endTime.getHour() >= 12 ? d.endTime : d.endTime.plusHours(12);
            }
        }
        if (d.time == null && d.part != null) {
            d.time = usual(d.part);
        }
        LocalDate today = context.today();
        if (d.repeat != null) {
            if (d.repeat.unit() == Recurrence.Unit.WEEK && !d.repeat.days().isEmpty()) {
                d.day = d.repeat.nextOnOrAfter(today, today).orElse(today);
            } else if (d.day == null) {
                d.day = today;
            }
            if (d.day.equals(today) && d.time != null && context.now() != null && !d.time.isAfter(context.now())) {
                d.day = d.repeat.nextAfter(d.day, today).orElse(today);
            }
        }
        if (d.day == null && d.time != null) {
            d.day = context.now() != null && !d.time.isAfter(context.now()) ? today.plusDays(1) : today;
        }
    }

    private static LocalTime usual(String part) {
        return switch (part) {
            case "morning" -> LocalTime.of(9, 0);
            case "afternoon" -> LocalTime.of(15, 0);
            case "night" -> LocalTime.of(21, 0);
            default -> LocalTime.of(19, 0);
        };
    }

    // ---------- lists ----------

    private static void list(Clause c, Draft d, Context context) {
        if (d.hasWhen()) {
            return;
        }
        String low = c.low.strip().replaceAll("[.!]+$", "");
        int shift = c.low.indexOf(low);
        for (Pattern pattern : List.of(SHOPPING_COLON, LIST_COLON, ADD_TO_LIST, ON_THE_LIST, ADD_TO)) {
            Matcher m = pattern.matcher(low);
            if (!m.matches()) {
                continue;
            }
            String name = m.group("name") == null ? "" : m.group("name").strip();
            boolean shopping = SHOPPING_NAMES.contains(name);
            NamedList list = shopping ? null : list(context, name);
            if (pattern == ADD_TO && !shopping && list == null) {
                continue; // "put the bins out" names no list
            }
            d.as = ReadAs.LIST_ITEM;
            d.listed = true;
            d.shopping = shopping;
            d.listId = list == null ? null : list.id();
            d.listName = shopping ? null : list == null ? Words.capital(name) : list.title();
            d.oneLine = !shopping && list == null; // a list nobody has: the words stay together, to be kept as they are
            d.what = c.text.substring(shift + m.start("what"), shift + m.end("what"));
            d.whatAt = shift + m.start("what");
            c.use(0, c.text.length());
            c.pieces.add(new Piece(
                    c.start + (m.start("what") == 0 ? shift + m.end("what") : 0),
                    c.start + (m.start("what") == 0 ? c.text.length() : shift + m.start("what")),
                    m.start("what") == 0
                            ? c.text.substring(shift + m.end("what"))
                            : c.text.substring(0, shift + m.start("what")),
                    PieceKind.LIST,
                    shopping ? "The shopping list" : d.listName));
            return;
        }
    }

    /** The list of the circle a name means: its title, with or without "list" on the end. */
    private static NamedList list(Context context, String name) {
        String wanted =
                name.toLowerCase(Locale.ROOT).replaceAll("\\s+list$", "").strip();
        NamedList starts = null;
        for (NamedList list : context.lists()) {
            String title = list.title()
                    .toLowerCase(Locale.ROOT)
                    .replaceAll("\\s+list$", "")
                    .strip();
            if (title.equals(wanted)) {
                return list;
            }
            if (starts == null
                    && !wanted.isEmpty()
                    && (title.startsWith(wanted + " ") || wanted.startsWith(title + " "))) {
                starts = list;
            }
        }
        return starts;
    }

    /** "2x oat milk" is 2 of "oat milk"; "500g flour" is 500 g of flour; "a cucumber" is a cucumber. [how many, what]. */
    private static String[] counted(String each) {
        String low = each.toLowerCase(Locale.ROOT);
        Matcher m = TIMES_BEFORE.matcher(low);
        if (m.find()) {
            return new String[] {m.group("n"), each.substring(m.end()).strip()};
        }
        m = TIMES_AFTER.matcher(low);
        if (m.find()) {
            return new String[] {m.group("n"), each.substring(0, m.start()).strip()};
        }
        m = UNIT.matcher(low);
        if (m.find() && m.end() < each.length()) {
            String n = m.group("n").matches("an?")
                    ? "1"
                    : NUMBER_WORDS.contains(m.group("n")) ? String.valueOf(number(m.group("n"))) : m.group("n");
            return new String[] {n + " " + m.group("u"), each.substring(m.end()).strip()};
        }
        m = SOME.matcher(low);
        if (m.find() && m.end() < each.length()) {
            String n = m.group("n");
            String many = n.matches("\\d+") ? n : NUMBER_WORDS.contains(n) ? String.valueOf(number(n)) : null;
            return new String[] {
                "1".equals(many) ? null : many, each.substring(m.end()).strip()
            };
        }
        return new String[] {null, each};
    }

    /** True for a few words whose last one is something people buy: "oat milk", "2x eggs", "toilet paper". */
    private static boolean buyable(String each) {
        String what = counted(each.strip())[1]
                .toLowerCase(Locale.ROOT)
                .replaceAll("[^\\p{L}\\s'-]", "")
                .strip();
        if (what.isEmpty()) {
            return false;
        }
        String[] words = what.split("\\s+");
        if (words.length > 4) {
            return false;
        }
        String last = words[words.length - 1];
        return GROCERIES.contains(last)
                || GROCERIES.contains(singular(last))
                || GROCERIES.contains(what.replace(" ", ""));
    }

    private static final String BETWEEN_THINGS = "\\s*,\\s*|\\s+and\\s+|\\s*&\\s*|\\s*\\+\\s*";

    /** True when every thing named, between the commas and the "and"s, is something people buy. */
    private static boolean allBuyable(String things) {
        return Arrays.stream(things.split(BETWEEN_THINGS)).allMatch(LineReader::buyable);
    }

    private static String singular(String word) {
        if (word.endsWith("ies") && word.length() > 4) {
            return word.substring(0, word.length() - 3) + "y";
        }
        if (word.matches(".*(?:oes|ches|shes|xes|sses)$")) {
            return word.substring(0, word.length() - 2);
        }
        return word.endsWith("s") && !word.endsWith("ss") ? word.substring(0, word.length() - 1) : word;
    }

    // ---------- people ----------

    private static void people(Clause c, Draft d, Context context, String names) {
        if (d.as == ReadAs.LIST_ITEM) {
            return;
        }
        int at = c.firstFree();
        String here = c.low.substring(at);
        Matcher m = Pattern.compile("^(?:please\\s+)?(?:remind|tell|ask)\\s+(?<who>me|us|myself|" + names
                        + ")\\b(?:\\s+(?:to|about|that|of))?\\s*")
                .matcher(here);
        if (m.find()) {
            d.asked = true;
            String who = m.group("who");
            if (who.equals("us")) {
                c.use(at, at + m.end());
            } else {
                person(c, d, context, who, at, at + m.end(), PersonRole.GIVEN_TO);
            }
        } else if ((m = Pattern.compile(
                                "^(?:please\\s+)?(?:remember\\s+to|don'?t\\s+forget\\s+(?:to\\s+|about\\s+)?|reminder\\s*(?:to\\b|:|for\\b)?|to-?do\\s*:?)\\s*")
                        .matcher(here))
                .find()) {
            d.asked = true;
            c.use(at, at + m.end());
        } else if ((m = Pattern.compile("^@?(?<who>" + names + ")\\s*:\\s*|^@(?<at>" + names + ")\\b\\s*")
                        .matcher(here))
                .find()) {
            d.asked = true;
            person(
                    c,
                    d,
                    context,
                    m.group("who") != null ? m.group("who") : m.group("at"),
                    at,
                    at + m.end(),
                    PersonRole.GIVEN_TO);
        } else if ((m = Pattern.compile("^(?<who>" + names + ")\\s+(?:should|must|needs\\s+to|has\\s+to|to)\\s+")
                        .matcher(here))
                .find()) {
            d.asked = true;
            person(c, d, context, m.group("who"), at, at + m.end(), PersonRole.GIVEN_TO);
        }
        if (d.personId != null) {
            return;
        }
        m = c.find(Pattern.compile("\\bfor\\s+(?<who>me|myself|" + names + ")\\b(?!')"));
        if (m != null) {
            person(c, d, context, m.group("who"), m.start(), m.end(), PersonRole.FOR);
            return;
        }
        m = c.find(Pattern.compile("\\bwith\\s+(?<who>" + names + ")\\b(?!')"));
        if (m != null) {
            mention(c, d, context, m, PersonRole.WITH);
            return;
        }
        m = c.find(Pattern.compile("\\b(?<who>" + names + ")(?:'s|’s)?(?![\\p{L}\\d])"));
        if (m != null) {
            mention(c, d, context, m, PersonRole.ABOUT);
        }
    }

    /** A name that says who, and is taken out of the title: "for Leo", "remind Alex about". */
    private static void person(Clause c, Draft d, Context context, String who, int from, int to, PersonRole role) {
        boolean me = who.equals("me") || who.equals("myself");
        UUID id = me ? context.me() : byName(context, who);
        d.personId = id;
        d.personRole = id == null ? null : role;
        String label = me ? "For you" : (role == PersonRole.GIVEN_TO ? "Given to " : "For ") + Words.capital(who);
        if (id != null || me) {
            c.piece(from, to, PieceKind.PERSON, label);
        } else {
            c.use(from, to);
        }
    }

    /** A name that stays in the title: "Lunch with Alex", "Sign Mia's form". */
    private static void mention(Clause c, Draft d, Context context, Matcher m, PersonRole role) {
        d.personId = byName(context, m.group("who"));
        d.personRole = d.personId == null ? null : role;
        d.nameAt = m.start("who");
        d.nameEnd = m.end("who");
        d.nameBare = role == PersonRole.ABOUT && m.end() == m.end("who");
    }

    private static UUID byName(Context context, String name) {
        return context.people().stream()
                .filter(p -> p.name().strip().equalsIgnoreCase(name))
                .map(Person::id)
                .findFirst()
                .orElse(null);
    }

    // ---------- what it is ----------

    private static void decide(Clause c, Draft d, Context context, String names) {
        if (d.as == ReadAs.LIST_ITEM) {
            return;
        }
        String rest = c.rest();
        String low = rest.toLowerCase(Locale.ROOT);
        String[] words = low.replaceAll("[^\\p{L}\\d\\s'-]", " ").strip().split("\\s+");
        String first = words.length == 0 ? "" : words[0];
        boolean doing = DOING.contains(first);
        // "Water" and "wrap" are things to buy as well as things to do: with "the" after them they are a job.
        boolean surelyDoing = doing
                && (!GROCERIES.contains(singular(first))
                        || (words.length > 1
                                && Set.of(
                                                "the", "my", "our", "a", "an", "some", "his", "her", "their", "up",
                                                "out", "off")
                                        .contains(words[1])));
        boolean happening = Arrays.stream(words).anyMatch(HAPPENINGS::contains) && !doing;
        Matcher buying = BUYING.matcher(low);
        boolean buys = buying.find();
        if (d.asked) {
            d.as = ReadAs.REMINDER;
        } else if (d.hasWhen()) {
            d.as = doing || buys
                    ? ReadAs.REMINDER
                    : happening || d.endTime != null ? ReadAs.EVENT : context.whenUnsure();
        } else if (buys) {
            d.as = ReadAs.LIST_ITEM;
            d.bought = true;
            d.shopping = true;
            d.what = rest.substring(buying.end());
            d.whatAt = Math.max(0, c.low.indexOf(d.what.toLowerCase(Locale.ROOT)));
            c.pieces.add(new Piece(
                    c.start,
                    c.start + Math.min(buying.end(), c.text.length()),
                    rest.substring(0, buying.end()).strip(),
                    PieceKind.LIST,
                    "The shopping list"));
            return;
        } else if (surelyDoing) {
            d.as = ReadAs.REMINDER;
        } else if (!rest.isEmpty() && (allBuyable(rest) || buyable(rest))) {
            d.as = ReadAs.LIST_ITEM;
            d.shopping = true;
            d.oneLine = !allBuyable(rest);
            d.what = rest;
            d.whatAt = c.firstFree();
            return;
        } else if (doing) {
            d.as = ReadAs.REMINDER;
        } else {
            d.as = ReadAs.NOTE;
        }
        // A bare name next to an appointment says who it is for: "Dentist Mia" is the dentist, for Mia.
        if (d.as == ReadAs.EVENT && d.nameBare && d.personId != null) {
            String before = c.rest();
            c.piece(
                    d.nameAt,
                    d.nameEnd,
                    PieceKind.PERSON,
                    "For " + Words.capital(c.low.substring(d.nameAt, d.nameEnd)));
            if (title(c.rest()).isEmpty()) {
                // the name was all there was: keep it as the title
                Arrays.fill(c.used, d.nameAt, d.nameEnd, false);
                c.pieces.remove(c.pieces.size() - 1);
                rest = before;
            } else {
                d.personRole = PersonRole.FOR;
                rest = c.rest();
            }
        }
        d.title = title(rest);
        if (d.as == ReadAs.EVENT && d.time != null && d.endTime == null) {
            d.endTime = d.time.isAfter(LocalTime.of(23, 29)) ? LocalTime.of(23, 59) : d.time.plusMinutes(30);
        }
        if (d.title.isEmpty()) {
            d.nothingLeft = true;
            d.title = Words.capital(c.text.strip());
        }
    }

    /** What is left of a part once everything that was read is taken out, tidied: "about the bins" is "The bins". */
    static String title(String rest) {
        String title = rest.replaceAll("\\s+", " ").strip();
        boolean changed = true;
        while (changed && !title.isEmpty()) {
            changed = false;
            String[] words = title.split(" ");
            String first = words[0].toLowerCase(Locale.ROOT).replaceAll("[,:;-]+$", "");
            String last = words[words.length - 1].toLowerCase(Locale.ROOT).replaceAll("^[,:;-]+", "");
            if (words.length > 1
                            && Set.of("and", "also", "then", "to", "that", "about", "please", "on", "at", "by")
                                    .contains(first)
                    || first.isEmpty()) {
                title = title.substring(words[0].length()).strip();
                changed = true;
            } else if (words.length > 1 && SMALL_WORDS.contains(last) || last.isEmpty()) {
                title = title.substring(0, title.length() - words[words.length - 1].length())
                        .strip();
                changed = true;
            }
            String trimmed = title.replaceAll("^[\\s,;:.!?·@-]+|[\\s,;:.!?·@-]+$", "");
            if (!trimmed.equals(title)) {
                title = trimmed;
                changed = true;
            }
        }
        return Words.capital(title);
    }

    // ---------- a letter ----------

    private static final Pattern SENTENCE = Pattern.compile("[^.!?\\n]+(?:[.!?](?!\\s|$)[^.!?\\n]*)*[.!?]?");

    /** A long text: every day found in it, with its sentence, and every amount of money. */
    private static Reading letter(String text, Context context) {
        List<FoundDate> dates = new ArrayList<>();
        List<FoundAmount> amounts = new ArrayList<>();
        Matcher sentence = SENTENCE.matcher(text);
        while (sentence.find()) {
            String words = sentence.group();
            if (words.isBlank()) {
                continue;
            }
            int lead = words.length() - words.stripLeading().length();
            Clause c = new Clause(
                    text,
                    sentence.start() + lead,
                    sentence.start() + words.stripTrailing().length());
            Draft d = new Draft();
            clockTimes(c, d);
            days(c, d, context);
            looseTimes(c, d, context);
            if (d.day != null && c.pieces.stream().anyMatch(p -> p.what() == PieceKind.DAY)) {
                Piece day = c.pieces.stream()
                        .filter(p -> p.what() == PieceKind.DAY)
                        .findFirst()
                        .orElseThrow();
                dates.add(new FoundDate(
                        d.day,
                        d.time,
                        d.deadline,
                        shorten(title(c.rest()), 80),
                        shorten(c.text.strip(), 160),
                        day.start(),
                        day.end()));
            }
            Matcher amount = AMOUNT.matcher(c.text);
            while (amount.find()) {
                String number = amount.group("a1") != null ? amount.group("a1") : amount.group("a2");
                String sign = (amount.group("c1") != null ? amount.group("c1") : amount.group("c2"))
                        .strip()
                        .toLowerCase(Locale.ROOT);
                String[] parts = number.replace(',', '.').split("\\.");
                long cents = Long.parseLong(parts[0]) * 100 + (parts.length > 1 ? Long.parseLong(parts[1]) : 0);
                amounts.add(new FoundAmount(
                        cents,
                        sign.equals("$") ? "USD" : sign.equals("£") ? "GBP" : "EUR",
                        shorten(c.text.strip(), 160),
                        c.start + amount.start(),
                        c.start + amount.end()));
            }
        }
        return new Reading(true, List.of(), List.copyOf(dates), List.copyOf(amounts));
    }

    private static String shorten(String words, int most) {
        String one = words.replaceAll("\\s+", " ");
        return one.length() <= most
                ? one
                : one.substring(0, one.lastIndexOf(' ', most - 1) > 0 ? one.lastIndexOf(' ', most - 1) : most - 1)
                        + "…";
    }
}

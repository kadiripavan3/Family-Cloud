package app.homeport.api.board;

import static app.homeport.api.board.TemplateGroup.FAIR_AND_FUN;
import static app.homeport.api.board.TemplateGroup.KEEPSAKES;
import static app.homeport.api.board.TemplateGroup.TEMPLATES;
import static app.homeport.api.circle.CircleKind.COUPLE;
import static app.homeport.api.circle.CircleKind.CREW;
import static app.homeport.api.circle.CircleKind.FAMILY;
import static app.homeport.api.circle.CircleKind.FLAT;

import app.homeport.api.circle.CircleKind;
import app.homeport.api.common.ApiProblem;
import app.homeport.api.common.Codes;
import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;
import java.util.List;

/**
 * Every template of the gallery, in the order the gallery shows them. Each constant is the card a person
 * sees: its name, its picture, a line of description, its shelf, what it is about, and the kinds of circle it
 * is offered to first (every template can still be found under "All").
 *
 * <p>A template marked {@code live} does work: starting it makes a board (a thing of kind BOARD) whose rules
 * are a class that implements {@link BoardRules} for this constant. Until that class exists the card says
 * "coming with the next update". A template that is not live is a plain starter: starting it makes pages and
 * checklists with ready-made content (see {@code gallery/Starters}).
 *
 * <p>Adding a template that does work is one constant here and one class with its rules. Nothing else in
 * the engine changes.
 *
 * <p>The numbers the screens show follow from this list and are held by a test: templates and keepsakes are
 * 53 together, 16 of them offered to a couple, 15 to a flat, 17 to friends. Fair and fun is counted on its own.
 */
public enum Template {
    // ---------- a family's ----------
    MEAL_PLAN(
            "Weekly meal plan",
            "🍽️",
            "Plan dinners, get the shopping list",
            TEMPLATES,
            TemplateTopic.FOOD,
            true,
            FAMILY,
            FLAT),
    CHORE_WHEEL("Chore wheel", "🧹", "Jobs change hands every week", TEMPLATES, TemplateTopic.HOME, true, FAMILY),
    PACKING_LIST(
            "Packing list",
            "🧳",
            "Per person, per trip, reusable",
            TEMPLATES,
            TemplateTopic.TRIPS,
            false,
            FAMILY,
            CREW),
    HOUSE_MANUAL(
            "House manual",
            "🏠",
            "Wi‑Fi, bins, boiler, who to call",
            TEMPLATES,
            TemplateTopic.HOME,
            false,
            FAMILY,
            FLAT),
    BABYSITTER_NOTES(
            "Babysitter notes", "👶", "Routines, bedtimes, numbers", TEMPLATES, TemplateTopic.KIDS, false, FAMILY),
    BIRTHDAY_PLANNER(
            "Birthday planner",
            "🎂",
            "Guests, gifts and a hidden plan",
            TEMPLATES,
            TemplateTopic.KIDS,
            false,
            FAMILY,
            CREW),
    TIME_CAPSULE(
            "Time capsule",
            "⏳",
            "Letters that open on a date",
            KEEPSAKES,
            TemplateTopic.MEMORIES,
            true,
            FAMILY,
            COUPLE,
            CREW),
    SCHOOL_YEAR(
            "School year", "🎒", "Timetable, teachers, forms to sign", TEMPLATES, TemplateTopic.KIDS, false, FAMILY),
    RECIPE_BOOK(
            "Recipe book",
            "🍳",
            "The dishes you make again and again",
            TEMPLATES,
            TemplateTopic.FOOD,
            false,
            FAMILY,
            COUPLE,
            CREW),
    PET_CARE(
            "Pet care",
            "🐶",
            "Food, walks, the vet, who looks after them",
            TEMPLATES,
            TemplateTopic.HOME,
            false,
            FAMILY),
    HOME_INVENTORY(
            "Home inventory",
            "📦",
            "What you own, room by room",
            TEMPLATES,
            TemplateTopic.HOME,
            false,
            FAMILY,
            COUPLE,
            FLAT),
    EMERGENCY_PLAN(
            "Emergency plan",
            "🔔",
            "Who to call, where to meet, what to grab",
            TEMPLATES,
            TemplateTopic.HOME,
            false,
            FAMILY,
            FLAT),
    MOVING_HOUSE("Moving house", "🚚", "Eight weeks of jobs, in order", TEMPLATES, TemplateTopic.HOME, false, FAMILY),
    OPEN_WHEN(
            "Open when…",
            "💌",
            "Letters that open at a moment",
            KEEPSAKES,
            TemplateTopic.MEMORIES,
            true,
            FAMILY,
            COUPLE),
    BIRTHDAY_INTERVIEW(
            "The birthday interview",
            "🎂",
            "The same questions every year",
            KEEPSAKES,
            TemplateTopic.KIDS,
            true,
            FAMILY),
    SAID("Things they said", "💬", "With the age, worked out for you", KEEPSAKES, TemplateTopic.KIDS, true, FAMILY),
    SAME_SPOT(
            "Same spot, every year",
            "📷",
            "One photo a year, lined up",
            KEEPSAKES,
            TemplateTopic.MEMORIES,
            true,
            FAMILY,
            CREW),
    STORIES("Grandma's stories", "📓", "One spoken answer a week", KEEPSAKES, TemplateTopic.MEMORIES, true, FAMILY),
    GOOD_JAR(
            "The good things jar",
            "✨",
            "Opens on New Year's Eve",
            KEEPSAKES,
            TemplateTopic.MEMORIES,
            true,
            FAMILY,
            COUPLE,
            CREW),
    DOORFRAME(
            "The doorframe",
            "🚪",
            "Height marks that move house with you",
            KEEPSAKES,
            TemplateTopic.KIDS,
            true,
            FAMILY),
    WHOSE_TURN("Whose turn?", "🎬", "Remembers who chose last", FAIR_AND_FUN, TemplateTopic.TOGETHER, true, FAMILY),
    PIGGY_BANK("The piggy bank", "🐷", "Pocket money in three jars", FAIR_AND_FUN, TemplateTopic.MONEY, true, FAMILY),
    SECRET_MISSIONS(
            "Secret missions", "🎯", "One small kindness a week", FAIR_AND_FUN, TemplateTopic.TOGETHER, true, FAMILY),
    SATURDAY_JAR(
            "The Saturday jar",
            "🧺",
            "Shake it for something to do",
            FAIR_AND_FUN,
            TemplateTopic.TOGETHER,
            true,
            FAMILY),
    SLEEPS("Sleeps until…", "🌙", "A paper-chain countdown", FAIR_AND_FUN, TemplateTopic.KIDS, true, FAMILY),
    WHERE_IS_IT("Where is it?", "📍", "Where things were put", FAIR_AND_FUN, TemplateTopic.HOME, true, FAMILY),
    HABIT_CHARTS("Habit charts", "✅", "A tick a day, a star a tick", FAIR_AND_FUN, TemplateTopic.KIDS, true, FAMILY),

    // ---------- a couple's ----------
    DATE_IDEAS("Date ideas", "🥂", "Shake for one that fits tonight", TEMPLATES, TemplateTopic.TOGETHER, true, COUPLE),
    WHO_PAYS_WHAT(
            "Who pays what", "💸", "Rent, food, fun: split your way", TEMPLATES, TemplateTopic.MONEY, true, COUPLE),
    MOVING_IN(
            "Moving in together",
            "📦",
            "What's whose, what to buy, who to tell",
            TEMPLATES,
            TemplateTopic.HOME,
            false,
            COUPLE),
    WEDDING(
            "The wedding",
            "💍",
            "Guests, budget and the seating plan",
            TEMPLATES,
            TemplateTopic.TOGETHER,
            false,
            COUPLE),
    THEY_MENTIONED_IT(
            "They mentioned it",
            "🎁",
            "Gift ideas, hidden from them",
            TEMPLATES,
            TemplateTopic.TOGETHER,
            false,
            COUPLE),
    NAMES("Names", "👶", "You only see the ones you both like", TEMPLATES, TemplateTopic.TOGETHER, true, COUPLE),
    WEEKEND_AWAY("A weekend away", "🧳", "Two days, one bag each", TEMPLATES, TemplateTopic.TRIPS, false, COUPLE),
    SOMEDAY("Someday", "🌍", "Places and things, ticked off together", TEMPLATES, TemplateTopic.TRIPS, false, COUPLE),
    OUR_STORY("Our story", "❤️", "The firsts, in order", KEEPSAKES, TemplateTopic.MEMORIES, true, COUPLE),
    TUCKED_NOTES("Tucked notes", "📝", "A note that hides and waits", KEEPSAKES, TemplateTopic.MEMORIES, true, COUPLE),
    ANNIVERSARY(
            "The anniversary questions",
            "📅",
            "Five questions, answered apart",
            KEEPSAKES,
            TemplateTopic.MEMORIES,
            true,
            COUPLE),
    MYSTERY_DATE(
            "Mystery date",
            "🔮",
            "A time and a hint, nothing more",
            FAIR_AND_FUN,
            TemplateTopic.TOGETHER,
            true,
            COUPLE),
    BOTH_YES("Both said yes", "🗳️", "Only what you both chose", FAIR_AND_FUN, TemplateTopic.TOGETHER, true, COUPLE),
    FAIR_SHARE("The fair share", "🧮", "Who does what, without blame", FAIR_AND_FUN, TemplateTopic.HOME, true, COUPLE),

    // ---------- a flat's ----------
    CLEANING_ROTA("Cleaning rota", "🧹", "Swaps, cover, and a fair count", TEMPLATES, TemplateTopic.HOME, true, FLAT),
    BILLS_BY_NIGHTS("Bills by nights", "💡", "Away for a month? Pay less", TEMPLATES, TemplateTopic.MONEY, true, FLAT),
    MOVE_IN_PHOTOS(
            "Move-in photos",
            "📦",
            "Dated, signed by all. Saves a deposit",
            TEMPLATES,
            TemplateTopic.LANDLORD,
            true,
            FLAT),
    REPAIR_LOG("Repair log", "🛠️", "What was reported, and when", TEMPLATES, TemplateTopic.LANDLORD, false, FLAT),
    HOUSE_RULES("House rules", "📝", "Agreed by everyone, changed by vote", TEMPLATES, TemplateTopic.HOME, false, FLAT),
    SOFA_FREE("Is the sofa free?", "🛋️", "Who has guests, and when", TEMPLATES, TemplateTopic.HOME, false, FLAT),
    HOUSE_PARTY(
            "House party", "🎉", "Budget, playlist, neighbours told", TEMPLATES, TemplateTopic.TOGETHER, false, FLAT),
    MOVING_OUT("Moving out", "🚚", "Keys, deposit and the last bills", TEMPLATES, TemplateTopic.LANDLORD, false, FLAT),
    HEARD(
            "Heard in the kitchen",
            "💬",
            "The lines that outlive the tenancy",
            KEEPSAKES,
            TemplateTopic.MEMORIES,
            true,
            FLAT),
    GUEST_BOOK(
            "The guest book",
            "🔑",
            "A line and a photo from every guest",
            KEEPSAKES,
            TemplateTopic.MEMORIES,
            true,
            FLAT),
    LIVED_HERE(
            "Everyone who's lived here", "🏡", "The roll of the flat", KEEPSAKES, TemplateTopic.MEMORIES, true, FLAT),
    KITTY("The kitty", "💰", "A shared pot for the small things", FAIR_AND_FUN, TemplateTopic.MONEY, true, FLAT),
    FAIRER_SPLIT(
            "A fairer split", "📊", "Rent by room, bills by nights", FAIR_AND_FUN, TemplateTopic.MONEY, true, FLAT),
    HEADS_UP("Heads-up", "👋", "One line to tell the flat", FAIR_AND_FUN, TemplateTopic.HOME, true, FLAT),

    // ---------- friends' ----------
    FIND_DATE(
            "When can everyone?",
            "📅",
            "Tap your free days, see the overlap",
            TEMPLATES,
            TemplateTopic.TOGETHER,
            true,
            CREW),
    SECRET_SANTA(
            "Secret Santa",
            "🎁",
            "Draws the names. Nobody sees the list",
            TEMPLATES,
            TemplateTopic.TOGETHER,
            true,
            CREW),
    WHERE_NEXT(
            "Where next?", "🌍", "Vote, and the winner becomes the trip", TEMPLATES, TemplateTopic.TRIPS, true, CREW),
    WHO_BRINGS_WHAT("Who brings what", "🍲", "No third bowl of hummus", TEMPLATES, TemplateTopic.TOGETHER, false, CREW),
    SPLIT_COSTS(
            "Split the costs", "💸", "The fewest payments to settle up", TEMPLATES, TemplateTopic.MONEY, false, CREW),
    PRESENT_FROM_ALL(
            "A present from all of us",
            "🎂",
            "Collected quietly, hidden from one",
            TEMPLATES,
            TemplateTopic.MONEY,
            false,
            CREW),
    GAMES_NIGHT("Games night", "🏆", "Scores that outlast the evening", TEMPLATES, TemplateTopic.TOGETHER, false, CREW),
    BOOK_CLUB("Book club", "📚", "Whose pick, and what's next", TEMPLATES, TemplateTopic.TOGETHER, false, CREW),
    DICTIONARY("The dictionary", "📄", "The words only you understand", KEEPSAKES, TemplateTopic.MEMORIES, true, CREW),
    PREDICTIONS("Predictions", "🔮", "Sealed until the reunion", KEEPSAKES, TemplateTopic.MEMORIES, true, CREW),
    AWARDS("The awards", "⭐", "Voted every New Year's Eve", KEEPSAKES, TemplateTopic.MEMORIES, true, CREW),
    WALK_TOGETHER(
            "A goal you walk together",
            "🏃",
            "Every kilometre counts for the crew",
            FAIR_AND_FUN,
            TemplateTopic.TRIPS,
            true,
            CREW);

    private final String title;
    private final String emoji;
    private final String line;
    private final TemplateGroup group;
    private final TemplateTopic topic;
    private final boolean live;
    private final List<CircleKind> offeredTo;

    Template(
            String title,
            String emoji,
            String line,
            TemplateGroup group,
            TemplateTopic topic,
            boolean live,
            CircleKind... offeredTo) {
        this.title = title;
        this.emoji = emoji;
        this.line = line;
        this.group = group;
        this.topic = topic;
        this.live = live;
        this.offeredTo = List.of(offeredTo);
    }

    /** Its name on the card, and the title a new one starts with. */
    public String title() {
        return title;
    }

    public String emoji() {
        return emoji;
    }

    /** The line under its name. */
    public String line() {
        return line;
    }

    public TemplateGroup group() {
        return group;
    }

    public TemplateTopic topic() {
        return topic;
    }

    /** True for a template that does work (a board); false for a plain starter of pages and checklists. */
    public boolean live() {
        return live;
    }

    /** The kinds of circle it is offered to first. The one it was made for comes first. */
    public List<CircleKind> offeredTo() {
        return offeredTo;
    }

    /**
     * Where it stands for this kind of circle: 0 when it was made for it, 1 or 2 when it is offered to it as
     * well, -1 when it is only found under "All". Someone on their own is offered what a family is.
     */
    public int rankFor(CircleKind kind) {
        return offeredTo.indexOf(kind == CircleKind.SOLO ? FAMILY : kind);
    }

    @JsonValue
    public String code() {
        return Codes.of(this);
    }

    @JsonCreator
    public static Template of(String code) {
        return Codes.parse(
                Template.class,
                code,
                () -> ApiProblem.badRequest("invalid_template", "That isn't a template we have."));
    }

    /** From a database column. */
    public static Template read(String code) {
        return Codes.read(Template.class, code);
    }
}

package app.homeport.api.board;

import app.homeport.api.common.ApiProblem;
import app.homeport.api.home.TodaySource.FreshCard;
import app.homeport.api.home.TodaySource.TodayCard;
import app.homeport.api.home.TodaySource.TodayItem;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/**
 * The rules of one template that does work. A template is a Spring component that implements this for its
 * constant in {@link Template}; the engine finds it, and the generic routes (make a board, read it, add and
 * change an entry, a verb) call it. Nothing else has to know the template exists.
 *
 * <p><b>Each template decides what each person sees.</b> Everyone who may see the board (the shared sharing
 * rule) sees the board; what they see inside it is decided here, in {@link #view}, {@link #entry} and
 * {@link #findable}, and nowhere else. A sealed letter's words, a surprise for someone, an answer that waits
 * for the other answer: the template reduces them to what this viewer may know ("from Alex, opens 4 Dec 2034")
 * before anything leaves the API. The app is never sent something to hide. Keep that decision in one private
 * method of the template and let the three methods use it.
 *
 * <p>The {@link Scene} a method is handed is the board for one viewer on one day: its settings, its entries,
 * the people of its circle, who is looking, and the few ways to write.
 */
public interface BoardRules {

    /** The template these are the rules of. */
    Template template();

    // ---------- what the API's description says ----------

    /** The record a board's settings are stored as, for the API's description. */
    Class<?> settingsType();

    /** The record {@link #view} returns, for the API's description. */
    Class<?> viewType();

    /** The record {@link #entry} returns, when the template has a list that is read a page at a time. */
    default Class<?> entryType() {
        return null;
    }

    /**
     * What the app may send, one line each, for the API's description: the settings' names, each kind of
     * entry with its fields, each verb with its body, and what {@code show} means.
     */
    List<String> guide();

    // ---------- settings ----------

    /**
     * Checks the settings sent for a new board or for a change and returns the settings to keep (a record of
     * {@link #settingsType()}). For a new board the scene's settings are empty; for a change, a name that was
     * not sent keeps its value.
     */
    Object settings(Scene scene, Fields sent);

    /** Called once when a board was made, with its settings stored: a place to put its first entries in. */
    default void started(Scene scene) {}

    // ---------- what one person sees ----------

    /**
     * The board as this viewer gets it (a record of {@link #viewType()}).
     *
     * @param show which part, for templates with more than one: a week, a year. Null for the usual one.
     */
    Object view(Scene scene, String show);

    /**
     * One entry as this viewer gets it in a list read a page at a time (a record of {@link #entryType()}), or
     * null when it isn't there for them or isn't something that is listed.
     */
    default Object entry(Scene scene, EntryRow entry) {
        return null;
    }

    /** True when an entry passes one of the template's own filters ("voice": only those with a recording). */
    default boolean passes(Scene scene, EntryRow entry, String filter) {
        return true;
    }

    /** The words of an entry this viewer may find it by, or null when there are none they may read. */
    default String findable(Scene scene, EntryRow entry) {
        return null;
    }

    // ---------- changing it ----------

    /**
     * Adds an entry of this kind from what the app sent and returns its id. The viewer may change the board
     * (or the kind is one {@link #viewersMayWrite} lets everyone write).
     */
    UUID add(Scene scene, String kind, Fields sent, UUID clientId);

    /** Changes an entry. The viewer may change the board; whether they may change this entry is for the template to say. */
    void change(Scene scene, EntryRow entry, Fields sent);

    /** Removes an entry. The viewer may change the board; whether they may remove this entry is for the template to say. */
    default void remove(Scene scene, EntryRow entry) {
        scene.remove(entry.id());
    }

    /** One of the template's own verbs: seal, open, tick. */
    default void act(Scene scene, String verb, Fields sent) {
        throw unknownVerb();
    }

    /**
     * True for a kind of entry that someone who may only look at the board may still add, and change or remove
     * as far as the template lets them: their own vote, their own free days. Everything else needs the right
     * to change the board.
     */
    default boolean viewersMayWrite(String kind) {
        return false;
    }

    /** True for a verb that someone who may only look at the board may still use (the reader opening their letter). */
    default boolean viewersMay(String verb) {
        return false;
    }

    /**
     * Kinds of entry the template counts and reads by day instead of reading them all (a chore wheel's ticks
     * of every week there ever was). They are left out of {@link Scene#entries()}.
     */
    default Set<String> counted() {
        return Set.of();
    }

    /** How many entries one board holds at most. */
    default int ceiling() {
        return 2000;
    }

    // ---------- what it brings to the rest of the app ----------

    /** Where it stands, in a few words, for this viewer: "3 letters · opens 4 Dec 2034". */
    String glance(Scene scene);

    /** What it has for this viewer today: a capsule that opens, whose turn it is tonight. */
    default List<TodayItem> today(Scene scene) {
        return List.of();
    }

    /**
     * The cards it puts at the top of this viewer's Today, one or two at most: what the kitty holds, a day that
     * works for four, a share that is still to pay. Like everything else, only what this viewer may know.
     */
    default List<TodayCard> cards(Scene scene) {
        return List.of();
    }

    /** What happened on it lately that this viewer should hear of: a letter was opened, a story was told. */
    default List<FreshCard> fresh(Scene scene) {
        return List.of();
    }

    /**
     * What a guest with a pass reads under the board's title, or null when the title is all a guest gets. The
     * scene has no viewer: show only what anyone the pass was given to may read.
     */
    default String guest(Scene scene) {
        return null;
    }

    // ---------- the sentences templates share ----------

    static ApiProblem unknownVerb() {
        return ApiProblem.badRequest("unknown_verb", "That can't be done with this template.");
    }

    static ApiProblem unknownKind() {
        return ApiProblem.badRequest("unknown_kind", "That can't be added to this template.");
    }

    static ApiProblem notYours() {
        return new ApiProblem(
                org.springframework.http.HttpStatus.FORBIDDEN,
                "not_yours",
                "Only the person who wrote this can do that.");
    }
}

package app.homeport.api.board;

import app.homeport.api.board.BoardStore.BoardRow;
import app.homeport.api.guest.GuestView;
import app.homeport.api.home.SearchSource;
import app.homeport.api.home.TodaySource;
import app.homeport.api.thing.GlanceSource;
import app.homeport.api.thing.Place;
import app.homeport.api.thing.ThingKind;
import app.homeport.api.thing.ThingStore;
import app.homeport.api.thing.ThingStore.ThingRow;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;

/**
 * What boards bring to the rest of the app, for every template at once: a few words on where each stands,
 * what each has for today, a search inside what the viewer may read, and how a guest is shown one. Each
 * answer comes from the template's own rules, so what a person may not read on the board they can't find
 * here either.
 */
@Component
class BoardSources implements GlanceSource, TodaySource, SearchSource, GuestView {

    private final BoardStore store;
    private final ThingStore things;
    // Asked for when it is first used: the templates' rules use services that are themselves built from
    // every GlanceSource, this one included.
    private final ObjectProvider<Boards> boards;

    BoardSources(BoardStore store, ThingStore things, ObjectProvider<Boards> boards) {
        this.store = store;
        this.things = things;
        this.boards = boards;
    }

    @Override
    public ThingKind kind() {
        return ThingKind.BOARD;
    }

    @Override
    public Place place() {
        return Place.NOTES;
    }

    /** One scene per board the viewer may see whose template has its rules. */
    private List<Scene> scenes(List<ThingRow> rows, UUID me, LocalDate day) {
        return boards.getObject().scenes(rows, me, day);
    }

    private BoardRules rules(Scene scene) {
        return boards.getObject().rules(scene.template());
    }

    @Override
    public Map<UUID, String> glances(List<UUID> thingIds, UUID me) {
        Map<UUID, String> glances = new HashMap<>();
        for (Scene scene : scenes(things.findAll(thingIds, me), me, null)) {
            String glance = rules(scene).glance(scene);
            if (glance != null) {
                glances.put(scene.boardId(), glance);
            }
        }
        return glances;
    }

    @Override
    public List<TodayItem> today(UUID me, UUID circleId, LocalDate day) {
        List<TodayItem> items = new ArrayList<>();
        for (Scene scene : scenes(store.seenIn(circleId, me), me, day)) {
            items.addAll(rules(scene).today(scene));
        }
        return items;
    }

    @Override
    public List<FreshCard> fresh(UUID me, UUID circleId) {
        List<FreshCard> cards = new ArrayList<>();
        for (Scene scene : scenes(store.seenIn(circleId, me), me, null)) {
            cards.addAll(rules(scene).fresh(scene));
        }
        return cards.stream().limit(6).toList();
    }

    /**
     * Words inside boards. The search asks every place the same question and has no viewer in it, so the
     * viewer is taken from the request: what is found inside a board has to be what this person may read
     * there, and a sealed letter is found by nobody.
     */
    @Override
    public List<Found> find(UUID circleId, String words, int limit) {
        UUID me = viewer();
        if (me == null) {
            return List.of();
        }
        String typed = words.toLowerCase(Locale.ROOT);
        List<EntryRow> candidates = store.mayHold(circleId, me, words, 200);
        Map<UUID, Scene> byBoard = new LinkedHashMap<>();
        for (Scene scene : scenes(
                things.findAll(
                        candidates.stream().map(EntryRow::boardId).distinct().toList(), me),
                me,
                null)) {
            byBoard.put(scene.boardId(), scene);
        }
        Map<UUID, Found> found = new LinkedHashMap<>();
        for (EntryRow entry : candidates) {
            Scene scene = byBoard.get(entry.boardId());
            if (scene == null || found.containsKey(entry.boardId())) {
                continue;
            }
            String readable = rules(scene).findable(scene, entry);
            int at = readable == null ? -1 : readable.toLowerCase(Locale.ROOT).indexOf(typed);
            if (at >= 0) {
                found.put(entry.boardId(), new Found(entry.boardId(), around(readable, at, typed.length())));
            }
            if (found.size() >= limit) {
                break;
            }
        }
        return List.copyOf(found.values());
    }

    /** The words around a match, on one line. */
    static String around(String text, int at, int length) {
        int from = Math.max(0, at - 30);
        int to = Math.min(text.length(), at + length + 60);
        return (from > 0 ? "…" : "")
                + text.substring(from, to).replaceAll("\\s+", " ").trim()
                + (to < text.length() ? "…" : "");
    }

    private static UUID viewer() {
        Authentication who = SecurityContextHolder.getContext().getAuthentication();
        return who instanceof JwtAuthenticationToken token
                ? UUID.fromString(token.getToken().getSubject())
                : null;
    }

    /** A guest sees a board's title, and under it only what its template says anyone with the pass may read. */
    @Override
    public Card show(UUID thingId) {
        ThingRow thing = store.thingForNobody(thingId).orElse(null);
        BoardRow board = store.find(thingId).orElse(null);
        Boards all = boards.getObject();
        if (thing == null || board == null || !all.has(board.template())) {
            return new Card("Template", null);
        }
        Scene scene = all.scene(thing, board, null, null);
        return new Card(board.template().title(), all.rules(board.template()).guest(scene));
    }
}

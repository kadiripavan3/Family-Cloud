package app.homeport.api.board;

import app.homeport.api.board.BoardStore.BoardRow;
import app.homeport.api.circle.CircleKind;
import app.homeport.api.common.ApiProblem;
import app.homeport.api.media.MediaService;
import app.homeport.api.media.MediaStore;
import app.homeport.api.thing.ThingStore;
import app.homeport.api.thing.ThingStore.ThingRow;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * The templates that have their rules, and the {@link Scene} each of their methods is handed. A class that
 * implements {@link BoardRules} is found here by itself; a template in the gallery without one is "coming
 * with the next update".
 */
@Component
public class Boards {

    private final Map<Template, BoardRules> rules = new EnumMap<>(Template.class);
    private final BoardStore store;
    private final ThingStore things;
    private final MediaStore mediaStore;
    private final MediaService mediaService;

    Boards(
            List<BoardRules> rules,
            BoardStore store,
            ThingStore things,
            MediaStore mediaStore,
            MediaService mediaService) {
        for (BoardRules one : rules) {
            if (!one.template().live() || this.rules.put(one.template(), one) != null) {
                throw new IllegalStateException(
                        one.template() + " has to be a template marked live, with one class of rules.");
            }
        }
        this.store = store;
        this.things = things;
        this.mediaStore = mediaStore;
        this.mediaService = mediaService;
    }

    /** True when the template's rules are built, so a board of it can be started. */
    public boolean has(Template template) {
        return rules.containsKey(template);
    }

    /** The templates that have their rules, in the gallery's order. */
    public List<BoardRules> all() {
        return List.copyOf(rules.values());
    }

    /** The rules of a template, or a clear sentence when it has none yet. */
    public BoardRules rules(Template template) {
        BoardRules found = rules.get(template);
        if (found == null) {
            throw coming(template);
        }
        return found;
    }

    public static ApiProblem coming(Template template) {
        return ApiProblem.conflict(
                "coming_soon", "“" + template.title() + "” is coming with the next update. It can't be started yet.");
    }

    /** The board for this viewer on this day. A null viewer is a guest or someone outside the circle. */
    public Scene scene(ThingRow thing, BoardRow board, UUID viewer, LocalDate day) {
        return scene(thing, board, viewer, day, false);
    }

    /** The same for a board that is being made: its settings are not stored yet. */
    Scene sceneForNew(ThingRow thing, Template template, UUID viewer, LocalDate day) {
        return scene(thing, new BoardRow(thing.id(), template, Json.empty()), viewer, day, true);
    }

    private Scene scene(ThingRow thing, BoardRow board, UUID viewer, LocalDate day, boolean isNew) {
        return new Scene(
                thing,
                board,
                rules(board.template()),
                store.circleKind(thing.circleId()),
                store.people(thing.circleId()),
                viewer,
                Today.of(day),
                isNew,
                store,
                things,
                mediaStore,
                mediaService);
    }

    /**
     * One scene for each of these boards whose template has its rules, for one viewer: what Today, search and
     * a list of boards walk through. The circle's people are read once, not once per board.
     */
    public List<Scene> scenes(List<ThingRow> boards, UUID viewer, LocalDate day) {
        Map<UUID, BoardRow> stored =
                store.findAll(boards.stream().map(ThingRow::id).toList());
        Map<UUID, CircleKind> kinds = new HashMap<>();
        Map<UUID, List<Person>> people = new HashMap<>();
        List<Scene> scenes = new ArrayList<>();
        for (ThingRow thing : boards) {
            BoardRow board = stored.get(thing.id());
            if (board == null || !has(board.template())) {
                continue;
            }
            scenes.add(new Scene(
                    thing,
                    board,
                    rules(board.template()),
                    kinds.computeIfAbsent(thing.circleId(), store::circleKind),
                    people.computeIfAbsent(thing.circleId(), store::people),
                    viewer,
                    Today.of(day),
                    false,
                    store,
                    things,
                    mediaStore,
                    mediaService));
        }
        return scenes;
    }
}

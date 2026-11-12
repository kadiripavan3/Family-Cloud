package app.homeport.api.board;

import app.homeport.api.activity.ActivityKind;
import app.homeport.api.activity.ActivityLog;
import app.homeport.api.activity.ActivityLog.Happened;
import app.homeport.api.board.BoardStore.BoardRow;
import app.homeport.api.common.ApiProblem;
import app.homeport.api.common.Keyset;
import app.homeport.api.common.Page;
import app.homeport.api.notify.Outbox;
import app.homeport.api.notify.Push;
import app.homeport.api.notify.PushKind;
import app.homeport.api.thing.Audience;
import app.homeport.api.thing.ThingKind;
import app.homeport.api.thing.ThingService;
import app.homeport.api.thing.ThingService.AudienceChip;
import app.homeport.api.thing.ThingStore;
import app.homeport.api.thing.ThingStore.ThingRow;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Boards: templates that do work. This is the part every template shares: a board is a thing (so it is
 * shared, hidden and deleted like a page), its entries are changed one at a time, and everything that is
 * particular to a template is asked of its {@link BoardRules}.
 */
@Service
public class BoardService {

    /** A board as one person sees it on one day. */
    public record BoardResponse(
            UUID id,
            UUID circleId,
            Template template,
            String title,
            String emoji,
            Instant updatedAt,
            boolean mine,
            boolean canEdit,
            AudienceChip chip,

            @Schema(description = "The day the view was made for: the phone's day, as far as it can be true")
            LocalDate day,

            @Schema(description = "The board's settings. Their shape depends on the template.")
            Object settings,

            @Schema(description = "What this person sees on the board. Its shape depends on the template.")
            Object view) {}

    /** A board in a list of them. */
    public record BoardCard(
            UUID id,
            UUID circleId,
            Template template,
            String title,
            String emoji,

            @Schema(nullable = true, description = "Where it stands, in a few words: 3 letters · opens 4 Dec 2034")
            String glance,

            Instant updatedAt,
            boolean mine,
            boolean canEdit,
            AudienceChip chip) {}

    /** What adding an entry answers: the entry's id, and the board as it is now. */
    public record EntryAddedResponse(UUID entryId, BoardResponse board) {}

    /** One page of a board's entries, each as the viewer may see it. */
    public record BoardEntriesResponse(
            @Schema(description = "Entries as the template shapes them for this person")
            List<Object> items,

            @Schema(
                    nullable = true,
                    description = "Send this back as `cursor` to get the next page. Null on the last page.")
            String nextCursor) {}

    private final ThingService things;
    private final ThingStore thingStore;
    private final BoardStore store;
    private final Boards boards;
    private final ActivityLog activity;
    private final Outbox outbox;

    BoardService(
            ThingService things,
            ThingStore thingStore,
            BoardStore store,
            Boards boards,
            ActivityLog activity,
            Outbox outbox) {
        this.things = things;
        this.thingStore = thingStore;
        this.store = store;
        this.boards = boards;
        this.activity = activity;
        this.outbox = outbox;
    }

    // ---------- a board ----------

    /**
     * Makes a board from a template. With no title it is called what the template is called; with no audience
     * it starts as the circle's kind says. Sending the same clientId again makes nothing new.
     */
    @Transactional
    public BoardResponse create(
            UUID me,
            UUID circleId,
            Template template,
            String title,
            Audience audience,
            Map<String, Object> settings,
            UUID clientId,
            LocalDate day) {
        if (!template.live()) {
            throw ApiProblem.badRequest(
                    "not_a_board",
                    "“" + template.title() + "” starts as pages and lists. Start it from the templates.");
        }
        BoardRules rules = boards.rules(template);
        String name = title == null || title.isBlank() ? template.title() : title.trim();
        UUID id = things.create(me, circleId, ThingKind.BOARD, name, audience, clientId);
        if (store.find(id).isEmpty()) {
            ThingRow thing = things.require(id, me, ThingKind.BOARD);
            Object kept = rules.settings(boards.sceneForNew(thing, template, me, day), Fields.of(settings));
            store.insert(id, template, Json.tree(kept));
            rules.started(scene(thing, me, day));
        }
        return get(id, me, day, null);
    }

    public BoardResponse get(UUID id, UUID me, LocalDate day, String show) {
        ThingRow thing = things.require(id, me, ThingKind.BOARD);
        Scene scene = scene(thing, me, day);
        return new BoardResponse(
                thing.id(),
                thing.circleId(),
                scene.template(),
                thing.title(),
                scene.template().emoji(),
                thing.updatedAt(),
                thing.mine(),
                thing.canEdit(),
                things.chip(thing),
                scene.today(),
                scene.settings(rulesOf(scene).settingsType()),
                rulesOf(scene).view(scene, show == null || show.isBlank() ? null : show.trim()));
    }

    /** Renames a board, changes its settings, or both. */
    @Transactional
    public BoardResponse change(UUID id, UUID me, String title, Map<String, Object> settings, LocalDate day) {
        ThingRow thing = things.requireEdit(id, me, ThingKind.BOARD);
        if (title != null && !title.isBlank()) {
            thingStore.retitle(id, title.trim());
        }
        if (settings != null) {
            Scene scene = scene(thing, me, day);
            scene.saveSettings(rulesOf(scene).settings(scene, Fields.of(settings)));
        }
        return get(id, me, day, null);
    }

    public Page<BoardCard> list(UUID circleId, UUID me, Template template, Keyset page) {
        List<ThingRow> rows = store.list(circleId, me, template, page);
        Map<UUID, AudienceChip> chips = things.chips(rows);
        Map<UUID, BoardRow> stored =
                store.findAll(rows.stream().map(ThingRow::id).toList());
        Map<UUID, String> glances = new HashMap<>();
        for (Scene scene : boards.scenes(rows, me, null)) {
            glances.put(scene.boardId(), boards.rules(scene.template()).glance(scene));
        }
        return page.page(rows, row -> Keyset.cursor(row.updatedAt(), row.id()))
                .map(shown -> shown.stream()
                        .filter(row -> stored.containsKey(row.id()))
                        .map(row -> {
                            Template of = stored.get(row.id()).template();
                            return new BoardCard(
                                    row.id(),
                                    row.circleId(),
                                    of,
                                    row.title(),
                                    of.emoji(),
                                    glances.get(row.id()),
                                    row.updatedAt(),
                                    row.mine(),
                                    row.canEdit(),
                                    chips.get(row.id()));
                        })
                        .toList());
    }

    // ---------- its entries, one at a time ----------

    /** Adds an entry. Sending the same clientId again adds nothing and answers with the entry added the first time. */
    @Transactional
    public EntryAddedResponse add(
            UUID boardId, UUID me, String kind, Map<String, Object> fields, UUID clientId, LocalDate day) {
        ThingRow thing = things.require(boardId, me, ThingKind.BOARD);
        Scene scene = scene(thing, me, day);
        String what = word(kind);
        if (!rulesOf(scene).viewersMayWrite(what)) {
            scene.requireEdit();
        }
        UUID sentBefore = store.sentBefore(boardId, clientId).orElse(null);
        UUID entryId = sentBefore != null ? sentBefore : rulesOf(scene).add(scene, what, Fields.of(fields), clientId);
        if (sentBefore == null) {
            tell(scene, true);
        }
        return new EntryAddedResponse(entryId, get(boardId, me, day, null));
    }

    @Transactional
    public BoardResponse changeEntry(UUID entryId, UUID me, Map<String, Object> fields, LocalDate day) {
        EntryRow entry = store.entry(entryId).orElseThrow(Scene::entryGone);
        Scene scene = sceneToChange(entry, me, day);
        rulesOf(scene).change(scene, entry, Fields.of(fields));
        thingStore.touch(scene.boardId());
        return get(scene.boardId(), me, day, null);
    }

    /** Removes an entry. Removing one that is gone is fine: two people may remove the same one. */
    @Transactional
    public void removeEntry(UUID entryId, UUID me) {
        EntryRow entry = store.entry(entryId).orElse(null);
        if (entry == null) {
            return;
        }
        Scene scene = sceneToChange(entry, me, null);
        rulesOf(scene).remove(scene, entry);
        thingStore.touch(scene.boardId());
    }

    /**
     * The board of an entry, for someone who may change that entry: they may change the board, or the template
     * lets people who only look at the board write this kind. An entry of a board they may not see isn't there
     * for them.
     */
    private Scene sceneToChange(EntryRow entry, UUID me, LocalDate day) {
        ThingRow thing;
        try {
            thing = things.require(entry.boardId(), me, ThingKind.BOARD);
        } catch (ApiProblem problem) {
            throw problem.status() == HttpStatus.NOT_FOUND ? Scene.entryGone() : problem;
        }
        Scene scene = scene(thing, me, day);
        if (!rulesOf(scene).viewersMayWrite(entry.kind())) {
            scene.requireEdit();
        }
        return scene;
    }

    /** One of the template's own verbs. Answers with the board as it is afterwards. */
    @Transactional
    public BoardResponse act(UUID boardId, UUID me, String verb, Map<String, Object> body, LocalDate day) {
        ThingRow thing = things.require(boardId, me, ThingKind.BOARD);
        Scene scene = scene(thing, me, day);
        String what = word(verb);
        if (!rulesOf(scene).viewersMay(what)) {
            scene.requireEdit();
        }
        rulesOf(scene).act(scene, what, Fields.of(body));
        thingStore.touch(boardId);
        tell(scene, false);
        nudge(scene);
        return get(boardId, me, day, null);
    }

    /**
     * Queues the nudges a template asked for ({@link Scene#nudge}), in the transaction of the verb, so one is
     * told exactly when it is remembered. A day's nudge to one person about one board has one key: however
     * often it is asked for, their phone hears it once.
     */
    private void nudge(Scene scene) {
        for (Scene.Nudge nudge : scene.nudges()) {
            Person to = scene.person(nudge.memberId());
            if (to == null || to.userId() == null || to.left()) {
                continue; // a child, a pet, or someone who has left: no phone to tell
            }
            outbox.tell(Push.to(to.userId(), PushKind.NUDGE, nudge.title(), nudge.body(), "/board/" + scene.boardId())
                    .about(scene.circleId(), scene.boardId())
                    .by(scene.myId())
                    .once("nudge:" + scene.boardId() + ":" + nudge.memberId() + ":" + scene.today()));
        }
    }

    /**
     * Passes on to Activity what the template said happened ({@link Scene#tell}). A template that said
     * nothing about a new entry gets the usual line, "added to" and the board's name; a verb is only news
     * when its template says so.
     */
    private void tell(Scene scene, boolean added) {
        for (Scene.Told told : scene.told()) {
            activity.record(Happened.to(scene.circleId(), ActivityKind.BOARD, scene.boardId())
                    .by(told.who())
                    .saying(told.words(), false)
                    .count("times"));
        }
        if (added && scene.told().isEmpty() && !scene.quiet() && scene.myId() != null) {
            activity.record(Happened.to(scene.circleId(), ActivityKind.BOARD, scene.boardId())
                    .by(scene.myId())
                    .count("times"));
        }
    }

    /**
     * The entries of a board a page at a time, newest first, each as this viewer may see it. With a kind, a
     * member, one of the template's filters or words, only those. Words are looked for in what the viewer may
     * read, never in what is sealed for them.
     */
    public BoardEntriesResponse entries(
            UUID boardId, UUID me, String kind, UUID member, String filter, String words, Keyset page, LocalDate day) {
        ThingRow thing = things.require(boardId, me, ThingKind.BOARD);
        Scene scene = scene(thing, me, day);
        BoardRules rules = rulesOf(scene);
        String typed = words == null ? "" : words.trim().toLowerCase(Locale.ROOT);
        Double afterPosition = page.first() ? null : position(page);
        UUID afterId = page.first() ? null : page.uuid(1);
        List<EntryRow> rows = scene.entries().stream()
                .sorted(Comparator.comparingDouble(EntryRow::position)
                        .thenComparing(EntryRow::id)
                        .reversed())
                .filter(e -> afterPosition == null
                        || e.position() < afterPosition
                        || (e.position() == afterPosition && e.id().compareTo(afterId) < 0))
                .filter(e -> kind == null || kind.isBlank() || e.is(word(kind)))
                .filter(e -> member == null || member.equals(e.forId()))
                .filter(e -> filter == null || filter.isBlank() || rules.passes(scene, e, word(filter)))
                .toList();
        List<Object> items = new ArrayList<>();
        EntryRow last = null;
        boolean more = false;
        for (EntryRow row : rows) {
            Object shown = rules.entry(scene, row);
            if (shown == null) {
                continue;
            }
            if (!typed.isEmpty()) {
                String readable = rules.findable(scene, row);
                if (readable == null || !readable.toLowerCase(Locale.ROOT).contains(typed)) {
                    continue;
                }
            }
            if (items.size() == page.limit()) {
                more = true;
                break;
            }
            items.add(shown);
            last = row;
        }
        return new BoardEntriesResponse(items, more ? Keyset.cursor(last.position(), last.id()) : null);
    }

    private static double position(Keyset page) {
        try {
            return Double.parseDouble(page.text(0));
        } catch (NumberFormatException notANumber) {
            throw Keyset.badCursor();
        }
    }

    // ---------- helpers ----------

    private Scene scene(ThingRow thing, UUID me, LocalDate day) {
        BoardRow board = store.find(thing.id()).orElseThrow(ThingService::notFound);
        return boards.scene(thing, board, me, day);
    }

    private BoardRules rulesOf(Scene scene) {
        return boards.rules(scene.template());
    }

    /** A kind, a verb or a filter as the templates spell them: lower case, nothing around it. */
    private static String word(String sent) {
        return sent == null ? "" : sent.trim().toLowerCase(Locale.ROOT);
    }
}

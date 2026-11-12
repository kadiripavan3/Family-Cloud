package app.homeport.api.list;

import app.homeport.api.circle.CircleService;
import app.homeport.api.circle.MemberKind;
import app.homeport.api.circle.MemberStore;
import app.homeport.api.circle.MemberStore.MemberRow;
import app.homeport.api.common.ApiProblem;
import app.homeport.api.common.Keyset;
import app.homeport.api.common.Names;
import app.homeport.api.common.Page;
import app.homeport.api.folder.FolderService;
import app.homeport.api.folder.FolderService.Crumb;
import app.homeport.api.folder.People;
import app.homeport.api.list.ChecklistStore.HideRow;
import app.homeport.api.list.ChecklistStore.ItemRow;
import app.homeport.api.list.ChecklistStore.ListRow;
import app.homeport.api.list.ChecklistStore.Tally;
import app.homeport.api.thing.Audience;
import app.homeport.api.thing.ThingKind;
import app.homeport.api.thing.ThingService;
import app.homeport.api.thing.ThingService.AudienceChip;
import app.homeport.api.thing.ThingService.PersonBrief;
import app.homeport.api.thing.ThingStore;
import app.homeport.api.thing.ThingStore.ThingRow;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Function;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Checklists. Every change is to one line (add it, tick it, change it, move it, remove it), never to the whole
 * list, so two people using a list at the same moment both keep what they did; and adding a line carries a
 * clientId, so a phone that sends it again after a bad connection doesn't add it twice. A phone that had no
 * signal sends what it kept in one go ({@link #changes}): each change gets its own answer, and one that came
 * too late (the line is gone) doesn't stop the others.
 */
@Service
public class ChecklistService {

    static final int MAX_ITEMS = 500;
    static final int MAX_SUGGESTIONS = 8;
    static final int MAX_CHANGES = 200;

    public record ItemResponse(
            UUID id,
            String text,

            @Schema(description = "A small line under it: Alex bought them")
            String note,

            @Schema(description = "The heading it stands under, or empty: Dairy, Gift ideas")
            String section,

            @Schema(nullable = true, description = "A price or a budget, in cents")
            Long amountCents,

            boolean done,
            @Schema(nullable = true) Instant doneAt,

            @Schema(nullable = true, description = "Who ticked it")
            PersonBrief doneBy,

            @Schema(nullable = true, description = "Whose job it is")
            PersonBrief assignedTo,

            @Schema(nullable = true, description = "Who added it")
            PersonBrief addedBy,

            @Schema(description = "When it was added") Instant addedAt,

            @Schema(nullable = true, description = "Set for a line that comes back by itself after it was ticked")
            Repeats repeats,

            @Schema(description = "The first names of people this line is kept from. They don't get the line at all.")
            List<String> hiddenFrom) {}

    /** One heading of a list, with what stands under it. */
    public record ListSection(
            @Schema(description = "The heading. Empty for the lines under no heading.")
            String name,

            int left,
            int done,

            @Schema(
                    nullable = true,
                    description = "The amounts under it added up, in cents. Null when no line has one.")
            Long sumCents) {}

    /** Someone who is in the list right now: they ticked or added a line in the last ten minutes. */
    public record ListHand(PersonBrief who, Did did, Instant at) {}

    /** Something this list held before and doesn't hold now, to add again with one tap. */
    public record ListSuggestion(String text, String section) {}

    public record ChecklistResponse(
            UUID id,
            UUID circleId,
            String title,
            Instant updatedAt,
            boolean mine,
            boolean canEdit,
            AudienceChip chip,
            int left,
            int done,
            List<ItemResponse> items,
            String emoji,

            @Schema(description = "The currency of its amounts, as three letters: EUR")
            String currency,

            @Schema(
                    description =
                            "True for a shopping list: a new line finds its aisle, and the aisles keep their order")
            boolean aisles,

            @Schema(
                    description = "Changes whenever anything in this answer would. It is also the answer's ETag: send"
                            + " that back as If-None-Match to be told 304 while nothing has changed.")
            String version,

            @Schema(nullable = true, description = "Every amount added up, in cents. Null when no line has one.")
            Long sumCents,

            @Schema(nullable = true, description = "The amounts of the ticked lines added up")
            Long sumDoneCents,

            @Schema(description = "The headings in the order to show them, each with its own counts and sum")
            List<ListSection> sections,

            @Schema(description = "Who else is in the list right now")
            List<ListHand> here,

            @Schema(description = "What this list held most often before and doesn't hold now. Eight at most.")
            List<ListSuggestion> suggestions,

            @Schema(description = "Your own choice for this list: whether ticked lines are shown")
            boolean showTicked,

            @Schema(description = "True when you pinned it") boolean pinned,

            @Schema(nullable = true, description = "The folder it is in, when you may see that folder")
            UUID folderId,

            @Schema(description = "The way to it from its space: Home, House manual")
            List<Crumb> breadcrumb,

            @Schema(nullable = true, description = "Who changed it last")
            PersonBrief editedBy,

            @Schema(nullable = true) Instant editedAt) {}

    /** A checklist in a list of them. */
    public record ChecklistRow(
            UUID id,
            UUID circleId,
            String title,
            Instant updatedAt,
            boolean mine,
            AudienceChip chip,
            int left,
            int done) {}

    /** What a new list starts with. Everything but the title can be left out. */
    public record NewList(
            String title,
            Audience audience,
            List<String> items,
            UUID folderId,
            String emoji,
            String currency,
            Boolean aisles) {}

    public record ListChange(String title, String emoji, String currency, Boolean aisles) {}

    public record NewItem(
            String text,
            String note,
            String section,
            Long amountCents,
            UUID assignedTo,
            Repeats repeats,
            List<UUID> hideFrom) {

        public NewItem(String text, String note, String section, Long amountCents, UUID assignedTo) {
            this(text, note, section, amountCents, assignedTo, null, null);
        }
    }

    public record ItemChange(
            String text,
            String note,
            String section,
            Long amountCents,
            Boolean removeAmount,
            UUID assignedTo,
            Boolean unassign,
            Boolean done,
            UUID before,
            Boolean toEnd,
            Repeats repeats,
            Boolean stopRepeating,
            List<UUID> hideFrom) {

        public ItemChange(
                String text,
                String note,
                String section,
                Long amountCents,
                Boolean removeAmount,
                UUID assignedTo,
                Boolean unassign,
                Boolean done,
                UUID before,
                Boolean toEnd) {
            this(
                    text,
                    note,
                    section,
                    amountCents,
                    removeAmount,
                    assignedTo,
                    unassign,
                    done,
                    before,
                    toEnd,
                    null,
                    null,
                    null);
        }

        /** The same change, moving the line to just before another one. */
        ItemChange before(UUID line) {
            return new ItemChange(
                    text,
                    note,
                    section,
                    amountCents,
                    removeAmount,
                    assignedTo,
                    unassign,
                    done,
                    line,
                    toEnd,
                    repeats,
                    stopRepeating,
                    hideFrom);
        }
    }

    /** One change from a queue a phone kept while it had no signal. */
    public record LineChange(ChangeOp op, UUID clientId, UUID itemId, NewItem add, ItemChange change) {}

    public record LineAnswer(
            Outcome outcome,

            @Schema(nullable = true, description = "The line it was about, when there is one")
            UUID itemId,

            @Schema(nullable = true, description = "What happened, in a sentence, when it wasn't simply done")
            String said) {}

    public record LineAnswers(
            @Schema(description = "One answer for each change, in the order they were sent")
            List<LineAnswer> answers,

            @Schema(description = "The list as it stands now")
            ChecklistResponse list) {}

    private final ThingService things;
    private final ThingStore thingStore;
    private final ChecklistStore lists;
    private final CircleService circles;
    private final MemberStore members;
    private final People people;
    private final FolderService folders;
    private final TransactionTemplate transaction;

    ChecklistService(
            ThingService things,
            ThingStore thingStore,
            ChecklistStore lists,
            CircleService circles,
            MemberStore members,
            People people,
            FolderService folders,
            TransactionTemplate transaction) {
        this.things = things;
        this.thingStore = thingStore;
        this.lists = lists;
        this.circles = circles;
        this.members = members;
        this.people = people;
        this.folders = folders;
        this.transaction = transaction;
    }

    @Transactional
    public ChecklistResponse create(
            UUID me, UUID circleId, String title, Audience audience, List<String> items, UUID clientId) {
        return create(me, circleId, new NewList(title, audience, items, null, null, null, null), clientId);
    }

    @Transactional
    public ChecklistResponse create(UUID me, UUID circleId, NewList list, UUID clientId) {
        UUID id = things.create(me, circleId, ThingKind.CHECKLIST, list.title(), list.audience(), clientId);
        if (!lists.exists(id)) {
            lists.insert(id);
            lists.setDetails(
                    id,
                    list.emoji() == null ? "" : list.emoji().trim(),
                    currency(list.currency(), "EUR"),
                    Boolean.TRUE.equals(list.aisles()));
            ThingRow row = things.require(id, me, ThingKind.CHECKLIST);
            UUID mine = circles.me(circleId, me).id();
            for (String text : list.items() == null ? List.<String>of() : list.items()) {
                if (text != null && !text.isBlank()) {
                    put(row, new NewItem(text, null, null, null, null), mine, null);
                }
            }
            lists.changed(id, mine);
            if (list.folderId() != null) {
                folders.fileNew(id, circleId, list.folderId(), me);
            }
        }
        return get(id, me);
    }

    public ChecklistResponse get(UUID id, UUID me) {
        return view(things.require(id, me, ThingKind.CHECKLIST), me, true);
    }

    /** A list for someone who may see it; empty for everyone else. For where a list is drawn inside something else. */
    public Optional<ChecklistResponse> find(UUID id, UUID me) {
        return thingStore
                .find(id, me)
                .filter(row -> row.kind() == ThingKind.CHECKLIST)
                .map(row -> view(row, me, false));
    }

    /**
     * Where a list stands for this person, as a short text ({@link ChecklistStore#state}). To someone who may
     * not see the list, it isn't there.
     */
    public String version(UUID id, UUID me) {
        return lists.state(id, me).orElseThrow(ThingService::notFound);
    }

    /**
     * @param whole false leaves out what only the list's own screen shows (what to add again, where it is
     *     filed), for a list drawn inside a page
     */
    private ChecklistResponse view(ThingRow row, UUID me, boolean whole) {
        UUID id = row.id();
        ListRow details = lists.details(id);
        List<ItemRow> items = lists.items(id, me);
        Map<UUID, PersonBrief> who = people.of(row.circleId());
        Map<UUID, List<HideRow>> hides = lists.hides(id);
        UUID mine = circles.me(row.circleId(), me).id();
        int done = (int) items.stream().filter(i -> i.doneAt() != null).count();
        List<Crumb> way = whole ? folders.breadcrumb(id, me) : List.of();
        return new ChecklistResponse(
                row.id(),
                row.circleId(),
                row.title(),
                row.updatedAt(),
                row.mine(),
                row.canEdit(),
                things.chip(row),
                items.size() - done,
                done,
                items.stream()
                        .map(i -> view(i, who, hides.getOrDefault(i.id(), List.of())))
                        .toList(),
                details.emoji(),
                details.currency(),
                details.aisles(),
                version(id, me),
                sum(items, false),
                sum(items, true),
                sections(items, details.aisles()),
                lists.hands(List.of(id)).stream()
                        .filter(h -> !h.memberId().equals(mine) && who.containsKey(h.memberId()))
                        .map(h -> new ListHand(who.get(h.memberId()), h.did(), h.at()))
                        .toList(),
                whole && row.canEdit()
                        ? lists.usuals(id, MAX_SUGGESTIONS).stream()
                                .map(u -> new ListSuggestion(u.text(), u.section()))
                                .toList()
                        : List.of(),
                lists.showsTicked(id, mine),
                folders.pinned(id, me),
                way.isEmpty() ? null : way.get(way.size() - 1).id(),
                way,
                details.editedBy() == null ? null : who.get(details.editedBy()),
                details.editedAt());
    }

    /** The amounts of the lines added up, or of the ticked ones only. Null when none of them has an amount. */
    static Long sum(List<ItemRow> items, boolean onlyDone) {
        List<Long> amounts = items.stream()
                .filter(i -> i.amountCents() != null && (!onlyDone || i.doneAt() != null))
                .map(ItemRow::amountCents)
                .toList();
        boolean any = items.stream().anyMatch(i -> i.amountCents() != null);
        return any ? amounts.stream().mapToLong(Long::longValue).sum() : null;
    }

    /**
     * The headings of a list in the order to show them, each with its counts and its sum. In a shopping list
     * the aisles keep the order of a shop; anywhere else a heading stands where its first line stands.
     */
    static List<ListSection> sections(List<ItemRow> items, boolean aisles) {
        Map<String, List<ItemRow>> bySection = new LinkedHashMap<>();
        for (ItemRow item : items) {
            bySection.computeIfAbsent(item.section(), s -> new ArrayList<>()).add(item);
        }
        List<String> names = new ArrayList<>(bySection.keySet());
        if (aisles) {
            names.sort(Comparator.comparingInt(Aisles::rank));
        }
        return names.stream()
                .map(name -> {
                    List<ItemRow> under = bySection.get(name);
                    int done =
                            (int) under.stream().filter(i -> i.doneAt() != null).count();
                    return new ListSection(name, under.size() - done, done, sum(under, false));
                })
                .toList();
    }

    @Transactional
    public ChecklistResponse rename(UUID id, UUID me, String title) {
        return change(id, me, new ListChange(title, null, null, null));
    }

    /** Changes what a list is called, its emoji, its currency, or whether it is a shopping list. What is left out stays. */
    @Transactional
    public ChecklistResponse change(UUID id, UUID me, ListChange change) {
        ThingRow row = things.requireEdit(id, me, ThingKind.CHECKLIST);
        ListRow details = lists.details(id);
        lists.setDetails(
                id,
                change.emoji() == null ? details.emoji() : change.emoji().trim(),
                currency(change.currency(), details.currency()),
                change.aisles() == null ? details.aisles() : change.aisles());
        lists.changed(id, circles.me(row.circleId(), me).id());
        thingStore.retitle(
                id, change.title() == null ? row.title() : change.title().trim());
        return get(id, me);
    }

    private static String currency(String code, String otherwise) {
        if (code == null || code.isBlank()) {
            return otherwise;
        }
        String upper = code.trim().toUpperCase(Locale.ROOT);
        if (!upper.matches("[A-Z]{3}")) {
            throw ApiProblem.badRequest("invalid_currency", "Write the currency as three letters, like EUR.");
        }
        return upper;
    }

    /** One person's own way of looking at a list: with the ticked lines, or without. */
    @Transactional
    public ChecklistResponse look(UUID id, UUID me, boolean showTicked) {
        ThingRow row = things.require(id, me, ThingKind.CHECKLIST);
        lists.setShowTicked(id, circles.me(row.circleId(), me).id(), showTicked);
        return get(id, me);
    }

    public Page<ChecklistRow> list(UUID circleId, UUID me, Keyset page) {
        List<ThingRow> rows = thingStore.list(circleId, me, ThingKind.CHECKLIST, null, null, page);
        Map<UUID, AudienceChip> chips = things.chips(rows);
        Map<UUID, Tally> tallies = lists.tallies(rows.stream().map(ThingRow::id).toList(), me);
        return page.page(rows, row -> Keyset.cursor(row.updatedAt(), row.id()))
                .map(shown -> shown.stream()
                        .map(r -> {
                            Tally tally = tallies.getOrDefault(r.id(), new Tally(0, 0));
                            return new ChecklistRow(
                                    r.id(),
                                    r.circleId(),
                                    r.title(),
                                    r.updatedAt(),
                                    r.mine(),
                                    chips.get(r.id()),
                                    tally.left(),
                                    tally.done());
                        })
                        .toList());
    }

    // ---------- one line at a time ----------

    @Transactional
    public ItemResponse add(UUID listId, UUID me, NewItem item, UUID clientId) {
        ThingRow row = things.requireEdit(listId, me, ThingKind.CHECKLIST);
        fits(item.text(), item.note(), item.section(), item.amountCents());
        Map<UUID, PersonBrief> who = people.of(row.circleId());
        Optional<ItemRow> sentBefore = clientId == null ? Optional.empty() : lists.sentBefore(listId, clientId);
        if (sentBefore.isPresent()) {
            return view(sentBefore.get(), who, hidesOf(sentBefore.get()));
        }
        if (lists.count(listId) >= MAX_ITEMS) {
            throw ApiProblem.conflict(
                    "list_full", "A list holds 500 lines at most. Clear the ticked ones, or start another.");
        }
        UUID mine = circles.me(row.circleId(), me).id();
        ItemRow added = lists.item(put(row, item, mine, clientId)).orElseThrow();
        changed(listId, mine, Did.ADDED);
        return view(added, who, hidesOf(added));
    }

    /**
     * Writes a new line. With no heading given it goes where the same line went last time on this list; a
     * shopping list finds the aisle for a line it hasn't seen before. The list remembers what it was given,
     * for "add again", except a line that is kept from someone.
     */
    private UUID put(ThingRow list, NewItem item, UUID mine, UUID clientId) {
        String text = clean(item.text());
        String key = text.toLowerCase(Locale.ROOT);
        List<UUID> keptFrom = keptFrom(list.circleId(), item.hideFrom(), mine);
        String section = item.section() != null
                ? item.section().trim()
                : lists.usualSection(list.id(), key)
                        .orElseGet(() -> lists.details(list.id()).aisles() ? Aisles.of(text) : "");
        UUID id = lists.add(
                list.id(),
                text,
                item.note() == null ? "" : item.note().trim(),
                section,
                item.amountCents(),
                inCircle(list.circleId(), item.assignedTo()),
                mine,
                clientId,
                item.repeats());
        if (keptFrom.isEmpty()) {
            lists.used(list.id(), key, text, section);
        } else {
            lists.setHides(id, keptFrom);
            lists.forget(list.id(), key);
        }
        return id;
    }

    @Transactional
    public ItemResponse change(UUID itemId, UUID me, ItemChange change) {
        // A line that is kept from this person isn't there for them.
        ItemRow item = lists.item(itemId, me).orElseThrow(ChecklistService::lineGone);
        ThingRow row;
        try {
            row = things.requireEdit(item.listId(), me, ThingKind.CHECKLIST);
        } catch (ApiProblem problem) {
            // A line of a list this person may not see isn't there for them either.
            throw problem.status() == HttpStatus.NOT_FOUND ? lineGone() : problem;
        }
        fits(change.text(), change.note(), change.section(), change.amountCents());
        UUID mine = circles.me(row.circleId(), me).id();
        UUID assigned = Boolean.TRUE.equals(change.unassign())
                ? null
                : change.assignedTo() == null ? item.assignedTo() : inCircle(row.circleId(), change.assignedTo());
        lists.change(
                itemId,
                change.text() == null ? item.text() : clean(change.text()),
                change.note() == null ? item.note() : change.note().trim(),
                change.section() == null ? item.section() : change.section().trim(),
                Boolean.TRUE.equals(change.removeAmount())
                        ? null
                        : change.amountCents() == null ? item.amountCents() : change.amountCents(),
                assigned);
        if (change.section() != null) {
            lists.usualGoesUnder(
                    item.listId(),
                    item.text().toLowerCase(Locale.ROOT),
                    change.section().trim());
        }
        if (change.repeats() != null || Boolean.TRUE.equals(change.stopRepeating())) {
            lists.setRepeats(itemId, Boolean.TRUE.equals(change.stopRepeating()) ? null : change.repeats());
        }
        if (change.hideFrom() != null) {
            List<UUID> keptFrom = keptFrom(row.circleId(), change.hideFrom(), mine);
            lists.setHides(itemId, keptFrom);
            if (!keptFrom.isEmpty()) {
                lists.forget(item.listId(), item.text().toLowerCase(Locale.ROOT));
            }
        }
        if (change.done() != null) {
            lists.tick(itemId, change.done(), mine);
        }
        if (change.before() != null || Boolean.TRUE.equals(change.toEnd())) {
            if (change.before() != null
                    && lists.item(change.before(), me)
                            .filter(b -> b.listId().equals(item.listId()))
                            .isEmpty()) {
                throw ApiProblem.badRequest("not_in_list", "That line isn't in this list.");
            }
            lists.move(itemId, item.listId(), change.before());
        }
        changed(item.listId(), mine, Boolean.TRUE.equals(change.done()) ? Did.TICKED : null);
        ItemRow now = lists.item(itemId).orElseThrow();
        return view(now, people.of(row.circleId()), hidesOf(now));
    }

    @Transactional
    public void remove(UUID itemId, UUID me) {
        ItemRow item = lists.item(itemId, me).orElse(null);
        if (item == null) {
            return; // removing what is gone is fine: two people may remove the same line
        }
        ThingRow row;
        try {
            row = things.requireEdit(item.listId(), me, ThingKind.CHECKLIST);
        } catch (ApiProblem problem) {
            throw problem.status() == HttpStatus.NOT_FOUND ? lineGone() : problem;
        }
        lists.delete(itemId);
        changed(item.listId(), circles.me(row.circleId(), me).id(), null);
    }

    @Transactional
    public ChecklistResponse clearDone(UUID listId, UUID me) {
        ThingRow row = things.requireEdit(listId, me, ThingKind.CHECKLIST);
        if (lists.clearDone(listId, me) > 0) {
            changed(listId, circles.me(row.circleId(), me).id(), null);
            lists.forgetTheRarest(listId);
        }
        return get(listId, me);
    }

    /** A list changed: its version goes up, it is the latest thing its editor did, and the others see them in it. */
    private void changed(UUID listId, UUID by, Did did) {
        lists.changed(listId, by);
        thingStore.touch(listId);
        if (did != null) {
            lists.did(listId, by, did);
        }
    }

    // ---------- changes that waited on a phone ----------

    /**
     * Takes the changes a phone kept while it had no signal, in the order it made them. Each is done by
     * itself and gets its own answer: one that came too late (its line was removed in the meantime) or
     * can't be done says so and doesn't stop the rest. Sending the same queue again is safe: a line is
     * added once, a tick that is there stays, and removing what is gone is fine.
     */
    public LineAnswers changes(UUID listId, UUID me, List<LineChange> changes) {
        things.requireEdit(listId, me, ThingKind.CHECKLIST);
        List<LineAnswer> answers = new ArrayList<>();
        for (LineChange change : changes) {
            try {
                answers.add(transaction.execute(status -> apply(listId, me, change)));
            } catch (ApiProblem problem) {
                answers.add(
                        problem.status() == HttpStatus.NOT_FOUND
                                ? gone(change.itemId())
                                : new LineAnswer(Outcome.REFUSED, change.itemId(), problem.getMessage()));
            }
        }
        return new LineAnswers(answers, get(listId, me));
    }

    private LineAnswer apply(UUID listId, UUID me, LineChange change) {
        switch (change.op()) {
            case ADD -> {
                if (change.clientId() == null
                        || change.add() == null
                        || change.add().text() == null
                        || change.add().text().isBlank()) {
                    throw ApiProblem.badRequest("invalid_input", "A line to add needs its words.");
                }
                return new LineAnswer(
                        Outcome.DONE,
                        add(listId, me, change.add(), change.clientId()).id(),
                        null);
            }
            case CHANGE -> {
                if (change.itemId() == null || change.change() == null) {
                    throw ApiProblem.badRequest("invalid_input", "A change needs the line it is for.");
                }
                Optional<ItemRow> line = inList(change.itemId(), listId, me);
                if (line.isEmpty()) {
                    return gone(change.itemId());
                }
                UUID before = change.change().before();
                change(
                        line.get().id(),
                        me,
                        before == null
                                ? change.change()
                                : change.change()
                                        .before(inList(before, listId, me)
                                                .map(ItemRow::id)
                                                .orElse(before)));
                return new LineAnswer(Outcome.DONE, line.get().id(), null);
            }
            case REMOVE -> {
                Optional<ItemRow> line =
                        change.itemId() == null ? Optional.empty() : inList(change.itemId(), listId, me);
                line.ifPresent(found -> remove(found.id(), me));
                return new LineAnswer(Outcome.DONE, line.map(ItemRow::id).orElse(change.itemId()), null);
            }
        }
        throw new IllegalStateException();
    }

    /**
     * A line of this list, named by its id or by the clientId it was added with: a phone that added a line
     * without signal knows it only by that, and may have ticked it since.
     */
    private Optional<ItemRow> inList(UUID itemId, UUID listId, UUID me) {
        Optional<ItemRow> byId = lists.item(itemId, me).filter(i -> i.listId().equals(listId));
        return byId.isPresent() ? byId : lists.sentBefore(listId, itemId).flatMap(i -> lists.item(i.id(), me));
    }

    private static LineAnswer gone(UUID itemId) {
        return new LineAnswer(
                Outcome.GONE, itemId, "That line was removed while you were away, so there was nothing to change.");
    }

    // ---------- by itself ----------

    /**
     * Brings back the repeating lines whose time has come round (the milk, a week on). Run every few minutes;
     * safe in every copy of the API at once. Returns how many lists it changed.
     */
    @Transactional
    public int bringBackRepeating() {
        List<UUID> changed = lists.bringBack();
        changed.forEach(list -> lists.changed(list, null));
        return changed.size();
    }

    private static ApiProblem lineGone() {
        return new ApiProblem(HttpStatus.NOT_FOUND, "not_found", "That line isn't there any more.");
    }

    private static String clean(String text) {
        return text.trim().replaceAll("\\s+", " ");
    }

    /** The same limits the single routes check on the way in, for a change that arrives in a queue. */
    private static void fits(String text, String note, String section, Long amountCents) {
        if (text != null && (text.isBlank() || text.length() > 300)) {
            throw ApiProblem.badRequest("invalid_input", "Keep a line to 300 characters or fewer.");
        }
        if ((note != null && note.length() > 300) || (section != null && section.length() > 60)) {
            throw ApiProblem.badRequest("invalid_input", "Keep the small print of a line short.");
        }
        if (amountCents != null && (amountCents < 0 || amountCents > 100_000_000_000L)) {
            throw ApiProblem.badRequest("invalid_input", "That amount doesn't look right.");
        }
    }

    private UUID inCircle(UUID circleId, UUID memberId) {
        if (memberId == null) {
            return null;
        }
        return members.find(memberId)
                .filter(m -> m.circleId().equals(circleId))
                .map(MemberRow::id)
                .orElseThrow(() -> ApiProblem.badRequest("not_in_circle", "Choose someone from this circle."));
    }

    /** The people a line is to be kept from: people of this circle, and never the one who is writing it. */
    private List<UUID> keptFrom(UUID circleId, List<UUID> memberIds, UUID mine) {
        if (memberIds == null || memberIds.isEmpty()) {
            return List.of();
        }
        List<UUID> chosen = memberIds.stream().distinct().toList();
        if (chosen.contains(mine)) {
            throw ApiProblem.badRequest("hidden_from_yourself", "You can't keep a line from yourself.");
        }
        for (UUID memberId : chosen) {
            if (members.find(memberId)
                    .filter(m -> m.circleId().equals(circleId) && m.kind() != MemberKind.PET)
                    .isEmpty()) {
                throw ApiProblem.badRequest("not_in_circle", "Choose someone from this circle.");
            }
        }
        return chosen;
    }

    private List<HideRow> hidesOf(ItemRow item) {
        return lists.hides(item.listId()).getOrDefault(item.id(), List.of());
    }

    private static ItemResponse view(ItemRow i, Map<UUID, PersonBrief> people, List<HideRow> hides) {
        Function<UUID, PersonBrief> who = id -> id == null ? null : people.get(id);
        return new ItemResponse(
                i.id(),
                i.text(),
                i.note(),
                i.section(),
                i.amountCents(),
                i.doneAt() != null,
                i.doneAt(),
                who.apply(i.doneBy()),
                who.apply(i.assignedTo()),
                who.apply(i.addedBy()),
                i.createdAt(),
                i.repeats(),
                hides.stream().map(h -> Names.first(h.name())).toList());
    }
}

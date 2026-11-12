package app.homeport.api.list;

import app.homeport.api.circle.CircleService;
import app.homeport.api.circle.MemberStore;
import app.homeport.api.circle.MemberStore.MemberRow;
import app.homeport.api.common.ApiProblem;
import app.homeport.api.common.Keyset;
import app.homeport.api.common.Names;
import app.homeport.api.common.Page;
import app.homeport.api.list.ChecklistStore.ItemRow;
import app.homeport.api.list.ChecklistStore.Tally;
import app.homeport.api.media.MediaService;
import app.homeport.api.media.MediaSize;
import app.homeport.api.thing.Audience;
import app.homeport.api.thing.ThingKind;
import app.homeport.api.thing.ThingService;
import app.homeport.api.thing.ThingService.AudienceChip;
import app.homeport.api.thing.ThingService.PersonBrief;
import app.homeport.api.thing.ThingStore;
import app.homeport.api.thing.ThingStore.ThingRow;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Checklists. Every change is to one line (add it, tick it, change it, move it, remove it), never to the whole
 * list, so two people using a list at the same moment both keep what they did; and adding a line carries a
 * clientId, so a phone that sends it again after a bad connection doesn't add it twice.
 */
@Service
public class ChecklistService {

    static final int MAX_ITEMS = 500;

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
            PersonBrief addedBy) {}

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
            List<ItemResponse> items) {}

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

    public record NewItem(String text, String note, String section, Long amountCents, UUID assignedTo) {}

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
            Boolean toEnd) {}

    private final ThingService things;
    private final ThingStore thingStore;
    private final ChecklistStore lists;
    private final CircleService circles;
    private final MemberStore members;
    private final MediaService media;

    ChecklistService(
            ThingService things,
            ThingStore thingStore,
            ChecklistStore lists,
            CircleService circles,
            MemberStore members,
            MediaService media) {
        this.things = things;
        this.thingStore = thingStore;
        this.lists = lists;
        this.circles = circles;
        this.members = members;
        this.media = media;
    }

    @Transactional
    public ChecklistResponse create(
            UUID me, UUID circleId, String title, Audience audience, List<String> items, UUID clientId) {
        UUID id = things.create(me, circleId, ThingKind.CHECKLIST, title, audience, clientId);
        if (!lists.exists(id)) {
            lists.insert(id);
            UUID mine = circles.me(circleId, me).id();
            for (String text : items == null ? List.<String>of() : items) {
                if (text != null && !text.isBlank()) {
                    lists.add(id, clean(text), "", "", null, null, mine, null);
                }
            }
        }
        return get(id, me);
    }

    public ChecklistResponse get(UUID id, UUID me) {
        ThingRow row = things.require(id, me, ThingKind.CHECKLIST);
        List<ItemRow> items = lists.items(id);
        Map<UUID, PersonBrief> people = people(row.circleId());
        int done = (int) items.stream().filter(i -> i.doneAt() != null).count();
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
                items.stream().map(i -> view(i, people)).toList());
    }

    @Transactional
    public ChecklistResponse rename(UUID id, UUID me, String title) {
        things.requireEdit(id, me, ThingKind.CHECKLIST);
        thingStore.retitle(id, title.trim());
        return get(id, me);
    }

    public Page<ChecklistRow> list(UUID circleId, UUID me, Keyset page) {
        List<ThingRow> rows = thingStore.list(circleId, me, ThingKind.CHECKLIST, null, null, page);
        Map<UUID, AudienceChip> chips = things.chips(rows);
        Map<UUID, Tally> tallies = lists.tallies(rows.stream().map(ThingRow::id).toList());
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
        if (lists.count(listId) >= MAX_ITEMS) {
            throw ApiProblem.conflict(
                    "list_full", "A list holds 500 lines at most. Clear the ticked ones, or start another.");
        }
        UUID assigned = inCircle(row.circleId(), item.assignedTo());
        UUID id = lists.add(
                listId,
                clean(item.text()),
                item.note() == null ? "" : item.note().trim(),
                item.section() == null ? "" : item.section().trim(),
                item.amountCents(),
                assigned,
                circles.me(row.circleId(), me).id(),
                clientId);
        thingStore.touch(listId);
        return view(lists.item(id).orElseThrow(), people(row.circleId()));
    }

    @Transactional
    public ItemResponse change(UUID itemId, UUID me, ItemChange change) {
        ItemRow item = lists.item(itemId).orElseThrow(ChecklistService::lineGone);
        ThingRow row;
        try {
            row = things.requireEdit(item.listId(), me, ThingKind.CHECKLIST);
        } catch (ApiProblem problem) {
            // A line of a list this person may not see isn't there for them either.
            throw problem.status() == HttpStatus.NOT_FOUND ? lineGone() : problem;
        }
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
        if (change.done() != null) {
            lists.tick(itemId, change.done(), circles.me(row.circleId(), me).id());
        }
        if (change.before() != null || Boolean.TRUE.equals(change.toEnd())) {
            if (change.before() != null
                    && lists.item(change.before())
                            .filter(b -> b.listId().equals(item.listId()))
                            .isEmpty()) {
                throw ApiProblem.badRequest("not_in_list", "That line isn't in this list.");
            }
            lists.move(itemId, item.listId(), change.before());
        }
        thingStore.touch(item.listId());
        return view(lists.item(itemId).orElseThrow(), people(row.circleId()));
    }

    @Transactional
    public void remove(UUID itemId, UUID me) {
        ItemRow item = lists.item(itemId).orElse(null);
        if (item == null) {
            return; // removing what is gone is fine: two people may remove the same line
        }
        try {
            things.requireEdit(item.listId(), me, ThingKind.CHECKLIST);
        } catch (ApiProblem problem) {
            throw problem.status() == HttpStatus.NOT_FOUND ? lineGone() : problem;
        }
        lists.delete(itemId);
        thingStore.touch(item.listId());
    }

    @Transactional
    public ChecklistResponse clearDone(UUID listId, UUID me) {
        things.requireEdit(listId, me, ThingKind.CHECKLIST);
        if (lists.clearDone(listId) > 0) {
            thingStore.touch(listId);
        }
        return get(listId, me);
    }

    private static ApiProblem lineGone() {
        return new ApiProblem(HttpStatus.NOT_FOUND, "not_found", "That line isn't there any more.");
    }

    private static String clean(String text) {
        return text.trim().replaceAll("\\s+", " ");
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

    private Map<UUID, PersonBrief> people(UUID circleId) {
        return members.of(List.of(circleId)).stream()
                .collect(Collectors.toMap(
                        MemberRow::id,
                        m -> new PersonBrief(
                                m.id(), Names.first(m.name()), media.urlFor(m.avatarKey(), MediaSize.SMALL)),
                        (a, b) -> a));
    }

    private static ItemResponse view(ItemRow i, Map<UUID, PersonBrief> people) {
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
                who.apply(i.addedBy()));
    }
}

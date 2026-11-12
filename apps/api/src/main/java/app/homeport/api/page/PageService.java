package app.homeport.api.page;

import app.homeport.api.common.Keyset;
import app.homeport.api.common.Page;
import app.homeport.api.thing.Audience;
import app.homeport.api.thing.ThingKind;
import app.homeport.api.thing.ThingService;
import app.homeport.api.thing.ThingService.AudienceChip;
import app.homeport.api.thing.ThingStore;
import app.homeport.api.thing.ThingStore.ThingRow;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Pages: a title and words. */
@Service
public class PageService {

    public record PageResponse(
            UUID id,
            UUID circleId,
            String title,
            String body,
            Instant updatedAt,
            boolean mine,
            boolean canEdit,
            AudienceChip chip) {}

    /** A page in a list: its title and how it starts. */
    public record PageRow(
            UUID id,
            UUID circleId,
            String title,

            @Schema(description = "The first words of the page")
            String start,

            Instant updatedAt,
            boolean mine,
            AudienceChip chip) {}

    private final ThingService things;
    private final ThingStore thingStore;
    private final PageStore pages;

    PageService(ThingService things, ThingStore thingStore, PageStore pages) {
        this.things = things;
        this.thingStore = thingStore;
        this.pages = pages;
    }

    @Transactional
    public PageResponse create(UUID me, UUID circleId, String title, String body, Audience audience, UUID clientId) {
        UUID id = things.create(me, circleId, ThingKind.PAGE, title, audience, clientId);
        pages.insert(id, body == null ? "" : body);
        return get(id, me);
    }

    public PageResponse get(UUID id, UUID me) {
        ThingRow row = things.require(id, me, ThingKind.PAGE);
        return new PageResponse(
                row.id(),
                row.circleId(),
                row.title(),
                pages.body(id).orElse(""),
                row.updatedAt(),
                row.mine(),
                row.canEdit(),
                things.chip(row));
    }

    @Transactional
    public PageResponse change(UUID id, UUID me, String title, String body) {
        ThingRow row = things.requireEdit(id, me, ThingKind.PAGE);
        if (body != null) {
            pages.save(id, body);
        }
        thingStore.retitle(id, title == null ? row.title() : title.trim());
        return get(id, me);
    }

    public Page<PageRow> list(UUID circleId, UUID me, Keyset page) {
        List<ThingRow> rows = thingStore.list(circleId, me, ThingKind.PAGE, null, null, page);
        Map<UUID, AudienceChip> chips = things.chips(rows);
        Map<UUID, String> starts = pages.starts(rows.stream().map(ThingRow::id).toList());
        return page.page(rows, row -> Keyset.cursor(row.updatedAt(), row.id()))
                .map(shown -> shown.stream()
                        .map(r -> new PageRow(
                                r.id(),
                                r.circleId(),
                                r.title(),
                                starts.getOrDefault(r.id(), ""),
                                r.updatedAt(),
                                r.mine(),
                                chips.get(r.id())))
                        .toList());
    }
}

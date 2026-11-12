package app.homeport.api.board.gallery;

import app.homeport.api.board.BoardService;
import app.homeport.api.board.BoardService.BoardResponse;
import app.homeport.api.board.Boards;
import app.homeport.api.board.Template;
import app.homeport.api.board.TemplateGroup;
import app.homeport.api.board.TemplateTopic;
import app.homeport.api.board.gallery.Starter.Line;
import app.homeport.api.board.gallery.Starter.Piece;
import app.homeport.api.circle.CircleKind;
import app.homeport.api.circle.CircleService;
import app.homeport.api.circle.CircleStore.CircleRow;
import app.homeport.api.list.ChecklistService;
import app.homeport.api.list.ChecklistService.NewItem;
import app.homeport.api.page.PageService;
import app.homeport.api.thing.Audience;
import app.homeport.api.thing.ThingService;
import app.homeport.api.thing.ThingService.ThingBrief;
import app.homeport.api.thing.ThingStore;
import app.homeport.api.thing.ThingStore.ThingRow;
import io.swagger.v3.oas.annotations.media.Schema;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The gallery of templates. The catalog is {@link Template}, in Java, not a table: every card a screen names.
 * A circle is shown its own kind's templates first, then all the rest; nothing is ever kept from a circle
 * because of its kind.
 *
 * <p>Starting a plain template makes its pages and checklists (through the page and checklist services, so
 * they are ordinary things from the first moment). Starting one that does work makes its board. A template
 * that does work but has no rules yet says it is coming, and can't be started.
 */
@Service
public class GalleryService {

    static final String COMING = "Coming with the next update";

    /** One card of the gallery. */
    public record TemplateCard(
            Template template,
            String name,
            String emoji,

            @Schema(description = "The line under its name") String line,

            TemplateGroup group,
            TemplateTopic topic,

            @Schema(description = "True for a template that does work (the LIVE tag); false for a plain starter")
            boolean live,

            @Schema(description = "True when it is offered to this kind of circle first")
            boolean yours,

            @Schema(description = "True when it can be started now")
            boolean ready,

            @Schema(nullable = true, description = "For one that can't be started yet: Coming with the next update")
            String note,

            @Schema(description = "What starting it makes: Page · House manual, Checklist · When we go away")
            List<String> makes) {}

    public record GroupCount(
            TemplateGroup group,
            int count,

            @Schema(description = "How many of them are offered to this kind of circle first")
            int yours) {}

    public record TemplateGalleryResponse(
            CircleKind kind,

            @Schema(description = "Templates and keepsakes together: what “All 53” and “53 ready to use” count")
            int total,

            @Schema(description = "How many of those are offered to this kind of circle first: “For two · 16”")
            int yours,

            @Schema(description = "The three shelves with their counts. Fair and fun is counted on its own.")
            List<GroupCount> groups,

            @Schema(description = "The chips this kind of circle gets next to All")
            List<TemplateTopic> topics,

            @Schema(description = "Every template: this kind's own first, then the rest. 67 in all.")
            List<TemplateCard> templates) {}

    /** What starting a template answers: what was made, and for a template that does work, its board. */
    public record StartedResponse(
            Template template,
            List<ThingBrief> made,
            @Schema(nullable = true) BoardResponse board) {}

    private static final Map<CircleKind, List<TemplateTopic>> CHIPS = Map.of(
            CircleKind.FAMILY, List.of(TemplateTopic.HOME, TemplateTopic.KIDS, TemplateTopic.FOOD),
            CircleKind.SOLO, List.of(TemplateTopic.HOME, TemplateTopic.FOOD, TemplateTopic.TRIPS),
            CircleKind.COUPLE, List.of(TemplateTopic.HOME, TemplateTopic.MONEY, TemplateTopic.TRIPS),
            CircleKind.FLAT, List.of(TemplateTopic.MONEY, TemplateTopic.LANDLORD),
            CircleKind.CREW, List.of(TemplateTopic.TRIPS, TemplateTopic.MONEY));

    private final CircleService circles;
    private final Boards boards;
    private final BoardService boardService;
    private final PageService pages;
    private final ChecklistService lists;
    private final ThingService things;
    private final ThingStore thingStore;

    GalleryService(
            CircleService circles,
            Boards boards,
            BoardService boardService,
            PageService pages,
            ChecklistService lists,
            ThingService things,
            ThingStore thingStore) {
        this.circles = circles;
        this.boards = boards;
        this.boardService = boardService;
        this.pages = pages;
        this.lists = lists;
        this.things = things;
        this.thingStore = thingStore;
    }

    public TemplateGalleryResponse gallery(UUID circleId, UUID me) {
        CircleRow circle = circles.require(circleId, me);
        return gallery(circle.kind());
    }

    /** The gallery as one kind of circle is shown it. */
    TemplateGalleryResponse gallery(CircleKind kind) {
        List<Template> ordered = Arrays.stream(Template.values())
                .sorted(Comparator.comparingInt((Template t) -> t.rankFor(kind) < 0 ? 9 : t.rankFor(kind))
                        .thenComparingInt(Template::ordinal))
                .toList();
        List<Template> counted = ordered.stream()
                .filter(t -> t.group() != TemplateGroup.FAIR_AND_FUN)
                .toList();
        return new TemplateGalleryResponse(
                kind,
                counted.size(),
                (int) counted.stream().filter(t -> t.rankFor(kind) >= 0).count(),
                Arrays.stream(TemplateGroup.values())
                        .map(group -> new GroupCount(
                                group,
                                (int) ordered.stream()
                                        .filter(t -> t.group() == group)
                                        .count(),
                                (int) ordered.stream()
                                        .filter(t -> t.group() == group && t.rankFor(kind) >= 0)
                                        .count()))
                        .toList(),
                CHIPS.get(kind),
                ordered.stream().map(t -> card(t, kind)).toList());
    }

    private TemplateCard card(Template template, CircleKind kind) {
        boolean ready = template.live() ? boards.has(template) : Starters.of(template) != null;
        Starter starter = Starters.of(template);
        return new TemplateCard(
                template,
                template.title(),
                template.emoji(),
                template.line(),
                template.group(),
                template.topic(),
                template.live(),
                template.rankFor(kind) >= 0,
                ready,
                ready ? null : COMING,
                starter == null
                        ? List.of()
                        : starter.pieces().stream()
                                .map(p -> (p.page() ? "Page · " : "Checklist · ") + p.title())
                                .toList());
    }

    /**
     * Starts a template in a circle. A plain one makes its pages and checklists; one that does work makes its
     * board, with the settings sent. Sending the same clientId again makes nothing new.
     *
     * @param title for a board, or for the first thing a plain template makes; left out, each keeps its own name
     */
    @Transactional
    public StartedResponse start(
            UUID me,
            UUID circleId,
            Template template,
            String title,
            Audience audience,
            Map<String, Object> settings,
            UUID clientId,
            LocalDate day) {
        circles.require(circleId, me);
        if (template.live()) {
            BoardResponse board = boardService.create(me, circleId, template, title, audience, settings, clientId, day);
            return new StartedResponse(template, briefs(List.of(board.id()), me), board);
        }
        Starter starter = Starters.of(template);
        if (starter == null) {
            throw Boards.coming(template);
        }
        List<UUID> made = new ArrayList<>();
        int n = 0;
        for (Piece piece : starter.pieces()) {
            UUID pieceId = derived(clientId, "piece " + n);
            String name = n == 0 && title != null && !title.isBlank() ? title.trim() : piece.title();
            Audience startsAs = piece.onlyYou() ? Audience.ME : audience;
            if (piece.page()) {
                made.add(pages.create(me, circleId, name, piece.body(), startsAs, pieceId)
                        .id());
            } else {
                UUID list = lists.create(me, circleId, name, startsAs, List.of(), pieceId)
                        .id();
                int line = 0;
                for (Line item : piece.lines()) {
                    lists.add(
                            list,
                            me,
                            new NewItem(item.text(), null, item.section(), null, null),
                            derived(pieceId, "line " + line++));
                }
                made.add(list);
            }
            n++;
        }
        return new StartedResponse(template, briefs(made, me), null);
    }

    /** These things as the person who just made them sees them, in the order they were made. */
    private List<ThingBrief> briefs(List<UUID> ids, UUID me) {
        Map<UUID, ThingRow> rows =
                thingStore.findAll(ids, me).stream().collect(Collectors.toMap(ThingRow::id, Function.identity()));
        return things.briefs(
                ids.stream().map(rows::get).filter(java.util.Objects::nonNull).toList(), me);
    }

    /** A clientId for one part of a start, the same every time the same start is sent. */
    private static UUID derived(UUID from, String part) {
        return UUID.nameUUIDFromBytes((from + " " + part).getBytes(StandardCharsets.UTF_8));
    }
}

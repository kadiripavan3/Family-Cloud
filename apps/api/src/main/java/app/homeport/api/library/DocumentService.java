package app.homeport.api.library;

import app.homeport.api.circle.CircleService;
import app.homeport.api.circle.MemberStore.MemberRow;
import app.homeport.api.common.ApiProblem;
import app.homeport.api.common.Keyset;
import app.homeport.api.common.Page;
import app.homeport.api.library.AlbumService.AlbumResponse;
import app.homeport.api.library.AlbumStore.AlbumRow;
import app.homeport.api.library.DatedThings.Days;
import app.homeport.api.library.DocumentReader.FoundDate;
import app.homeport.api.library.DocumentReader.Mrz;
import app.homeport.api.library.DocumentReader.Reading;
import app.homeport.api.library.DocumentStore.DocumentRow;
import app.homeport.api.library.DocumentStore.Linked;
import app.homeport.api.library.LibraryStore.Filter;
import app.homeport.api.library.LibraryStore.Item;
import app.homeport.api.media.MediaService;
import app.homeport.api.media.MediaSize;
import app.homeport.api.thing.Place;
import app.homeport.api.thing.ThingKind;
import app.homeport.api.thing.ThingService;
import app.homeport.api.thing.ThingService.AudienceChip;
import app.homeport.api.thing.ThingService.PersonBrief;
import app.homeport.api.thing.ThingService.ThingBrief;
import app.homeport.api.thing.ThingStore;
import app.homeport.api.thing.ThingStore.ThingRow;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Files: the scans and documents that live beside the photos. A document is a thing in the Library like a
 * photo; what it adds is the words the phone read inside it, and what those words say by rule (see
 * {@link DocumentReader}): the day it runs out, the total of a receipt, the lines of a passport.
 */
@Service
public class DocumentService {

    /** The kind of thing Plan makes when it reminds someone. A document linked to one says "reminder set". */
    static final String REMINDER = "reminder";

    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("d MMM yyyy", Locale.ENGLISH);

    /** The day that matters about a document. */
    public record KeyDate(
            DateLabel label,
            LocalDate date,

            @Schema(description = "How many days from today. Negative once it has passed.")
            long daysLeft,

            @Schema(description = "True when it is time to do something: within 60 days, or within a year for an ID")
            boolean soon,

            @Schema(description = "True when someone set it by hand instead of it being read from the words")
            boolean byHand) {}

    /** A document in the list of files. */
    public record DocumentCard(
            UUID id,
            UUID circleId,
            String title,

            @Schema(description = "The small label on its tile: PDF, JPG, or ID for a passport or a card")
            String badge,

            DocumentCategory category,
            @Schema(nullable = true) Integer pages,
            long bytes,

            @Schema(nullable = true, description = "A picture of it, small, when it has one")
            String thumbUrl,

            @Schema(description = "The file itself") String fileUrl,
            @Schema(nullable = true) KeyDate keyDate,

            @Schema(nullable = true, description = "The total of a receipt, in cents")
            Long amountCents,

            @Schema(nullable = true) String currency,

            @Schema(description = "True when a reminder in Plan is linked to it")
            boolean reminderSet,

            @Schema(description = "True when something in the Vault is linked to it: the app shows a lock")
            boolean inVault,

            @Schema(nullable = true, description = "The name of the first page or list it is linked from")
            String linkedFrom,

            @Schema(description = "Who it is about: it shows on their page")
            List<PersonBrief> about,

            @Schema(nullable = true) PersonBrief addedBy,
            Instant addedAt,
            boolean mine,
            boolean canEdit,
            AudienceChip chip) {}

    /** Something read from the words of a scan. */
    public record Fact(
            String label,
            String text,

            @Schema(nullable = true, description = "The same as a day, when it is one")
            LocalDate date,

            @Schema(description = "True for something to show only when asked, like a passport's number")
            boolean secret) {}

    public record FoundDay(DateLabel label, LocalDate date) {}

    /** A travel document that runs out too soon after a trip it is linked to. */
    public record Clash(
            ThingBrief trip,
            LocalDate tripEnds,

            @Schema(
                    description =
                            "How many months it is still good for after the trip. Many countries want six. Zero or less: it runs out before the trip ends.")
            int monthsLeftAfter) {}

    public record DocumentResponse(
            DocumentCard document,
            @Schema(nullable = true) String fileName,
            String contentType,

            @Schema(nullable = true, description = "The scan as a picture, when the file is one")
            String pictureUrl,

            @Schema(description = "True when the phone sent the words inside it, so it can be searched")
            boolean hasText,

            @Schema(
                    description = "The words inside it as they are kept: what \"change the words\" starts with. Empty"
                            + " when the phone sent none.")
            String text,

            @Schema(description = "What was read from the words, to show and to correct")
            List<Fact> facts,

            @Schema(description = "Every day found after a word that says what it means")
            List<FoundDay> dates,

            @Schema(nullable = true, description = "A good day for a reminder. Making the reminder is Plan's.")
            LocalDate remindOn,

            @Schema(description = "What it is linked to: its entry in the Vault, the trip it is needed for")
            List<ThingBrief> linked,

            @Schema(nullable = true) Clash clash) {}

    public record CategoryCount(DocumentCategory category, int count) {}

    public record FilesSummary(
            @Schema(description = "How many documents you may see in this circle")
            int total,

            @Schema(description = "The kinds there are, the one with most first")
            List<CategoryCount> categories,

            @Schema(description = "The folders you may see, a hundred at most")
            List<AlbumResponse> folders) {}

    public record DocumentChange(
            @Size(min = 1, max = 200, message = "Keep the name to 200 characters or fewer.")
            String title,

            DocumentCategory category,
            @Min(1) @Max(5000) Integer pages,

            @Schema(description = "The words inside it, read again on the phone")
            @Size(max = 200000, message = "That is more text than a document can keep.")
            String text,

            @Schema(description = "Set the day that matters by hand, with keyLabel")
            LocalDate keyDate,

            DateLabel keyLabel,

            @Schema(description = "True to go back to the day read from the words, or to none")
            Boolean removeKeyDate) {}

    private final DocumentStore documents;
    private final LibraryStore library;
    private final LibraryService items;
    private final AlbumService albumService;
    private final AlbumStore albums;
    private final ThingService things;
    private final ThingStore thingStore;
    private final CircleService circles;
    private final MediaService media;
    private final List<DatedThings> dated;

    DocumentService(
            DocumentStore documents,
            LibraryStore library,
            LibraryService items,
            AlbumService albumService,
            AlbumStore albums,
            ThingService things,
            ThingStore thingStore,
            CircleService circles,
            MediaService media,
            List<DatedThings> dated) {
        this.documents = documents;
        this.library = library;
        this.items = items;
        this.albumService = albumService;
        this.albums = albums;
        this.things = things;
        this.thingStore = thingStore;
        this.circles = circles;
        this.media = media;
        this.dated = dated;
    }

    /**
     * The documents of a circle the person may see, the newest first. With nothing chosen, the ones lying
     * loose: what is in a folder is shown in its folder. A kind, a folder or words to look for narrow it.
     */
    public Page<DocumentCard> list(
            UUID circleId,
            UUID me,
            DocumentCategory category,
            UUID folder,
            String words,
            LocalDate today,
            Keyset page) {
        circles.require(circleId, me);
        MemberRow mine = circles.me(circleId, me);
        String typed = words == null || words.isBlank() ? null : words.trim();
        if (folder != null) {
            ThingRow row = things.require(folder, me, ThingKind.ALBUM);
            AlbumRow details = albums.find(folder).orElseThrow(ThingService::notFound);
            if (!row.circleId().equals(circleId) || !details.folder()) {
                throw ThingService.notFound();
            }
        }
        Filter filter = new Filter(
                List.of(ThingKind.DOCUMENT.code()),
                null,
                null,
                List.of(),
                null,
                folder,
                null,
                category,
                typed,
                folder == null && category == null && typed == null,
                false);
        List<Item> found = library.wall(circleId, me, mine.id(), filter, null, page);
        return page.page(found, item -> Keyset.cursor(item.takenLocal(), item.id()))
                .map(shown -> cards(circleId, me, shown, day(today)));
    }

    public FilesSummary summary(UUID circleId, UUID me) {
        circles.require(circleId, me);
        Map<DocumentCategory, Integer> counts = documents.categories(circleId, me);
        return new FilesSummary(
                counts.values().stream().mapToInt(Integer::intValue).sum(),
                counts.entrySet().stream()
                        .map(e -> new CategoryCount(e.getKey(), e.getValue()))
                        .sorted((a, b) -> b.count() != a.count()
                                ? Integer.compare(b.count(), a.count())
                                : a.category().compareTo(b.category()))
                        .toList(),
                albumService.folders(circleId, me));
    }

    public DocumentResponse get(UUID id, UUID me, LocalDate today) {
        Item item = requireDocument(id, me);
        LocalDate now = day(today);
        DocumentCard card =
                cards(item.thing().circleId(), me, List.of(item), now).get(0);
        String text = documents.text(id).orElse("");
        Reading reading = DocumentReader.read(text, now);
        boolean travel = reading.mrz() != null;
        List<ThingBrief> linked = things.linked(id, me);
        return new DocumentResponse(
                card,
                item.fileName(),
                item.contentType(),
                item.pictureKey() != null
                        ? media.urlFor(item.pictureKey())
                        : item.contentType().startsWith("image/") ? media.urlFor(item.fileKey()) : null,
                !text.isBlank(),
                text,
                facts(reading),
                reading.dates().stream()
                        .map(d -> new FoundDay(d.label(), d.date()))
                        .toList(),
                card.keyDate() == null
                        ? null
                        : DocumentReader.remindOn(
                                card.keyDate().label(),
                                card.keyDate().date(),
                                travel && !card.keyDate().byHand(),
                                now),
                linked,
                travel ? clash(reading.mrz(), linked) : null);
    }

    /**
     * Changes a document's name, its kind, or the words read inside it; or sets the day that matters by hand
     * when the reading got it wrong. New words are read again, unless the day was set by hand.
     */
    @Transactional
    public DocumentResponse change(UUID id, UUID me, DocumentChange change, LocalDate today) {
        Item item = requireDocument(id, me);
        if (!item.thing().canEdit()) {
            throw new ApiProblem(HttpStatus.FORBIDDEN, "view_only", "You can look at this, but not change it.");
        }
        DocumentRow row = documents.rows(List.of(id)).get(id);
        String text = change.text() != null ? change.text() : documents.text(id).orElse("");
        LocalDate keyDate = row.keyDate();
        DateLabel keyLabel = row.keyLabel();
        boolean byHand = row.keyByHand();
        Long amount = row.amountCents();
        String currency = row.currency();
        if (Boolean.TRUE.equals(change.removeKeyDate())) {
            byHand = false;
        }
        if (change.keyDate() != null) {
            keyDate = change.keyDate();
            keyLabel = change.keyLabel() != null ? change.keyLabel() : keyLabel != null ? keyLabel : DateLabel.EXPIRES;
            byHand = true;
        } else if (change.keyLabel() != null && keyDate != null) {
            keyLabel = change.keyLabel();
            byHand = true;
        }
        Reading reading = DocumentReader.read(text, day(today));
        if (!byHand) {
            FoundDate key = reading.key(day(today));
            keyDate = key == null ? null : key.date();
            keyLabel = key == null ? null : key.label();
        }
        if (change.text() != null) {
            amount = reading.amount() == null ? null : reading.amount().cents();
            currency = reading.amount() == null ? null : reading.amount().currency();
        }
        documents.update(
                id,
                text,
                change.pages() != null ? change.pages() : row.pages(),
                change.category() != null ? change.category() : row.category(),
                keyDate,
                keyLabel,
                byHand,
                amount,
                currency);
        thingStore.retitle(
                id,
                change.title() == null ? item.thing().title() : change.title().trim());
        return get(id, me, today);
    }

    private Item requireDocument(UUID id, UUID me) {
        things.require(id, me, ThingKind.DOCUMENT);
        return items.requireItem(id, me);
    }

    private static LocalDate day(LocalDate today) {
        return today == null ? LocalDate.now() : today;
    }

    /** Documents as the list shows them. */
    List<DocumentCard> cards(UUID circleId, UUID me, List<Item> shown, LocalDate today) {
        List<UUID> ids = shown.stream().map(Item::id).toList();
        Map<UUID, DocumentRow> details = documents.rows(ids);
        Map<UUID, List<Linked>> links =
                documents.linked(ids, me).stream().collect(Collectors.groupingBy(Linked::documentId));
        Map<UUID, List<UUID>> about = library.about(ids);
        Map<UUID, PersonBrief> people = items.people(circleId);
        Map<UUID, AudienceChip> chips =
                things.chips(shown.stream().map(Item::thing).toList());
        List<DocumentCard> cards = new ArrayList<>();
        for (Item item : shown) {
            DocumentRow row = details.get(item.id());
            if (row == null) {
                continue;
            }
            List<Linked> linked = links.getOrDefault(item.id(), List.of());
            cards.add(new DocumentCard(
                    item.id(),
                    item.thing().circleId(),
                    item.thing().title(),
                    badge(row.category(), item),
                    row.category(),
                    row.pages(),
                    item.storedBytes(),
                    media.urlFor(item.pictureKey(), MediaSize.SMALL),
                    media.urlFor(item.fileKey()),
                    keyDate(row, today),
                    row.amountCents(),
                    row.currency(),
                    linked.stream().anyMatch(l -> REMINDER.equals(l.kind())),
                    linked.stream().anyMatch(l -> l.place() == Place.VAULT),
                    linked.stream()
                            .filter(l -> l.place() == Place.NOTES)
                            .map(Linked::title)
                            .findFirst()
                            .orElse(null),
                    about.getOrDefault(item.id(), List.of()).stream()
                            .map(people::get)
                            .filter(Objects::nonNull)
                            .toList(),
                    people.get(item.addedBy()),
                    item.addedAt(),
                    item.thing().mine(),
                    item.thing().canEdit(),
                    chips.get(item.id())));
        }
        return cards;
    }

    private static KeyDate keyDate(DocumentRow row, LocalDate today) {
        if (row.keyDate() == null) {
            return null;
        }
        long left = ChronoUnit.DAYS.between(today, row.keyDate());
        return new KeyDate(
                row.keyLabel(),
                row.keyDate(),
                left,
                left <= (row.category() == DocumentCategory.ID ? 365 : 60),
                row.keyByHand());
    }

    /** ID for a passport or a card; otherwise what kind of file it is, from its name or its type. */
    static String badge(DocumentCategory category, Item item) {
        if (category == DocumentCategory.ID) {
            return "ID";
        }
        String type = item.contentType() == null ? "" : item.contentType();
        return switch (type) {
            case "application/pdf" -> "PDF";
            case "image/jpeg" -> "JPG";
            case "image/png" -> "PNG";
            case "text/plain" -> "TXT";
            case "text/csv" -> "CSV";
            default ->
                type.contains("wordprocessing")
                        ? "DOC"
                        : type.contains("spreadsheet") ? "XLS" : type.contains("presentation") ? "PPT" : "FILE";
        };
    }

    private static List<Fact> facts(Reading reading) {
        List<Fact> facts = new ArrayList<>();
        Mrz mrz = reading.mrz();
        if (mrz != null) {
            facts.add(new Fact("Number", mrz.number(), null, true));
            facts.add(new Fact("Born", DAY.format(mrz.born()), mrz.born(), false));
            facts.add(new Fact("Expires", DAY.format(mrz.expires()), mrz.expires(), false));
        }
        for (FoundDate found : reading.dates()) {
            if (mrz == null || !found.date().equals(mrz.expires())) {
                facts.add(new Fact(found.label().words(), DAY.format(found.date()), found.date(), false));
            }
        }
        if (reading.amount() != null) {
            facts.add(new Fact(
                    "Total",
                    "%s %d.%02d"
                            .formatted(
                                    reading.amount().currency(),
                                    reading.amount().cents() / 100,
                                    reading.amount().cents() % 100),
                    null,
                    false));
        }
        return facts;
    }

    /** The first linked trip after which the travel document runs out too soon, when some place knows the trip's days. */
    private Clash clash(Mrz mrz, List<ThingBrief> linked) {
        List<UUID> ids = linked.stream().map(ThingBrief::id).toList();
        Map<UUID, Days> days = new HashMap<>();
        if (!ids.isEmpty()) {
            dated.forEach(source -> days.putAll(source.daysOf(ids)));
        }
        for (ThingBrief thing : linked) {
            Days when = days.get(thing.id());
            if (when != null) {
                Integer months = DocumentReader.monthsLeftAfter(when.to(), mrz.expires());
                if (months != null) {
                    return new Clash(thing, when.to(), months);
                }
            }
        }
        return null;
    }
}

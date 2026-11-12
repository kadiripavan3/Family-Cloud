package app.homeport.api.library;

import app.homeport.api.circle.CircleService;
import app.homeport.api.circle.MemberStore.MemberRow;
import app.homeport.api.library.AlbumStore.TabCounts;
import app.homeport.api.library.LibraryService.WallQuery;
import app.homeport.api.library.LibraryStore.Bytes;
import app.homeport.api.library.LibraryStore.Filter;
import app.homeport.api.library.LibraryStore.Item;
import app.homeport.api.library.LibraryStore.MonthCount;
import app.homeport.api.library.LibraryStore.PersonCount;
import app.homeport.api.library.LibraryStore.PlaceRow;
import app.homeport.api.library.LibraryStore.Tile;
import app.homeport.api.media.MediaService;
import app.homeport.api.media.MediaSize;
import app.homeport.api.thing.ThingKind;
import app.homeport.api.thing.ThingService.PersonBrief;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * The other ways of looking at the same wall: by year and month (the strip at the side), by person, by place,
 * and by how much room it all takes.
 */
@Service
public class LensService {

    public record YearCount(int year, int photos, int videos) {}

    public record TileView(
            UUID id,
            ThingKind kind,
            @Schema(nullable = true) String thumbUrl) {}

    public record MonthView(
            @Schema(description = "The month, as 2026-11") String month,
            int photos,
            int videos,

            @Schema(description = "Its newest pictures, for a small grid. Empty for a year that wasn't asked for.")
            List<TileView> tiles) {}

    public record TimelineResponse(
            @Schema(description = "Every year with something in it, the newest first: the strip at the side")
            List<YearCount> years,

            @Schema(nullable = true, description = "The year whose months follow: the one asked for, or the newest")
            Integer year,

            @Schema(description = "The months of that year with something in them, the newest first")
            List<MonthView> months) {}

    public record AlbumCounts(int shared, int onlyYou, int fromJourney) {}

    public record PersonLens(
            UUID memberId,
            String name,
            @Schema(nullable = true) String avatarUrl,

            @Schema(description = "How many photos and videos they are in that you may see")
            int count,

            @Schema(nullable = true) String coverUrl) {}

    /** What the chips above the wall lead to, each with its count. */
    public record LensesResponse(
            int photos,
            int videos,
            int files,
            int places,
            AlbumCounts albums,

            @Schema(description = "The people who are in photos, the one in most first")
            List<PersonLens> people) {}

    public record PlaceView(
            @Schema(description = "The place's name, as the phone looked it up. Ask the wall for it with `place`.")
            String name,

            @Schema(nullable = true) String country,

            @Schema(nullable = true, description = "Where its photos were taken, on average")
            Double lat,

            @Schema(nullable = true) Double lng,
            int count,
            int photos,
            int videos,

            @Schema(description = "On how many different days")
            int visits,

            LocalDate lastDay,
            @Schema(nullable = true) String coverUrl,
            @Schema(description = "Who added them") List<PersonBrief> people) {}

    public record PlacesResponse(
            int places,
            int countries,

            @Schema(description = "The place with most photos first, five hundred at most")
            List<PlaceView> list) {}

    public record PersonBytes(
            @Schema(nullable = true, description = "Null for what was added by people who have left")
            PersonBrief person,

            boolean you,
            long bytes) {}

    public record StorageResponse(
            long usedBytes,

            @Schema(
                    description =
                            "How much the circle may keep. There are no plans yet: this comes from the API's settings and nothing is refused when it is passed.")
            long quotaBytes,

            long photoBytes,
            long videoBytes,
            long documentBytes,

            @Schema(description = "Everything else: the pictures of the circle and its people")
            long otherBytes,

            @Schema(description = "By whoever added it, the one with most first")
            List<PersonBytes> people) {}

    private final LibraryStore store;
    private final LibraryService library;
    private final AlbumStore albums;
    private final CircleService circles;
    private final MediaService media;
    private final long quotaBytes;

    LensService(
            LibraryStore store,
            LibraryService library,
            AlbumStore albums,
            CircleService circles,
            MediaService media,
            @Value("${homeport.library.quota-bytes:214748364800}") long quotaBytes) {
        this.store = store;
        this.library = library;
        this.albums = albums;
        this.circles = circles;
        this.media = media;
        this.quotaBytes = quotaBytes;
    }

    /**
     * The years and months of the wall under one narrowing, with their counts, and for one year the newest
     * pictures of each month.
     *
     * @param year the year to open; null for the newest that has anything
     * @param tiles how many pictures to give for each month of that year
     */
    public TimelineResponse timeline(UUID circleId, UUID me, WallQuery query, Integer year, int tiles) {
        circles.require(circleId, me);
        MemberRow mine = circles.me(circleId, me);
        Filter filter = library.filter(circleId, me, mine, query);
        List<MonthCount> months = store.months(circleId, me, filter);
        Map<Integer, YearCount> years = new LinkedHashMap<>();
        for (MonthCount month : months) {
            years.merge(
                    month.month().getYear(),
                    new YearCount(month.month().getYear(), month.photos(), month.videos()),
                    (a, b) -> new YearCount(a.year(), a.photos() + b.photos(), a.videos() + b.videos()));
        }
        Integer open = year != null
                ? year
                : months.isEmpty() ? null : months.get(0).month().getYear();
        Map<String, List<TileView>> pictures = open == null || tiles == 0
                ? Map.of()
                : store.tiles(circleId, me, filter, open, tiles).stream()
                        .collect(Collectors.groupingBy(
                                tile -> tile.month().toString(),
                                Collectors.mapping(
                                        (Tile tile) -> new TileView(
                                                tile.id(),
                                                tile.kind(),
                                                media.urlFor(tile.pictureKey(), MediaSize.SMALL)),
                                        Collectors.toList())));
        return new TimelineResponse(
                List.copyOf(years.values()),
                open,
                months.stream()
                        .filter(month -> open != null && month.month().getYear() == open)
                        .map(month -> new MonthView(
                                month.month().toString(),
                                month.photos(),
                                month.videos(),
                                pictures.getOrDefault(month.month().toString(), List.of())))
                        .toList());
    }

    public LensesResponse lenses(UUID circleId, UUID me) {
        circles.require(circleId, me);
        MemberRow mine = circles.me(circleId, me);
        Map<ThingKind, Integer> counts = store.counts(circleId, me);
        TabCounts tabs = albums.tabCounts(circleId, me);
        List<PersonCount> in = store.people(circleId, me);
        Map<UUID, PersonBrief> people = library.people(circleId);
        Map<UUID, Item> covers = covers(in.stream().map(PersonCount::coverId).toList(), me, mine);
        return new LensesResponse(
                counts.getOrDefault(ThingKind.PHOTO, 0),
                counts.getOrDefault(ThingKind.VIDEO, 0),
                counts.getOrDefault(ThingKind.DOCUMENT, 0),
                store.places(circleId, me).size(),
                new AlbumCounts(tabs.shared(), tabs.mine(), tabs.journey()),
                in.stream()
                        .filter(person -> people.containsKey(person.memberId()))
                        .map(person -> new PersonLens(
                                person.memberId(),
                                people.get(person.memberId()).name(),
                                people.get(person.memberId()).avatarUrl(),
                                person.count(),
                                cover(covers, person.coverId())))
                        .toList());
    }

    /** The places photos were taken at. A map is the app's to draw; here are the names, the counts and where. */
    public PlacesResponse places(UUID circleId, UUID me) {
        circles.require(circleId, me);
        MemberRow mine = circles.me(circleId, me);
        List<PlaceRow> rows = store.places(circleId, me);
        Map<UUID, PersonBrief> people = library.people(circleId);
        Map<UUID, Item> covers = covers(rows.stream().map(PlaceRow::coverId).toList(), me, mine);
        return new PlacesResponse(
                rows.size(),
                (int) rows.stream()
                        .map(PlaceRow::country)
                        .filter(Objects::nonNull)
                        .map(country -> country.toLowerCase(java.util.Locale.ROOT))
                        .distinct()
                        .count(),
                rows.stream()
                        .map(row -> new PlaceView(
                                row.name(),
                                row.country(),
                                row.lat(),
                                row.lng(),
                                row.photos() + row.videos(),
                                row.photos(),
                                row.videos(),
                                row.visits(),
                                row.lastDay(),
                                cover(covers, row.coverId()),
                                row.people().stream()
                                        .map(people::get)
                                        .filter(Objects::nonNull)
                                        .sorted(Comparator.comparing(PersonBrief::name))
                                        .toList()))
                        .toList());
    }

    private Map<UUID, Item> covers(List<UUID> ids, UUID me, MemberRow mine) {
        return store.items(ids.stream().filter(Objects::nonNull).distinct().toList(), me, mine.id()).stream()
                .collect(Collectors.toMap(Item::id, Function.identity()));
    }

    private String cover(Map<UUID, Item> covers, UUID id) {
        Item item = covers.get(id);
        return item == null ? null : media.urlFor(item.pictureKey(), MediaSize.MEDIUM);
    }

    /**
     * How much a circle keeps and who added it. Everything in the circle's Library counts, also what the
     * person asking can't see: it is how much room is used, and says nothing of what is in it.
     */
    public StorageResponse storage(UUID circleId, UUID me) {
        circles.require(circleId, me);
        UUID mine = circles.me(circleId, me).id();
        List<Bytes> bytes = store.bytes(circleId);
        Map<UUID, PersonBrief> people = library.people(circleId);
        Map<UUID, Long> byPerson = new LinkedHashMap<>();
        long gone = 0;
        for (Bytes part : bytes) {
            if (people.containsKey(part.addedBy())) {
                byPerson.merge(part.addedBy(), part.bytes(), Long::sum);
            } else {
                gone += part.bytes();
            }
        }
        byPerson.putIfAbsent(mine, 0L);
        List<PersonBytes> shares = new ArrayList<>(byPerson.entrySet().stream()
                .sorted(Map.Entry.<UUID, Long>comparingByValue().reversed())
                .map(e -> new PersonBytes(people.get(e.getKey()), e.getKey().equals(mine), e.getValue()))
                .toList());
        if (gone > 0) {
            shares.add(new PersonBytes(null, false, gone));
        }
        long photos = sum(bytes, ThingKind.PHOTO);
        long videos = sum(bytes, ThingKind.VIDEO);
        long files = sum(bytes, ThingKind.DOCUMENT);
        long other = store.otherBytes(circleId);
        return new StorageResponse(photos + videos + files + other, quotaBytes, photos, videos, files, other, shares);
    }

    private static long sum(List<Bytes> bytes, ThingKind kind) {
        return bytes.stream()
                .filter(b -> b.kind() == kind)
                .mapToLong(Bytes::bytes)
                .sum();
    }
}

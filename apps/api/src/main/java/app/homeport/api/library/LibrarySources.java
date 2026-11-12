package app.homeport.api.library;

import app.homeport.api.circle.CircleService;
import app.homeport.api.circle.MemberStore.MemberRow;
import app.homeport.api.home.SearchSource;
import app.homeport.api.home.TodaySource;
import app.homeport.api.library.AlbumService.AlbumResponse;
import app.homeport.api.library.LibraryService.MomentPerson;
import app.homeport.api.library.LibraryService.MomentResponse;
import app.homeport.api.library.LibraryStore.Fresh;
import app.homeport.api.library.LibraryStore.FreshDocument;
import app.homeport.api.library.Moments.Moment;
import app.homeport.api.media.MediaService;
import app.homeport.api.media.MediaSize;
import app.homeport.api.thing.Place;
import app.homeport.api.thing.ThingKind;
import app.homeport.api.thing.ThingService.PersonBrief;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.stereotype.Component;

/**
 * What the Library brings to Home: "New in the library" (a moment others added to, a document someone
 * shared, an album that grew), and a search inside the words of scans and PDFs.
 */
@Component
class LibrarySources implements TodaySource, SearchSource {

    /** What counts as new: added by someone else in the last week. */
    static final int FRESH_DAYS = AlbumService.FRESH_DAYS;

    static final int MAX_MOMENTS = 4;
    static final int MAX_DOCUMENTS = 2;
    static final int MAX_ALBUMS = 2;

    private final LibraryStore store;
    private final LibraryService library;
    private final AlbumService albums;
    private final DocumentStore documents;
    private final CircleService circles;
    private final MediaService media;

    LibrarySources(
            LibraryStore store,
            LibraryService library,
            AlbumService albums,
            DocumentStore documents,
            CircleService circles,
            MediaService media) {
        this.store = store;
        this.library = library;
        this.albums = albums;
        this.documents = documents;
        this.circles = circles;
        this.media = media;
    }

    @Override
    public List<FreshCard> fresh(UUID me, UUID circleId) {
        MemberRow mine = circles.me(circleId, me);
        Map<UUID, PersonBrief> people = library.people(circleId);
        List<FreshCard> cards = new ArrayList<>();

        // Moments others added to: "Saturday at Lake Bled", 19 new, Alex, Mia and you.
        List<Fresh> added = store.fresh(circleId, me, mine.id(), FRESH_DAYS, 400);
        Set<UUID> fresh = added.stream().map(Fresh::id).collect(Collectors.toSet());
        List<LocalDate> days =
                added.stream().map(Fresh::day).distinct().limit(12).toList();
        Map<Moment, Integer> news = new LinkedHashMap<>();
        for (Moment moment : Moments.group(store.shots(circleId, me, days))) {
            int count = (int) moment.shots().stream()
                    .filter(shot -> fresh.contains(shot.id()))
                    .count();
            if (count > 0 && news.size() < MAX_MOMENTS) {
                news.put(moment, count);
            }
        }
        List<MomentResponse> moments =
                library.moments(circleId, me, mine, List.copyOf(news.keySet()), people, List.of());
        int n = 0;
        for (Map.Entry<Moment, Integer> entry : news.entrySet()) {
            MomentResponse moment = moments.get(n++);
            cards.add(new FreshCard(
                    moment.id(),
                    entry.getKey().newest().video() ? ThingKind.VIDEO : ThingKind.PHOTO,
                    moment.title(),
                    names(moment.people()),
                    moment.coverUrl(),
                    entry.getValue() + " new"));
        }

        // Documents someone else added: "Grandma's cookies", Recipe, Alex added a scan.
        for (FreshDocument document : store.freshDocuments(circleId, me, mine.id(), FRESH_DAYS, MAX_DOCUMENTS)) {
            PersonBrief by = people.get(document.addedBy());
            cards.add(new FreshCard(
                    document.id(),
                    ThingKind.DOCUMENT,
                    document.title(),
                    (by == null ? "Someone" : by.name()) + (document.scan() ? " added a scan" : " added a file"),
                    media.urlFor(document.pictureKey(), MediaSize.MEDIUM),
                    document.category() == DocumentCategory.OTHER
                            ? null
                            : document.category().label()));
        }

        // Albums that grew: "Biscuit", 6 new this week.
        for (AlbumResponse album : albums.withNews(circleId, me, MAX_ALBUMS)) {
            cards.add(new FreshCard(
                    album.id(),
                    ThingKind.ALBUM,
                    album.title(),
                    album.fresh() + " new this week",
                    album.coverUrl(),
                    null));
        }
        return cards;
    }

    /** "Alex, Mia and you": everyone who added to a moment, the others first. */
    static String names(List<MomentPerson> people) {
        List<String> names = new ArrayList<>(
                people.stream().filter(p -> !p.you()).map(MomentPerson::name).toList());
        if (people.stream().anyMatch(MomentPerson::you)) {
            names.add(names.isEmpty() ? "You" : "you");
        }
        if (names.size() < 2) {
            return String.join("", names);
        }
        return String.join(", ", names.subList(0, names.size() - 1)) + " and " + names.get(names.size() - 1);
    }

    @Override
    public Place place() {
        return Place.LIBRARY;
    }

    @Override
    public List<Found> find(UUID circleId, UUID me, String words, int limit) {
        return documents.inside(circleId, words, limit).stream()
                .map(found -> new Found(
                        found.thingId(),
                        "Found inside: …"
                                + found.around().replaceAll("\\s+", " ").trim() + "…"))
                .toList();
    }
}

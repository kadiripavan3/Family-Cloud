package app.homeport.api.library;

import app.homeport.api.circle.CircleService;
import app.homeport.api.circle.MemberStore.MemberRow;
import app.homeport.api.common.Keyset;
import app.homeport.api.library.AlbumStore.AlbumRow;
import app.homeport.api.library.LibraryService.WallQuery;
import app.homeport.api.library.LibraryStore.Item;
import app.homeport.api.library.LibraryStore.Known;
import app.homeport.api.library.Moments.Moment;
import app.homeport.api.library.Moments.Shot;
import app.homeport.api.thing.Audience;
import app.homeport.api.thing.ThingKind;
import app.homeport.api.thing.ThingService;
import app.homeport.api.thing.ThingStore;
import app.homeport.api.thing.ThingStore.ThingRow;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * What the Library does for the link with Journey, so that the link never reads the Library's tables itself:
 * it hands over the photos a story can be told from (an album, or a moment and the days around it), finds
 * the originals a journey's pictures can be matched to, and keeps the album a journey comes home into.
 * Everything is read as one person: only what they may see, as everywhere in the Library.
 */
@Service
public class LibraryForJourney {

    /** The most photos and videos one story is told from. */
    public static final int MOST = 500;

    /** How many days either side of a moment may join its story, when they have photos too. */
    static final int DAYS_AROUND = 3;

    /**
     * What a story is told from.
     *
     * @param title what it was made from, in words: the moment's or the album's name
     * @param anchorDay for a moment: its own day; null for an album
     */
    public record Gathered(String title, LocalDate anchorDay, List<Item> items) {}

    private final LibraryStore store;
    private final AlbumStore albums;
    private final LibraryService library;
    private final ThingService things;
    private final ThingStore thingStore;
    private final CircleService circles;

    LibraryForJourney(
            LibraryStore store,
            AlbumStore albums,
            LibraryService library,
            ThingService things,
            ThingStore thingStore,
            CircleService circles) {
        this.store = store;
        this.albums = albums;
        this.library = library;
        this.things = things;
        this.thingStore = thingStore;
        this.circles = circles;
    }

    // ---------- telling ----------

    /** The photos and videos of an album that this person may see, the oldest first. */
    public Gathered ofAlbum(UUID albumId, UUID me) {
        ThingRow album = things.require(albumId, me, ThingKind.ALBUM);
        MemberRow mine = circles.me(album.circleId(), me);
        List<Item> items = store
                .wall(
                        album.circleId(),
                        me,
                        mine.id(),
                        library.filter(
                                album.circleId(),
                                me,
                                mine,
                                new WallQuery(null, false, null, null, null, albumId, null)),
                        null,
                        Keyset.first(MOST))
                .stream()
                .filter(item -> LibraryService.ON_THE_WALL.contains(item.thing().kind()))
                .limit(MOST)
                .sorted(Comparator.comparing(Item::takenLocal).thenComparing(Item::id))
                .toList();
        return new Gathered(album.title(), null, items);
    }

    /**
     * The moment a photo belongs to, and with it the days next to it that have photos too (a weekend is told
     * as one story): each day before and after joins as long as the day between has something, three days
     * either side at most. Only what this person may see; the oldest first.
     */
    public Gathered aroundMoment(UUID itemId, UUID me) {
        Item anchor = library.requireItem(itemId, me);
        UUID circleId = anchor.thing().circleId();
        MemberRow mine = circles.me(circleId, me);
        Moment moment = Moments.of(anchor.id(), library.momentsOf(circleId, me, List.of(anchor)));
        if (moment == null) {
            throw ThingService.notFound();
        }
        List<LocalDate> near = new ArrayList<>();
        for (int n = 1; n <= DAYS_AROUND; n++) {
            near.add(moment.day().minusDays(n));
            near.add(moment.day().plusDays(n));
        }
        Map<LocalDate, List<Shot>> beside =
                store.shots(circleId, me, near).stream().collect(Collectors.groupingBy(s -> Moments.dayOf(s.taken())));
        Set<UUID> ids = moment.shots().stream().map(Shot::id).collect(Collectors.toCollection(HashSet::new));
        for (int direction : new int[] {-1, 1}) {
            for (int n = 1; n <= DAYS_AROUND; n++) {
                List<Shot> thatDay = beside.get(moment.day().plusDays((long) direction * n));
                if (thatDay == null) {
                    break;
                }
                thatDay.forEach(shot -> ids.add(shot.id()));
            }
        }
        List<Item> items = store.items(List.copyOf(ids), me, mine.id()).stream()
                .sorted(Comparator.comparing(Item::takenLocal).thenComparing(Item::id))
                .limit(MOST)
                .toList();
        return new Gathered(moment.title(), moment.day(), items);
    }

    /** These photos and videos, as far as this person may see them. */
    public List<Item> items(UUID circleId, UUID me, List<UUID> ids) {
        return store.items(ids, me, circles.me(circleId, me).id());
    }

    /** Who each of these is about (the members it was tagged with). */
    public Map<UUID, List<UUID>> about(List<UUID> itemIds) {
        return store.about(itemIds);
    }

    /** Which of these are hidden from someone today. */
    public Set<UUID> hiddenFromSomeone(List<UUID> itemIds) {
        return thingStore.hides(itemIds).stream()
                .filter(ThingStore.HideRow::today)
                .map(ThingStore.HideRow::thingId)
                .collect(Collectors.toSet());
    }

    // ---------- keeping ----------

    /** This person's own photos and videos in a circle taken between two moments, the oldest first. Five thousand at most. */
    public List<Item> ownTakenBetween(UUID circleId, UUID me, Instant from, Instant to) {
        return store.ownTakenBetween(circleId, me, circles.me(circleId, me).id(), from, to, 5000);
    }

    /** Which of these fingerprints this person's own files in a circle have, each with the thing it is. */
    public Map<String, UUID> ownByFingerprint(UUID circleId, UUID me, List<String> hashes) {
        List<String> asked =
                hashes.stream().map(h -> h.toLowerCase(Locale.ROOT)).distinct().toList();
        Map<String, UUID> known = new HashMap<>();
        for (Known one : store.known(circleId, circles.me(circleId, me).id(), asked)) {
            known.put(one.hash(), one.thingId());
        }
        return known;
    }

    /**
     * The album a journey's photos come home into. It is made once for a kept journey (the clientId says
     * which), and nothing is put into it by hand: it holds what the journey holds.
     */
    @Transactional
    public UUID albumFor(UUID me, UUID circleId, String title, String note, Audience audience, UUID clientId) {
        UUID id = things.create(me, circleId, ThingKind.ALBUM, title, audience, clientId);
        if (thingStore.isNew(id, "albums")) {
            albums.insert(id, note == null ? "" : note, AlbumOrigin.JOURNEY, null, false);
        }
        return id;
    }

    /** Puts what came home into a journey's album, and shows one of them on its card. Only for an album of a journey. */
    @Transactional
    public void bringHome(UUID albumId, UUID me, List<UUID> itemIds, UUID coverItemId) {
        ThingRow album = things.requireEdit(albumId, me, ThingKind.ALBUM);
        AlbumRow details = albums.find(albumId).orElseThrow(ThingService::notFound);
        if (details.origin() != AlbumOrigin.JOURNEY) {
            throw ThingService.notFound();
        }
        albums.add(
                albumId,
                album.circleId(),
                itemIds.stream().distinct().toList(),
                circles.me(album.circleId(), me).id(),
                me);
        if (details.coverItemId() == null && coverItemId != null) {
            albums.update(albumId, details.note(), coverItemId);
        }
        thingStore.touch(albumId);
    }
}

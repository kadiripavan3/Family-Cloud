package app.homeport.api.library;

import app.homeport.api.activity.LineLooks;
import app.homeport.api.activity.PhotoBatches;
import app.homeport.api.common.ApiProblem;
import app.homeport.api.library.LibraryStore.Item;
import app.homeport.api.media.MediaService;
import app.homeport.api.media.MediaSize;
import app.homeport.api.thing.ThingKind;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.stereotype.Component;

/**
 * What the Library shows of its things in a line of Activity: a photo, a video or a scan its small picture,
 * an album its cover, and a batch of photos the moment they belong to ("Saturday at Lake Bled").
 */
@Component
class LibraryLooks implements LineLooks, PhotoBatches {

    private final LibraryStore store;
    private final LibraryService library;
    private final AlbumService albums;
    private final MediaService media;

    LibraryLooks(LibraryStore store, LibraryService library, AlbumService albums, MediaService media) {
        this.store = store;
        this.library = library;
        this.albums = albums;
        this.media = media;
    }

    @Override
    public Set<ThingKind> kinds() {
        return Set.of(ThingKind.PHOTO, ThingKind.VIDEO, ThingKind.DOCUMENT, ThingKind.ALBUM);
    }

    @Override
    public Map<UUID, Look> looks(List<UUID> thingIds, UUID me) {
        Map<UUID, Look> looks = new HashMap<>();
        for (Item item : store.items(thingIds, me, me)) {
            if (item.pictureKey() != null) {
                looks.put(item.id(), new Look(null, media.urlFor(item.pictureKey(), MediaSize.SMALL)));
            }
        }
        Set<UUID> items = store.items(thingIds, me, me).stream().map(Item::id).collect(Collectors.toSet());
        for (UUID id : thingIds) {
            if (items.contains(id)) {
                continue;
            }
            try {
                String cover = albums.get(id, me).coverUrl();
                if (cover != null) {
                    looks.put(id, new Look(null, cover));
                }
            } catch (ApiProblem notAnAlbum) {
                // nothing to draw it with
            }
        }
        return looks;
    }

    /** One moment's photos are called what the moment is called; photos of several days have no one name. */
    @Override
    public Named name(UUID circleId, UUID me, List<UUID> photoIds) {
        List<Item> items = store.items(photoIds, me, me);
        if (items.isEmpty()) {
            return null;
        }
        Item newest = items.stream().max(Comparator.comparing(Item::takenAt)).orElseThrow();
        String picture = newest.pictureKey() == null ? null : media.urlFor(newest.pictureKey(), MediaSize.SMALL);
        if (items.stream().map(Item::day).distinct().count() > 1) {
            return new Named(null, picture);
        }
        var moment = library.moment(newest.id(), me);
        return new Named(moment.title(), moment.coverUrl() != null ? moment.coverUrl() : picture);
    }
}

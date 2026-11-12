package app.homeport.api.library;

import app.homeport.api.guest.GuestView;
import app.homeport.api.guest.GuestView.Card;
import app.homeport.api.library.AlbumStore.AlbumRow;
import app.homeport.api.library.DocumentStore.DocumentRow;
import app.homeport.api.library.LibraryStore.Item;
import app.homeport.api.media.MediaService;
import app.homeport.api.media.MediaSize;
import app.homeport.api.thing.GlanceSource;
import app.homeport.api.thing.ThingKind;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.function.BiFunction;
import java.util.function.Function;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * How the Library's four kinds show up where things of mixed kinds are listed, and what a guest on a pass is
 * shown of them. One small bean for each kind, because each of those is asked for by kind.
 */
@Configuration
class LibraryPlugs {

    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("EEE d MMM yyyy", Locale.ENGLISH);
    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("d MMM yyyy", Locale.ENGLISH);

    /** Most pictures of an album a guest's page shows. */
    static final int GUEST_PICTURES = 24;

    record Glance(ThingKind kind, BiFunction<List<UUID>, UUID, Map<UUID, String>> lines) implements GlanceSource {
        @Override
        public Map<UUID, String> glances(List<UUID> thingIds, UUID me) {
            return lines.apply(thingIds, me);
        }
    }

    record Shown(ThingKind kind, Function<UUID, Card> card) implements GuestView {
        @Override
        public Card show(UUID thingId) {
            return card.apply(thingId);
        }
    }

    // ---------- a few words on where it stands ----------

    @Bean
    GlanceSource photoGlance(LibraryStore store) {
        return new Glance(ThingKind.PHOTO, (ids, me) -> taken(store, ids, me));
    }

    @Bean
    GlanceSource videoGlance(LibraryStore store) {
        return new Glance(ThingKind.VIDEO, (ids, me) -> taken(store, ids, me));
    }

    /** "Expires 2 Aug 2027", or "PDF · 4 pages" for a document with no day that matters. */
    @Bean
    GlanceSource documentGlance(DocumentStore documents, LibraryStore store) {
        return new Glance(ThingKind.DOCUMENT, (ids, me) -> {
            Map<UUID, String> lines = new HashMap<>();
            Map<UUID, DocumentRow> details = documents.rows(ids);
            for (Item item : store.items(ids, me, me)) {
                DocumentRow row = details.get(item.id());
                if (row == null) {
                    continue;
                }
                String badge = DocumentService.badge(row.category(), item);
                lines.put(
                        item.id(),
                        row.keyDate() != null
                                ? row.keyLabel().words() + " " + DATE.format(row.keyDate())
                                : row.pages() != null
                                        ? badge + " · " + row.pages() + (row.pages() == 1 ? " page" : " pages")
                                        : badge);
            }
            return lines;
        });
    }

    /** "544 photos", "14 files": how much an album holds for whoever is looking. */
    @Bean
    GlanceSource albumGlance(AlbumStore albums) {
        return new Glance(ThingKind.ALBUM, (ids, me) -> {
            Map<UUID, Integer> counts = new HashMap<>();
            albums.shares(ids, me, me, AlbumService.FRESH_DAYS)
                    .forEach(share -> counts.merge(share.albumId(), share.count(), Integer::sum));
            Map<UUID, String> lines = new HashMap<>();
            for (UUID id : ids) {
                int count = counts.getOrDefault(id, 0);
                boolean folder = albums.find(id).map(AlbumRow::folder).orElse(false);
                lines.put(id, count + (folder ? " file" : " photo") + (count == 1 ? "" : "s"));
            }
            return lines;
        });
    }

    /** "Sat 7 Nov 2026 · Lake Bled", and for a video its length first: "0:42 · Sat 7 Nov 2026 · Lake Bled". */
    private static Map<UUID, String> taken(LibraryStore store, List<UUID> ids, UUID me) {
        Map<UUID, String> lines = new HashMap<>();
        for (Item item : store.items(ids, me, me)) {
            String line = DAY.format(item.takenLocal());
            if (item.thing().kind() == ThingKind.VIDEO && item.durationS() != null) {
                line = "%d:%02d · %s".formatted(item.durationS() / 60, item.durationS() % 60, line);
            }
            lines.put(item.id(), item.placeName() == null ? line : line + " · " + item.placeName());
        }
        return lines;
    }

    // ---------- what a guest is shown ----------

    /** A guest sees the photo itself. */
    @Bean
    GuestView photoForGuest(LibraryStore store, MediaService media) {
        return new Shown(ThingKind.PHOTO, id -> new Card("Photo", null, pictures(store, media, List.of(id))));
    }

    /** A guest reads a document's name and what kind of file it is; never the file, nor the words inside it. */
    @Bean
    GuestView documentForGuest(DocumentStore documents) {
        return new Shown(ThingKind.DOCUMENT, id -> {
            var row = documents.rows(List.of(id)).get(id);
            return new Card(
                    "Document",
                    row == null || row.pages() == null ? null : row.pages() + (row.pages() == 1 ? " page" : " pages"));
        });
    }

    /**
     * A guest sees the pictures of an album that everyone in the circle may see. What is shared with only
     * some of the circle, or hidden from someone, is not for a guest either, whoever made the pass.
     */
    @Bean
    GuestView albumForGuest(AlbumStore albums, LibraryStore store, MediaService media) {
        return new Shown(ThingKind.ALBUM, id -> {
            List<String> pictures = pictures(store, media, albums.forEveryone(id, GUEST_PICTURES));
            return new Card("Album", pictures.size() + (pictures.size() == 1 ? " photo" : " photos"), pictures);
        });
    }

    private static List<String> pictures(LibraryStore store, MediaService media, List<UUID> ids) {
        Map<UUID, String> keys = store.pictureKeys(ids);
        return ids.stream()
                .map(keys::get)
                .filter(Objects::nonNull)
                .map(key -> media.urlFor(key, MediaSize.MEDIUM))
                .toList();
    }
}

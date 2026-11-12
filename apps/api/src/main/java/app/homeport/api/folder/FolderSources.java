package app.homeport.api.folder;

import app.homeport.api.folder.FolderStore.Counts;
import app.homeport.api.thing.GlanceSource;
import app.homeport.api.thing.ThingKind;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.stereotype.Component;

/** What a folder says about itself in a search result or a link: "6 folders · 48 pages", counted for the viewer. */
@Component
class FolderSources implements GlanceSource {

    private final FolderStore folders;

    FolderSources(FolderStore folders) {
        this.folders = folders;
    }

    @Override
    public ThingKind kind() {
        return ThingKind.FOLDER;
    }

    @Override
    public Map<UUID, String> glances(List<UUID> thingIds, UUID me) {
        Map<UUID, Counts> counts = folders.counts(thingIds, me);
        return thingIds.stream()
                .distinct()
                .collect(Collectors.toMap(id -> id, id -> words(counts.getOrDefault(id, new Counts(0, 0)))));
    }

    /** "6 folders · 48 pages", "1 page", "Empty". */
    static String words(Counts inside) {
        if (inside.folders() == 0 && inside.pages() == 0) {
            return "Empty";
        }
        String pages = inside.pages() == 1 ? "1 page" : inside.pages() + " pages";
        if (inside.folders() == 0) {
            return pages;
        }
        return (inside.folders() == 1 ? "1 folder" : inside.folders() + " folders") + " · " + pages;
    }
}

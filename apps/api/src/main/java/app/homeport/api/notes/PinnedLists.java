package app.homeport.api.notes;

import app.homeport.api.circle.CircleKind;
import app.homeport.api.circle.CircleService;
import app.homeport.api.home.TodaySource;
import app.homeport.api.notes.NotesStore.Extra;
import app.homeport.api.thing.ThingKind;
import app.homeport.api.thing.ThingService;
import app.homeport.api.thing.ThingService.ThingBrief;
import app.homeport.api.thing.ThingStore.ThingRow;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * A couple's Today shows the lists the two of them keep going: a checklist one of them pinned comes up as a
 * card that says how far it is ("Someday · 14 of 60 done"). Three at most, in the order they were pinned.
 *
 * <p>Only between two: a family's, a flat's and a crew's Today are drawn without these, and stay as they are.
 */
@Component
class PinnedLists implements TodaySource {

    private static final int MOST = 3;

    private final NotesStore store;
    private final ThingService things;
    private final CircleService circles;

    PinnedLists(NotesStore store, ThingService things, CircleService circles) {
        this.store = store;
        this.things = things;
        this.circles = circles;
    }

    @Override
    public List<TodayCard> cards(UUID me, UUID circleId, LocalDate day) {
        if (circles.require(circleId, me).kind() != CircleKind.COUPLE) {
            return List.of();
        }
        List<ThingRow> lists = store.pinned(circleId, me, NotesService.MAX_PINNED).stream()
                .filter(row -> row.kind() == ThingKind.CHECKLIST)
                .limit(MOST)
                .toList();
        Map<UUID, Extra> extras = store.extras(lists.stream().map(ThingRow::id).toList());
        List<TodayCard> cards = new ArrayList<>();
        for (ThingBrief list : things.briefs(lists, me)) {
            Extra extra = extras.get(list.id());
            cards.add(new TodayCard(
                    list.id(),
                    ThingKind.CHECKLIST,
                    ThingKind.CHECKLIST.code(),
                    extra == null || extra.emoji() == null || extra.emoji().isBlank() ? "✅" : extra.emoji(),
                    list.title(),
                    list.glance() == null ? "" : list.glance(),
                    null,
                    null,
                    null,
                    40 + cards.size()));
        }
        return cards;
    }
}

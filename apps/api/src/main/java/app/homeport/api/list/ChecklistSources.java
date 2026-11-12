package app.homeport.api.list;

import app.homeport.api.common.Sql;
import app.homeport.api.guest.GuestView;
import app.homeport.api.home.SearchSource;
import app.homeport.api.thing.GlanceSource;
import app.homeport.api.thing.Place;
import app.homeport.api.thing.ThingKind;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/**
 * What checklists bring to the rest: a search inside their lines, how a guest reads one, and "4 of 9 done".
 * A line that is kept from someone is left out of the search and of what a guest reads, and out of the
 * count of whoever it is kept from.
 */
@Component
class ChecklistSources implements SearchSource, GuestView, GlanceSource {

    private final JdbcClient jdbc;
    private final ChecklistStore lists;

    ChecklistSources(JdbcClient jdbc, ChecklistStore lists) {
        this.jdbc = jdbc;
        this.lists = lists;
    }

    @Override
    public Place place() {
        return Place.NOTES;
    }

    @Override
    public List<Found> find(UUID circleId, UUID me, String words, int limit) {
        return jdbc.sql("""
            select distinct on (i.thing_id) i.thing_id, i.text from checklist_items i join things t on t.id = i.thing_id
            where t.circle_id = :circle and i.text ilike :pattern and\s""" + ChecklistStore.shownTo("i", ":me") + """
             order by i.thing_id, i.position limit :limit
            """)
                .param("circle", circleId)
                .param("me", me)
                .param("pattern", Sql.anywhere(words))
                .param("limit", limit)
                .query((rs, n) -> new Found(rs.getObject("thing_id", UUID.class), rs.getString("text")))
                .list();
    }

    @Override
    public ThingKind kind() {
        return ThingKind.CHECKLIST;
    }

    @Override
    public Card show(UUID thingId) {
        return new Card(
                "List",
                lists.itemsForAll(thingId).stream()
                        .map(i -> (i.doneAt() == null ? "☐ " : "☑ ") + i.text())
                        .collect(Collectors.joining("\n")));
    }

    @Override
    public java.util.Map<UUID, String> glances(List<UUID> thingIds, UUID me) {
        return lists.tallies(thingIds, me).entrySet().stream()
                .collect(Collectors.toMap(
                        java.util.Map.Entry::getKey,
                        e -> e.getValue().done() + " of "
                                + (e.getValue().done() + e.getValue().left()) + " done"));
    }
}

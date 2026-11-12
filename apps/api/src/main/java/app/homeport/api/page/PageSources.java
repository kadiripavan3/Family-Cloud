package app.homeport.api.page;

import app.homeport.api.common.Rules;
import app.homeport.api.common.Sql;
import app.homeport.api.home.SearchSource;
import app.homeport.api.home.TodaySource;
import app.homeport.api.thing.Place;
import app.homeport.api.thing.ThingKind;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/** What pages bring to Home: the ones someone else shared with you lately, and a search inside their words. */
@Component
class PageSources implements TodaySource, SearchSource {

    private final JdbcClient jdbc;

    PageSources(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public List<FreshCard> fresh(UUID me, UUID circleId) {
        return jdbc.sql("""
            select t.id, t.title, o.name from things t join members o on o.id = t.owner_id
            where t.circle_id = :circle and t.kind = 'page' and t.updated_at > now() - interval '7 days'
              and (o.user_id is null or o.user_id <> :me) and\s""" + Rules.sees("t", ":me") + """
             order by t.updated_at desc, t.id desc limit 6
            """)
                .param("circle", circleId)
                .param("me", me)
                .query((rs, n) -> new FreshCard(
                        rs.getObject("id", UUID.class),
                        ThingKind.PAGE,
                        rs.getString("title"),
                        app.homeport.api.common.Names.first(rs.getString("name")) + " shared a page",
                        null,
                        null))
                .list();
    }

    @Override
    public Place place() {
        return Place.NOTES;
    }

    @Override
    public List<Found> find(UUID circleId, String words, int limit) {
        return jdbc.sql("""
            select p.thing_id, substring(p.body from greatest(position(lower(:plain) in lower(p.body)) - 30, 1) for 90) as around
            from pages p join things t on t.id = p.thing_id
            where t.circle_id = :circle and p.body ilike :pattern order by t.updated_at desc limit :limit
            """)
                .param("circle", circleId)
                .param("pattern", Sql.anywhere(words))
                .param("plain", words)
                .param("limit", limit)
                .query((rs, n) -> new Found(
                        rs.getObject("thing_id", UUID.class),
                        "…" + rs.getString("around").replace('\n', ' ').trim() + "…"))
                .list();
    }
}

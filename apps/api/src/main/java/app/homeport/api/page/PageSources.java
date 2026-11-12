package app.homeport.api.page;

import app.homeport.api.common.Names;
import app.homeport.api.common.Rules;
import app.homeport.api.common.Sql;
import app.homeport.api.home.SearchSource;
import app.homeport.api.home.TodaySource;
import app.homeport.api.media.MediaService;
import app.homeport.api.media.MediaSize;
import app.homeport.api.thing.GlanceSource;
import app.homeport.api.thing.Place;
import app.homeport.api.thing.ThingKind;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/**
 * What pages bring to the rest: the ones someone else shared with you lately (with the first photo on the
 * page, when it has one), a search inside their words, and how a page starts, for wherever it is listed
 * among other things.
 */
@Component
class PageSources implements TodaySource, SearchSource, GlanceSource {

    static final int GLANCE = 80;

    private final JdbcClient jdbc;
    private final MediaService media;

    PageSources(JdbcClient jdbc, MediaService media) {
        this.jdbc = jdbc;
        this.media = media;
    }

    @Override
    public List<FreshCard> fresh(UUID me, UUID circleId) {
        return jdbc.sql("""
            select t.id, t.title, o.name,
              (select m.storage_key from page_blocks b join media m on m.id = b.media_id and m.status = 'ready'
               where b.page_id = t.id and b.kind = 'photo' order by b.position, b.id limit 1) as photo_key
            from things t join members o on o.id = t.owner_id
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
                        Names.first(rs.getString("name")) + " shared a page",
                        media.urlFor(rs.getString("photo_key"), MediaSize.MEDIUM),
                        null))
                .list();
    }

    @Override
    public ThingKind kind() {
        return ThingKind.PAGE;
    }

    /** A page's first line. A page with no words has nothing to say. */
    @Override
    public Map<UUID, String> glances(List<UUID> thingIds, UUID me) {
        record Start(UUID id, String line) {}
        return jdbc
                .sql("""
            select thing_id, left(split_part(ltrim(body, E' \\n•'), E'\\n', 1), :longest) as line
            from pages where thing_id in (:ids) and btrim(body, E' \\n') <> ''
            """)
                .param("ids", thingIds)
                .param("longest", GLANCE + 1)
                .query((rs, n) -> new Start(rs.getObject("thing_id", UUID.class), rs.getString("line")))
                .list()
                .stream()
                .collect(Collectors.toMap(Start::id, start -> shortened(start.line())));
    }

    /** At most eighty characters, cut at a space where there is one, with "…" when something was left out. */
    static String shortened(String line) {
        String text = line.trim();
        if (text.length() <= GLANCE) {
            return text;
        }
        int space = text.lastIndexOf(' ', GLANCE);
        return text.substring(0, space > GLANCE / 2 ? space : GLANCE).trim() + "…";
    }

    @Override
    public Place place() {
        return Place.NOTES;
    }

    @Override
    public List<Found> find(UUID me, UUID circleId, String words, int limit) {
        return jdbc.sql("""
            select p.thing_id, substring(p.body from greatest(position(lower(:plain) in lower(p.body)) - 30, 1) for 90) as around
            from pages p join things t on t.id = p.thing_id
            where t.circle_id = :circle and p.body ilike :pattern and\s""" + Rules.sees("t", ":me") + """
             order by t.updated_at desc limit :limit
            """)
                .param("circle", circleId)
                .param("me", me)
                .param("pattern", Sql.anywhere(words))
                .param("plain", words)
                .param("limit", limit)
                .query((rs, n) -> new Found(
                        rs.getObject("thing_id", UUID.class),
                        "…" + rs.getString("around").replace('\n', ' ').trim() + "…"))
                .list();
    }
}

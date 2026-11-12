package app.homeport.api.plan;

import app.homeport.api.common.Rules;
import app.homeport.api.common.Sql;
import app.homeport.api.home.SearchSource;
import app.homeport.api.home.TodaySource;
import app.homeport.api.thing.Place;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/**
 * What Plan brings to Home: today's events and reminders, and a search inside what titles don't say (where
 * an event is, the notes of an event, a reminder or a goal, the place a reminder waits for).
 */
@Component
class PlanSources implements TodaySource, SearchSource {

    private final PlanService plan;
    private final JdbcClient jdbc;

    PlanSources(PlanService plan, JdbcClient jdbc) {
        this.plan = plan;
        this.jdbc = jdbc;
    }

    @Override
    public List<TodayItem> today(UUID me, UUID circleId, LocalDate day) {
        return plan.today(circleId, me, day);
    }

    @Override
    public Place place() {
        return Place.PLAN;
    }

    @Override
    public List<Found> find(UUID me, UUID circleId, String words, int limit) {
        String sees = Rules.sees("t", ":me");
        return jdbc.sql("""
            select found.id, found.snippet from (
              select t.id, t.updated_at, case when e.place_words ilike :pattern then e.place_words else left(e.notes, 90) end as snippet
              from things t join events e on e.thing_id = t.id
              where t.circle_id = :circle and (e.place_words ilike :pattern or e.notes ilike :pattern) and\s""" + sees + """
              union all
              select t.id, t.updated_at, case when r.place_words ilike :pattern then r.place_words else left(r.notes, 90) end
              from things t join reminders r on r.thing_id = t.id
              where t.circle_id = :circle and (r.place_words ilike :pattern or r.notes ilike :pattern) and\s""" + sees + """
              union all
              select t.id, t.updated_at, g.blurb
              from things t join goals g on g.thing_id = t.id
              where t.circle_id = :circle and g.blurb ilike :pattern and\s""" + sees + """
              ) found
            order by found.updated_at desc limit :limit
            """)
                .param("circle", circleId)
                .param("me", me)
                .param("pattern", Sql.anywhere(words))
                .param("limit", limit)
                .query((rs, n) -> new Found(
                        rs.getObject("id", UUID.class),
                        rs.getString("snippet").replace('\n', ' ').trim()))
                .list();
    }
}

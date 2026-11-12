package app.homeport.api.plan;

import app.homeport.api.common.Names;
import app.homeport.api.common.Rules;
import app.homeport.api.digest.DigestSource;
import app.homeport.api.plan.PlanPeople.Person;
import app.homeport.api.plan.PlanService.Line;
import app.homeport.api.thing.ThingKind;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/**
 * Plan's part of the Sunday summary: how many events the week had, what was saved toward goals, and next
 * week's first events in one row ("Dentist for Mia, haircut for Leo · Wed 15:30 · Sat 10:00"). All of it only
 * from what this person may see: a party that is hidden from Mia is not in Mia's week.
 */
@Component
class PlanDigest implements DigestSource {

    private static final DateTimeFormatter SHORT_DAY = DateTimeFormatter.ofPattern("EEE", Locale.ENGLISH);

    private final PlanService plan;
    private final PlanPeople people;
    private final JdbcClient jdbc;

    PlanDigest(PlanService plan, PlanPeople people, JdbcClient jdbc) {
        this.plan = plan;
        this.people = people;
        this.jdbc = jdbc;
    }

    @Override
    public Part week(UUID me, UUID circleId, LocalDate from, LocalDate to) {
        List<Stat> stats = new ArrayList<>();
        // Each event once: swimming every Thursday is one event of the week, and so is a school run on five days.
        long events = plan.lines(circleId, me, from, to).stream()
                .filter(line -> line.kind() == ThingKind.EVENT && line.thing() != null)
                .map(Line::thingId)
                .distinct()
                .count();
        if (events > 0) {
            stats.add(new Stat(String.valueOf(events), events == 1 ? "event" : "events", 20));
        }
        saved(me, circleId, from, to).forEach(stats::add);

        // Next week's first two events, said in one row. What happens once comes before what comes round
        // every week: the dentist is news, the school run is not.
        List<Line> next = plan.lines(circleId, me, to.plusDays(1), to.plusDays(7)).stream()
                .filter(line -> line.kind() == ThingKind.EVENT && line.thing() != null)
                .toList();
        List<Line> once =
                next.stream().filter(line -> line.icon() != NoteIcon.REPEAT).toList();
        List<Line> coming = new ArrayList<>();
        for (Line line : once.isEmpty() ? next : once) {
            if (coming.size() < 2
                    && coming.stream().noneMatch(told -> told.thingId().equals(line.thingId()))) {
                coming.add(line);
            }
        }
        if (coming.isEmpty()) {
            return Part.of(stats, null, List.of());
        }
        Set<String> names = people.in(circleId).values().stream()
                .map(Person::name)
                .map(Names::first)
                .collect(Collectors.toSet());
        List<String> titles = new ArrayList<>();
        for (Line line : coming) {
            String said = forWhom(line.title(), names);
            titles.add(titles.isEmpty() ? said : said.substring(0, 1).toLowerCase(Locale.ROOT) + said.substring(1));
        }
        return Part.of(
                stats,
                null,
                List.of(new Row(
                        coming.get(0).thingId(),
                        ThingKind.EVENT,
                        "📅",
                        null,
                        String.join(", ", titles),
                        coming.stream()
                                .map(line -> SHORT_DAY.format(line.day())
                                        + (line.lead() == null || line.lead().equals("All day")
                                                ? ""
                                                : " " + line.lead()))
                                .collect(Collectors.joining(" · ")),
                        coming.get(0).day())));
    }

    /** "Dentist · Mia" is said "Dentist for Mia" when what follows the dot is someone of the circle. */
    static String forWhom(String title, Set<String> names) {
        int dot = title.lastIndexOf(" · ");
        if (dot > 0 && names.contains(title.substring(dot + 3).trim())) {
            return title.substring(0, dot) + " for " + title.substring(dot + 3).trim();
        }
        return title;
    }

    /** What was put toward money goals this week, in each currency: "€350 saved". */
    private List<Stat> saved(UUID me, UUID circleId, LocalDate from, LocalDate to) {
        return jdbc.sql("""
            select g.currency, sum(e.amount) as total
            from goal_entries e join goals g on g.thing_id = e.thing_id join things t on t.id = g.thing_id
            where t.circle_id = :circle and g.unit = 'money' and e.on_day between :from and :to and\s"""
                        + Rules.sees("t", ":me") + " group by g.currency having sum(e.amount) > 0 order by total desc")
                .param("circle", circleId)
                .param("me", me)
                .param("from", from)
                .param("to", to)
                .query((rs, n) -> new Stat(Amounts.money(rs.getLong("total"), rs.getString("currency")), "saved", 40))
                .list();
    }
}

package app.homeport.api.digest;

import app.homeport.api.journey.AtHomeService;
import app.homeport.api.journey.AtHomeService.WeekFromJourney;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * "From Journey" on the Sunday summary: what came through the link with Journey in the week, as this person
 * may see it. The journeys that were kept, the ones they told from here, and how many goodnights arrived. It
 * is read from this app's own tables ({@link AtHomeService#week}), so the job that makes the summary on
 * Sunday evening can ask without anyone being signed in. A week with none of these has no such section.
 *
 * <p>Who is away right now ("Alex · Lofoten by bike · Day 6 of 9") is not in it: that is Journey's to say, to
 * a signed-in person, and a summary that is made by a job has nobody to ask as.
 */
@Component
class JourneyDigest implements DigestSource {

    private final AtHomeService journey;

    JourneyDigest(AtHomeService journey) {
        this.journey = journey;
    }

    @Override
    public Part week(UUID me, UUID circleId, LocalDate from, LocalDate to) {
        WeekFromJourney week = journey.week(
                circleId,
                me,
                from.atStartOfDay().toInstant(ZoneOffset.UTC),
                to.plusDays(1).atStartOfDay().toInstant(ZoneOffset.UTC));
        if (week.empty()) {
            return Part.nothing();
        }
        return new Part(List.of(), null, List.of(), List.of(new Section("From Journey", rows(week))));
    }

    /** One row for each journey kept, one for each told, and one for the goodnights together. */
    static List<Row> rows(WeekFromJourney week) {
        List<Row> rows = new ArrayList<>();
        for (String title : week.kept()) {
            rows.add(new Row(null, null, "🧭", null, title, "Kept from Journey", null));
        }
        for (String title : week.told()) {
            rows.add(new Row(null, null, "✈️", null, title, "You told it in Journey", null));
        }
        if (week.goodnights() > 0) {
            rows.add(new Row(
                    null,
                    null,
                    "🌙",
                    null,
                    week.goodnights() == 1 ? "1 goodnight" : week.goodnights() + " goodnights",
                    "Recorded for home this week",
                    null));
        }
        return rows;
    }
}

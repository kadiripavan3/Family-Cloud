package app.homeport.api.digest;

import app.homeport.api.circle.CircleService;
import app.homeport.api.circle.CircleStore.CircleRow;
import app.homeport.api.digest.DigestSource.Hero;
import app.homeport.api.digest.DigestSource.Part;
import app.homeport.api.digest.DigestSource.Row;
import app.homeport.api.digest.DigestSource.Section;
import app.homeport.api.digest.DigestSource.Stat;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;

/**
 * The Sunday summary: one page per person per circle per week. The best photo, what got done, what next week
 * holds. Every part comes from a place ({@link DigestSource}) and holds only what this person may see, so
 * two people in one circle can get different summaries of the same week.
 */
@Service
public class DigestService {

    static final int MAX_NEXT = 6;
    private static final DateTimeFormatter DAY_AND_MONTH = DateTimeFormatter.ofPattern("d MMM", Locale.ENGLISH);

    public record SummaryResponse(
            UUID circleId,
            String circleName,

            @Schema(description = "The Monday the week starts on")
            LocalDate from,

            @Schema(description = "The Sunday it ends on") LocalDate to,

            @Schema(description = "The week in words: 2 to 8 Nov")
            String range,

            @Schema(nullable = true, description = "The week's most loved photo, when there was one you may see")
            Hero hero,

            @Schema(
                    description =
                            "The numbers across it: photos, events, bills paid, saved. Only the ones above nothing.")
            List<Stat> stats,

            @Schema(description = "Next week's first things, in the order they come")
            List<Row> nextWeek,

            @Schema(
                    description =
                            "Sections from elsewhere, each with its own title: From Journey. Empty until the link exists.")
            List<Section> sections,

            @Schema(description = "False for a week with nothing in it: nothing is sent for such a week")
            boolean anything,

            @Schema(
                    description =
                            "The week in one line, as the push says it: 86 photos · 5 events · 3 bills paid · €350 saved")
            String inShort) {}

    private final CircleService circles;
    private final List<DigestSource> sources;

    DigestService(CircleService circles, List<DigestSource> sources) {
        this.circles = circles;
        this.sources = sources;
    }

    /**
     * One person's week in one circle.
     *
     * @param day any day of the week that is wanted; this week when left out
     */
    public SummaryResponse week(UUID circleId, UUID me, LocalDate day) {
        CircleRow circle = circles.require(circleId, me);
        LocalDate from = (day == null ? LocalDate.now() : day).with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
        LocalDate to = from.plusDays(6);
        List<Stat> stats = new ArrayList<>();
        List<Row> next = new ArrayList<>();
        List<Section> sections = new ArrayList<>();
        Hero hero = null;
        for (DigestSource source : sources) {
            Part part = source.week(me, circleId, from, to);
            stats.addAll(part.stats());
            next.addAll(part.nextWeek());
            sections.addAll(part.sections());
            hero = hero != null ? hero : part.hero();
        }
        stats.sort(Comparator.comparingInt(Stat::order));
        next.sort(Comparator.comparing(Row::day, Comparator.nullsLast(Comparator.naturalOrder())));
        return new SummaryResponse(
                circle.id(),
                circle.name(),
                from,
                to,
                range(from, to),
                hero,
                stats,
                next.stream().limit(MAX_NEXT).toList(),
                sections,
                hero != null || !stats.isEmpty() || !sections.isEmpty(),
                stats.stream().map(stat -> stat.figure() + " " + stat.label()).collect(Collectors.joining(" · ")));
    }

    /** "2 to 8 Nov", or "30 Nov to 6 Dec" when the week runs over the end of a month. */
    static String range(LocalDate from, LocalDate to) {
        return (from.getMonth() == to.getMonth() ? String.valueOf(from.getDayOfMonth()) : DAY_AND_MONTH.format(from))
                + " to " + DAY_AND_MONTH.format(to);
    }
}

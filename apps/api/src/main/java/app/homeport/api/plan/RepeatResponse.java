package app.homeport.api.plan;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.LocalDate;
import java.util.List;

/** How something repeats, as the app shows it: the rule and the few words that say it. */
public record RepeatResponse(
        Recurrence.Unit unit,
        int every,
        List<Weekday> days,
        @Schema(nullable = true) LocalDate until,

        @Schema(description = "In a few words: Thursdays, Tue and Fri, Weekdays, Every month")
        String label) {

    /** Null for something that doesn't repeat. */
    public static RepeatResponse of(Recurrence repeat) {
        return repeat == null
                ? null
                : new RepeatResponse(
                        repeat.unit(),
                        repeat.every(),
                        repeat.days().stream().sorted().toList(),
                        repeat.until(),
                        repeat.label());
    }
}

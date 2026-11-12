package app.homeport.api.plan;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.function.LongFunction;

/**
 * How a goal stands and what that means in a sentence. All the sums are here, in one place with no database
 * in it:
 *
 * <ul>
 *   <li>the ring is how far of the target, rounded, and never 100 before the target is reached;
 *   <li>with a day to be done by, "what gets there" is what is still to go shared over the weeks left, and
 *       it is "on track" when carrying on at the pace so far (what there is, over the weeks since it began)
 *       would reach the target by that day;
 *   <li>without a day, the pace so far says about how long it will still take.
 * </ul>
 */
@Schema(name = "GoalPaceResponse")
public record GoalPace(
        @Schema(description = "How far, 0 to 100: what the ring shows")
        int percent,

        long toGo,
        boolean reached,

        @Schema(
                nullable = true,
                description = "With a day to be done by: whether the pace so far gets there. Null without one.")
        Boolean onTrack,

        @Schema(description = "On track: €120 a week gets there. Empty when there is nothing to say.")
        String paceLine,

        @Schema(description = "€2,400 to go") String toGoLine,

        @Schema(nullable = true, description = "20 weeks left. Null without a day to be done by.")
        String timeLine) {

    /**
     * @param step what "a week gets there" is rounded up to: 100 for money (whole euros), 1 for anything counted
     * @param say how a number of this goal reads: "€120", "7"
     */
    public static GoalPace work(
            long target,
            long current,
            LocalDate startedOn,
            LocalDate targetOn,
            LocalDate today,
            long step,
            LongFunction<String> say) {
        boolean reached = current >= target;
        long toGo = Math.max(0, target - current);
        int percent = reached ? 100 : Math.clamp(Math.round(current * 100.0 / target), 0, 99);
        String toGoLine = reached ? "Reached" : say.apply(toGo) + " to go";
        if (reached) {
            return new GoalPace(100, 0, true, targetOn == null ? null : Boolean.TRUE, "You got there", toGoLine, null);
        }
        double weeksSoFar = Math.max(1, ChronoUnit.DAYS.between(startedOn, today) / 7.0);
        double aWeekSoFar = Math.max(0, current) / weeksSoFar;
        if (targetOn == null) {
            String pace = "";
            if (aWeekSoFar > 0) {
                long weeks = (long) Math.ceil(toGo / aWeekSoFar);
                pace = weeks > 520
                        ? "At this pace it takes more than ten years"
                        : "At this pace: about " + Words.count(weeks, "week") + " to go";
            }
            return new GoalPace(percent, toGo, false, null, pace, toGoLine, null);
        }
        long daysLeft = ChronoUnit.DAYS.between(today, targetOn);
        if (daysLeft < 0) {
            return new GoalPace(percent, toGo, false, false, "Past its day: " + toGoLine, toGoLine, "Past its day");
        }
        long weeksLeft = Math.max(1, (daysLeft + 6) / 7);
        long aWeek = Math.ceilDiv(Math.ceilDiv(toGo, weeksLeft), step) * step;
        boolean onTrack = current + aWeekSoFar * (daysLeft / 7.0) >= target;
        String time = daysLeft == 0
                ? "Today is the day"
                : daysLeft < 14 ? Words.count(daysLeft, "day") + " left" : Words.count(weeksLeft, "week") + " left";
        return new GoalPace(
                percent,
                toGo,
                false,
                onTrack,
                (onTrack ? "On track: " : "Behind: ") + say.apply(aWeek) + " a week gets there",
                toGoLine,
                time);
    }
}

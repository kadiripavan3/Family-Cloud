package app.homeport.api.plan;

import app.homeport.api.home.TodaySource.TodayItem;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * What another place puts on the calendar: a bill on the day it is due, a document on the day it expires. The
 * place implements this and Spring finds it; the day's list and the month then show its lines among the
 * events and reminders, and Plan never looks into that place's tables.
 *
 * <p>It is asked for a stretch of days at once (a month is forty-two), so answer with one question to the
 * database, not one per day, and only with what this person may see.
 */
public interface PlanSource {

    /**
     * One line on one day.
     *
     * @param item how the line reads: the same shape Today uses ("€84" in front, "Electricity", a note)
     * @param memberIds whose it is, for the coloured dot and for filtering to one face; empty for everyone's
     */
    record Dated(LocalDate day, TodayItem item, List<UUID> memberIds) {}

    /** What falls on the days from {@code from} to {@code to}, both counted, in any order. */
    List<Dated> between(UUID me, UUID circleId, LocalDate from, LocalDate to);
}

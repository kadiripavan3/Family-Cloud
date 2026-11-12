package app.homeport.api.board;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneOffset;

/**
 * Which day it is for a rule that depends on the calendar ("opens on 4 December", "tonight's dinner"). The
 * phone says what day it is where the person is, because the API can't know their time zone.
 *
 * <p>But a sealed letter must not open because a phone claims it is 2035. Anywhere on Earth the day is at
 * most one away from the day in UTC, so that is as far as the phone is believed: a day sent from further off
 * is pulled back to the nearest day that can be true. The worst a wrong clock can do is open something a day
 * early.
 */
public final class Today {

    private Today() {}

    /** The day to go by: the phone's when it can be true, the API's own when none was sent. */
    public static LocalDate of(LocalDate phone) {
        return of(phone, Clock.systemUTC());
    }

    static LocalDate of(LocalDate phone, Clock clock) {
        LocalDate here = LocalDate.now(clock.withZone(ZoneOffset.UTC));
        if (phone == null) {
            return here;
        }
        if (phone.isBefore(here.minusDays(1))) {
            return here.minusDays(1);
        }
        return phone.isAfter(here.plusDays(1)) ? here.plusDays(1) : phone;
    }
}

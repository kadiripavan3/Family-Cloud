package app.homeport.api.vault;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.Locale;

/**
 * The few words that say where a Vault item stands, from what is kept in the clear: "Login · netflix.com",
 * "ID · expires 14 Mar 2031", "Expires 2 Aug 2027 · renew soon". Never anything secret: the API has none.
 */
final class VaultGlance {

    /** An ID that runs out within a year is worth renewing soon: many borders want six months left on a passport. */
    static final int RENEW_SOON_DAYS = 365;

    /** Today shows an ID from this many days before it runs out… */
    static final int TODAY_DAYS_BEFORE = 60;

    /** …until this many days after, so it doesn't go quiet the day it matters most. */
    static final int TODAY_DAYS_AFTER = 14;

    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("d MMM yyyy", Locale.ENGLISH);

    private VaultGlance() {}

    static boolean renewSoon(LocalDate expiresOn, LocalDate today) {
        return expiresOn != null && !expiresOn.isAfter(today.plusDays(RENEW_SOON_DAYS));
    }

    /** The line under an item's title wherever things of mixed kinds are listed. */
    static String of(VaultCategory category, String site, LocalDate expiresOn, LocalDate today) {
        if (expiresOn != null) {
            if (expiresOn.isBefore(today)) {
                return "Expired " + DAY.format(expiresOn);
            }
            return renewSoon(expiresOn, today)
                    ? "Expires " + DAY.format(expiresOn) + " · renew soon"
                    : category.label() + " · expires " + DAY.format(expiresOn);
        }
        String where = site == null ? "" : site.trim();
        return where.isEmpty() ? category.label() : category.label() + " · " + where;
    }

    /** True when Today has a line for an ID that runs out on this day. */
    static boolean onToday(LocalDate expiresOn, LocalDate today) {
        long days = ChronoUnit.DAYS.between(today, expiresOn);
        return days <= TODAY_DAYS_BEFORE && days >= -TODAY_DAYS_AFTER;
    }

    /** What Today says under it: "Runs out in 23 days", "Runs out tomorrow", "Ran out 3 days ago". */
    static String countdown(LocalDate expiresOn, LocalDate today) {
        long days = ChronoUnit.DAYS.between(today, expiresOn);
        if (days == 0) {
            return "Runs out today";
        }
        if (days == 1) {
            return "Runs out tomorrow";
        }
        if (days == -1) {
            return "Ran out yesterday";
        }
        return days > 0 ? "Runs out in " + days + " days" : "Ran out " + -days + " days ago";
    }
}

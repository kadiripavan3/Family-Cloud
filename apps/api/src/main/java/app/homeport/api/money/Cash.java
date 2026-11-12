package app.homeport.api.money;

import app.homeport.api.common.ApiProblem;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.text.DecimalFormat;
import java.text.DecimalFormatSymbols;
import java.util.Locale;

/**
 * Money as the API writes it in a sentence. Amounts are whole cents in a {@code long}, never a floating-point
 * number; a currency is its three-letter code. Screens format amounts themselves; this is for the few lines
 * the API words for them (Today, a glance, a message).
 */
public final class Cash {

    public static final String EUR = "EUR";

    /** The largest amount one thing may hold: a billion, in cents. */
    public static final long MAX_CENTS = 100_000_000_000L;

    private Cash() {}

    /** The currency sent by the app, or euros when it sent none. */
    public static String currency(String code) {
        if (code == null || code.isBlank()) {
            return EUR;
        }
        String upper = code.trim().toUpperCase(Locale.ROOT);
        if (!upper.matches("[A-Z]{3}")) {
            throw ApiProblem.badRequest("invalid_currency", "Write the currency as three letters, like EUR.");
        }
        return upper;
    }

    /** "€84" for 8420 cents: rounded to whole units, for a line where the cents don't matter. */
    public static String round(long cents, String currency) {
        BigDecimal units = BigDecimal.valueOf(cents, 2).setScale(0, RoundingMode.HALF_UP);
        return sign(units.signum()) + symbol(currency) + format(units.abs(), "#,##0");
    }

    /** "€84.20" for 8420 cents. */
    public static String exact(long cents, String currency) {
        BigDecimal units = BigDecimal.valueOf(cents, 2);
        return sign(units.signum()) + symbol(currency) + format(units.abs(), "#,##0.00");
    }

    private static String sign(int signum) {
        return signum < 0 ? "-" : "";
    }

    private static String format(BigDecimal value, String pattern) {
        return new DecimalFormat(pattern, DecimalFormatSymbols.getInstance(Locale.ROOT)).format(value);
    }

    private static String symbol(String currency) {
        return switch (currency) {
            case "EUR" -> "€";
            case "USD" -> "$";
            case "GBP" -> "£";
            default -> currency + " ";
        };
    }
}

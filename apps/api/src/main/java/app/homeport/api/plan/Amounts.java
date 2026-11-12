package app.homeport.api.plan;

import java.util.Locale;

/** Money and numbers in words: "€5,600", "€12.50", "1,284". Money is whole cents. */
public final class Amounts {

    private Amounts() {}

    /** "€5,600" for 560000 cents; the cents are only shown when there are some: "€12.50". */
    public static String money(long cents, String currency) {
        String sign = cents < 0 ? "-" : "";
        long whole = Math.abs(cents) / 100;
        long rest = Math.abs(cents) % 100;
        String number = rest == 0
                ? String.format(Locale.ENGLISH, "%,d", whole)
                : String.format(Locale.ENGLISH, "%,d.%02d", whole, rest);
        return sign + symbol(currency) + number;
    }

    /** "1,284". */
    public static String count(long number) {
        return String.format(Locale.ENGLISH, "%,d", number);
    }

    private static String symbol(String currency) {
        return switch (currency == null ? "" : currency) {
            case "EUR" -> "€";
            case "USD" -> "$";
            case "GBP" -> "£";
            default -> currency + " ";
        };
    }
}

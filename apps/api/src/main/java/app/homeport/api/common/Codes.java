package app.homeport.api.common;

import java.util.Locale;
import java.util.function.Supplier;

/**
 * The fixed sets of words the API speaks ("public", "paused", "photo") are Java enums. On the wire and in
 * the database they are the lower-case name; this turns the word back into the constant.
 */
public final class Codes {

    private Codes() {}

    public static String of(Enum<?> value) {
        return value.name().toLowerCase(Locale.ROOT);
    }

    /** The constant for a word from the database, where an unknown word would be a bug. */
    public static <E extends Enum<E>> E read(Class<E> type, String code) {
        return code == null ? null : Enum.valueOf(type, code.toUpperCase(Locale.ROOT));
    }

    /** The constant for a word sent by the app; an unknown word gets the given answer. */
    public static <E extends Enum<E>> E parse(Class<E> type, String code, Supplier<ApiProblem> unknown) {
        try {
            return Enum.valueOf(type, code.trim().toUpperCase(Locale.ROOT));
        } catch (RuntimeException e) {
            throw unknown.get();
        }
    }
}

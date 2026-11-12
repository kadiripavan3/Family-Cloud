package app.homeport.api.common;

/** What to call someone. */
public final class Names {

    private Names() {}

    /** The first word of the name someone gave: "Nora" for "Nora Lindqvist". */
    public static String first(String displayName) {
        String trimmed = displayName.trim();
        int space = trimmed.indexOf(' ');
        return space > 0 ? trimmed.substring(0, space) : trimmed;
    }
}

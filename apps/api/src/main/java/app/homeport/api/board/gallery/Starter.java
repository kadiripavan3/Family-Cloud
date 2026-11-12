package app.homeport.api.board.gallery;

import java.util.ArrayList;
import java.util.List;

/**
 * What a plain template starts as: a few pages and checklists with ready-made content. Built with a few
 * words in {@link Starters}:
 *
 * <pre>
 * starter().page("House manual", "…").list("Packing list", "# Documents", "Passports", "# Clothes", "Socks")
 * </pre>
 */
final class Starter {

    /** One thing a starter makes. A page has words; a checklist has lines, each under a heading or under none. */
    record Piece(boolean page, String title, String body, List<Line> lines, boolean onlyYou) {}

    record Line(String section, String text) {}

    private final List<Piece> pieces = new ArrayList<>();

    static Starter starter() {
        return new Starter();
    }

    List<Piece> pieces() {
        return List.copyOf(pieces);
    }

    /** A page with these words. */
    Starter page(String title, String body) {
        pieces.add(new Piece(true, title, body.strip(), List.of(), false));
        return this;
    }

    /** A checklist with these lines. A line that starts with "# " is a heading for the lines after it. */
    Starter list(String title, String... lines) {
        pieces.add(new Piece(false, title, "", lines(lines), false));
        return this;
    }

    /**
     * The same, but it starts as yours alone whatever the circle's kind: a list of gift ideas must not begin
     * its life shared with the person it is about.
     */
    Starter secretList(String title, String... lines) {
        pieces.add(new Piece(false, title, "", lines(lines), true));
        return this;
    }

    private static List<Line> lines(String... lines) {
        List<Line> read = new ArrayList<>();
        String section = "";
        for (String line : lines) {
            if (line.startsWith("# ")) {
                section = line.substring(2).trim();
            } else {
                read.add(new Line(section, line.trim()));
            }
        }
        return read;
    }
}

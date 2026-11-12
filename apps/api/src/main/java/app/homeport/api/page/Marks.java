package app.homeport.api.page;

import app.homeport.api.common.ApiProblem;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;

/** Checks the marks of a text block against its text, and puts them in order. */
public final class Marks {

    private Marks() {}

    static final int MAX = 200;

    /**
     * The marks as they are kept: each inside the text, a link with an address that opens in a browser, a
     * name with its member, nothing else carried along, sorted by where they start.
     */
    public static List<Mark> clean(String text, List<Mark> marks) {
        if (marks == null || marks.isEmpty()) {
            return List.of();
        }
        if (marks.size() > MAX) {
            throw unreadable();
        }
        List<Mark> kept = new ArrayList<>();
        for (Mark mark : marks) {
            if (mark == null
                    || mark.kind() == null
                    || mark.start() < 0
                    || mark.end() <= mark.start()
                    || mark.end() > text.length()) {
                throw unreadable();
            }
            switch (mark.kind()) {
                case LINK -> {
                    String url = mark.url() == null ? "" : mark.url().trim();
                    if (!url.matches("(?i)https?://\\S{1,2000}")) {
                        throw ApiProblem.badRequest("invalid_link", "A link starts with http:// or https://.");
                    }
                    kept.add(new Mark(mark.start(), mark.end(), MarkKind.LINK, url, null));
                }
                case MENTION -> {
                    if (mark.memberId() == null) {
                        throw unreadable();
                    }
                    kept.add(new Mark(mark.start(), mark.end(), MarkKind.MENTION, null, mark.memberId()));
                }
                default -> kept.add(new Mark(mark.start(), mark.end(), mark.kind(), null, null));
            }
        }
        kept.sort(
                Comparator.comparingInt(Mark::start).thenComparingInt(Mark::end).thenComparing(Mark::kind));
        return List.copyOf(kept);
    }

    /** The members named in these marks. */
    public static List<UUID> named(List<Mark> marks) {
        return marks.stream()
                .filter(m -> m.kind() == MarkKind.MENTION)
                .map(Mark::memberId)
                .distinct()
                .toList();
    }

    private static ApiProblem unreadable() {
        return ApiProblem.badRequest("invalid_marks", "We couldn't read the formatting of that text.");
    }
}

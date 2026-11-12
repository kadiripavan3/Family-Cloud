package app.homeport.api.board.templates;

import app.homeport.api.board.BoardStore;
import app.homeport.api.board.Boards;
import app.homeport.api.board.EntryRow;
import app.homeport.api.board.Scene;
import app.homeport.api.board.Template;
import app.homeport.api.board.templates.HeadsUp.Notice;
import app.homeport.api.home.TodaySource.TodayItem;
import app.homeport.api.plan.PlanSource;
import app.homeport.api.thing.ThingKind;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Component;

/**
 * A heads-up with days stays on the calendar: "My sister's staying" on Friday, Saturday and Sunday, "I'm
 * away" on each day of the week away. Plan asks for a stretch of days and shows these lines among its own;
 * it never looks into the boards.
 */
@Component
class HeadsUpCalendar implements PlanSource {

    /** A notice is drawn on this many days at most, however long it runs. */
    private static final int LONGEST = 62;

    private final BoardStore store;
    // Asked for when first used: the templates' rules reach into Plan, and Plan is built from every PlanSource.
    private final ObjectProvider<Boards> boards;

    HeadsUpCalendar(BoardStore store, ObjectProvider<Boards> boards) {
        this.store = store;
        this.boards = boards;
    }

    @Override
    public List<Dated> between(UUID me, UUID circleId, LocalDate from, LocalDate to) {
        List<Dated> lines = new ArrayList<>();
        for (Scene scene : boards.getObject().scenes(store.seenIn(circleId, me), me, null)) {
            if (scene.template() != Template.HEADS_UP) {
                continue;
            }
            for (EntryRow row : scene.entries(HeadsUp.NOTICE)) {
                if (row.day() == null || row.authorId() == null) {
                    continue;
                }
                Notice notice = row.as(Notice.class);
                LocalDate last = notice.until() == null ? row.day() : notice.until();
                LocalDate day = row.day().isBefore(from) ? from : row.day();
                for (int n = 0; n < LONGEST && !day.isAfter(last) && !day.isAfter(to); n++) {
                    lines.add(new Dated(
                            day,
                            new TodayItem(
                                    scene.boardId(),
                                    ThingKind.BOARD,
                                    notice.text(),
                                    scene.firstName(row.authorId())
                                            + (notice.detail() == null ? "" : " · " + notice.detail()),
                                    null,
                                    null,
                                    1440,
                                    scene.avatars(row.authorId())),
                            List.of(row.authorId())));
                    day = day.plusDays(1);
                }
            }
        }
        return lines;
    }
}

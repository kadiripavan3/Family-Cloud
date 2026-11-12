package app.homeport.api.board.templates;

import app.homeport.api.board.BoardStore;
import app.homeport.api.board.Boards;
import app.homeport.api.board.EntryRow;
import app.homeport.api.board.Scene;
import app.homeport.api.board.Template;
import app.homeport.api.home.SearchSource;
import app.homeport.api.thing.Place;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Component;

/**
 * "where's the tent", typed into the circle's search. Plain words ("tent") are found by the boards' own
 * search; a question is read here, by the rules of {@link WhereIsIt}, and answered with the place: the board
 * comes back with "Attic, blue crate 3 · Tent, pegs and both mats." under its name. Only what the person
 * asking may see on a list answers.
 */
@Component
class WhereIsItSearch implements SearchSource {

    private final BoardStore store;
    private final ObjectProvider<Boards> boards;

    WhereIsItSearch(BoardStore store, ObjectProvider<Boards> boards) {
        this.store = store;
        this.boards = boards;
    }

    @Override
    public Place place() {
        return Place.NOTES;
    }

    /** True for words that ask where something is. */
    static boolean asksWhere(String words) {
        return words != null && words.trim().toLowerCase(Locale.ROOT).startsWith("where");
    }

    @Override
    public List<Found> find(UUID me, UUID circleId, String words, int limit) {
        if (!asksWhere(words)) {
            return List.of();
        }
        List<Found> found = new ArrayList<>();
        for (Scene scene : boards.getObject().scenes(store.seenIn(circleId, me), me, null)) {
            EntryRow answer = scene.template() == Template.WHERE_IS_IT ? WhereIsIt.answer(scene, words) : null;
            if (answer != null && found.size() < limit) {
                found.add(new Found(scene.boardId(), WhereIsIt.answerLine(answer)));
            }
        }
        return found;
    }
}

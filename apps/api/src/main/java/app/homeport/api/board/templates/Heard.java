package app.homeport.api.board.templates;

import app.homeport.api.board.BoardRules;
import app.homeport.api.board.EntryDraft;
import app.homeport.api.board.EntryRow;
import app.homeport.api.board.Fields;
import app.homeport.api.board.Scene;
import app.homeport.api.board.Template;
import app.homeport.api.board.Words;
import app.homeport.api.common.ApiProblem;
import app.homeport.api.thing.ThingService.PersonBrief;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * Heard in the kitchen: the lines that deserve to outlive the tenancy, with who said them and when. A flat's
 * keepsake: someone who moved out is still named under what they said.
 *
 * <p>The list grows for years, so the board itself carries the count, who said how many, and the newest
 * thirty; the rest is read a page at a time (the entries route, with a member or words).
 *
 * <p>Nothing here is secret: everyone who sees the board sees every line.
 */
@Component
class Heard implements BoardRules {

    static final String QUOTE = "quote";

    record HeardSettings() {}

    /**
     * @param byName who said it, when that is someone who isn't in the flat
     * @param about a few words on when or what about: "about the bathroom ceiling"
     */
    record Quote(String text, String byName, String about) {}

    record HeardViewResponse(
            int total,

            @Schema(description = "Who said them, with how many each: the chips. Thirty at most.")
            List<HeardPersonResponse> people,

            @Schema(description = "The newest thirty. The rest is read a page at a time.")
            List<HeardQuoteResponse> latest) {}

    record HeardPersonResponse(PersonBrief person, boolean you, int count) {}

    record HeardQuoteResponse(
            UUID id,
            String text,

            @Schema(nullable = true, description = "The flatmate who said it, also after they moved out")
            PersonBrief who,

            @Schema(nullable = true, description = "Who said it, when that is someone outside the flat")
            String whoName,

            @Schema(description = "True when the viewer said it")
            boolean you,

            @Schema(nullable = true, description = "A few words on when or what about: the first cold night")
            String about,

            @Schema(description = "The day it was said") LocalDate day,

            @Schema(description = "When it was written down")
            Instant writtenAt,

            @Schema(nullable = true, description = "Who wrote it down")
            PersonBrief writtenBy,

            boolean mine) {}

    @Override
    public Template template() {
        return Template.HEARD;
    }

    @Override
    public Class<?> settingsType() {
        return HeardSettings.class;
    }

    @Override
    public Class<?> viewType() {
        return HeardViewResponse.class;
    }

    @Override
    public Class<?> entryType() {
        return HeardQuoteResponse.class;
    }

    @Override
    public List<String> guide() {
        return List.of(
                "settings: none",
                "entry quote: text, saidByMemberId (or saidByName for someone outside the flat), about (a few words"
                        + " on when or what about), day (left out: today)",
                "entries list: member (who said it), q (words)");
    }

    @Override
    public int ceiling() {
        return 5000;
    }

    @Override
    public Object settings(Scene scene, Fields sent) {
        return new HeardSettings();
    }

    private static List<EntryRow> newestFirst(Scene scene) {
        return scene.entries(QUOTE).stream()
                .sorted(Comparator.comparingDouble(EntryRow::position)
                        .thenComparing(EntryRow::id)
                        .reversed())
                .toList();
    }

    @Override
    public Object view(Scene scene, String show) {
        List<EntryRow> quotes = newestFirst(scene);
        Map<UUID, Integer> counts = new LinkedHashMap<>();
        quotes.stream().filter(q -> q.forId() != null).forEach(q -> counts.merge(q.forId(), 1, Integer::sum));
        return new HeardViewResponse(
                quotes.size(),
                counts.entrySet().stream()
                        .filter(e -> scene.brief(e.getKey()) != null)
                        .sorted(Map.Entry.<UUID, Integer>comparingByValue().reversed())
                        .limit(30)
                        .map(e ->
                                new HeardPersonResponse(scene.brief(e.getKey()), scene.isMe(e.getKey()), e.getValue()))
                        .toList(),
                quotes.stream().limit(30).map(q -> quote(scene, q)).toList());
    }

    @Override
    public Object entry(Scene scene, EntryRow entry) {
        return entry.is(QUOTE) ? quote(scene, entry) : null;
    }

    private static HeardQuoteResponse quote(Scene scene, EntryRow row) {
        Quote quote = row.as(Quote.class);
        return new HeardQuoteResponse(
                row.id(),
                quote.text(),
                scene.brief(row.forId()),
                quote.byName(),
                scene.isMe(row.forId()),
                quote.about(),
                row.day(),
                row.createdAt(),
                scene.brief(row.authorId()),
                scene.isMe(row.authorId()));
    }

    @Override
    public String findable(Scene scene, EntryRow entry) {
        if (!entry.is(QUOTE)) {
            return null;
        }
        Quote quote = entry.as(Quote.class);
        return quote.text() + (quote.about() == null ? "" : " · " + quote.about());
    }

    private static LocalDate day(Scene scene, Fields sent, LocalDate otherwise) {
        LocalDate day = sent.day("day", otherwise);
        if (day == null || day.isAfter(scene.today())) {
            throw ApiProblem.badRequest("invalid_day", "Choose the day it was said. It can't be after today.");
        }
        return day;
    }

    /** Who said it: someone of the flat, also someone who has moved out, or a name. */
    private static UUID saidBy(Scene scene, UUID memberId) {
        if (memberId != null && scene.person(memberId) == null) {
            throw ApiProblem.badRequest("not_in_circle", "Choose someone from this flat, or write their name.");
        }
        return memberId;
    }

    @Override
    public UUID add(Scene scene, String kind, Fields sent, UUID clientId) {
        if (!kind.equals(QUOTE)) {
            throw BoardRules.unknownKind();
        }
        LocalDate day = day(scene, sent, scene.today());
        return scene.add(
                EntryDraft.of(QUOTE)
                        .by(scene.myId())
                        .forMember(saidBy(scene, sent.id("saidByMemberId")))
                        .day(day)
                        .position(scene.positionOn(day))
                        .doc(new Quote(
                                sent.need("text", 500, "Write what was said."),
                                sent.text("saidByName", 50),
                                sent.text("about", 120))),
                clientId);
    }

    @Override
    public void change(Scene scene, EntryRow entry, Fields sent) {
        Quote now = entry.as(Quote.class);
        LocalDate day = day(scene, sent, entry.day());
        String text = sent.text("text", 500, now.text());
        if (text == null) {
            throw ApiProblem.badRequest("missing_text", "Write what was said.");
        }
        scene.save(
                entry,
                EntryDraft.from(entry)
                        .forMember(saidBy(scene, sent.id("saidByMemberId", entry.forId())))
                        .day(day)
                        .position(day.equals(entry.day()) ? entry.position() : scene.positionOn(day))
                        .doc(new Quote(
                                text,
                                sent.text("saidByName", 50, now.byName()),
                                sent.text("about", 120, now.about()))));
    }

    @Override
    public String glance(Scene scene) {
        List<EntryRow> quotes = newestFirst(scene);
        if (quotes.isEmpty()) {
            return "Nothing written down yet";
        }
        EntryRow newest = quotes.get(0);
        String who = newest.forId() != null
                ? scene.firstName(newest.forId())
                : newest.as(Quote.class).byName();
        return Words.count(quotes.size(), "line") + (who == null ? "" : " · latest from " + who);
    }
}

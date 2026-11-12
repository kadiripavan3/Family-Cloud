package app.homeport.api.board.templates;

import app.homeport.api.board.BoardMedia;
import app.homeport.api.board.BoardRules;
import app.homeport.api.board.EntryDraft;
import app.homeport.api.board.EntryRow;
import app.homeport.api.board.Fields;
import app.homeport.api.board.Person;
import app.homeport.api.board.Scene;
import app.homeport.api.board.Template;
import app.homeport.api.board.Words;
import app.homeport.api.common.ApiProblem;
import app.homeport.api.media.MediaKind;
import app.homeport.api.thing.ThingService.PersonBrief;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.LocalDate;
import java.time.Period;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * Things they said: a sentence, who said it and when. The age is worked out from the birthday on the
 * person's page and the day it was said, so nobody has to do the sum: "6 years and 2 months".
 *
 * <p>The list grows for years, so the board itself carries the counts and the newest thirty; the rest is read
 * a page at a time (the entries route, with a member, the filter "voice", or words).
 *
 * <p>Nothing here is secret: everyone who sees the board sees every quote.
 */
@Component
class Said implements BoardRules {

    static final String QUOTE = "quote";

    record SaidSettings() {}

    /** @param byName who said it, when that is someone who isn't in the circle */
    record Quote(String text, String byName) {}

    record SaidView(
            int total,
            int withVoice,

            @Schema(description = "Who said them, with how many each: the chips. Thirty at most.")
            List<SaidPerson> people,

            @Schema(description = "The newest thirty. The rest is read a page at a time.")
            List<SaidQuote> latest) {}

    record SaidPerson(PersonBrief person, int count) {}

    record SaidQuote(
            UUID id,
            String text,

            @Schema(nullable = true, description = "The member who said it")
            PersonBrief who,

            @Schema(nullable = true, description = "Who said it, when that is someone outside the circle")
            String whoName,

            @Schema(description = "The day it was said") LocalDate day,

            @Schema(nullable = true, description = "How old they were: whole years")
            Integer ageYears,

            @Schema(nullable = true, description = "…and the months on top")
            Integer ageMonths,

            @Schema(nullable = true, description = "The age in words: 6 years and 2 months")
            String age,

            @Schema(nullable = true, description = "A recording of it")
            BoardMedia voice,

            @Schema(nullable = true, description = "Who wrote it down")
            PersonBrief writtenBy,

            boolean mine) {}

    @Override
    public Template template() {
        return Template.SAID;
    }

    @Override
    public Class<?> settingsType() {
        return SaidSettings.class;
    }

    @Override
    public Class<?> viewType() {
        return SaidView.class;
    }

    @Override
    public Class<?> entryType() {
        return SaidQuote.class;
    }

    @Override
    public List<String> guide() {
        return List.of(
                "settings: none",
                "entry quote: text, saidByMemberId (or saidByName for someone outside the circle), day (left out:"
                        + " today), mediaId (an audio upload)",
                "entries list: member (who said it), filter voice (only those with a recording), q (words)");
    }

    @Override
    public int ceiling() {
        return 5000;
    }

    // ---------- the age ----------

    /** The age in words on the day something was said: "6 years and 2 months", "7 years", "8 months". */
    static String age(LocalDate birthday, LocalDate day) {
        if (birthday == null || day == null || day.isBefore(birthday)) {
            return null;
        }
        Period age = Period.between(birthday, day);
        String years = Words.count(age.getYears(), "year");
        String months = Words.count(age.getMonths(), "month");
        if (age.getYears() == 0) {
            return age.getMonths() == 0 ? "under a month" : months;
        }
        return age.getMonths() == 0 ? years : years + " and " + months;
    }

    @Override
    public Object settings(Scene scene, Fields sent) {
        return new SaidSettings();
    }

    // ---------- what a person sees ----------

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
        return new SaidView(
                quotes.size(),
                (int) quotes.stream().filter(q -> q.mediaId() != null).count(),
                counts.entrySet().stream()
                        .filter(e -> scene.brief(e.getKey()) != null)
                        .sorted(Map.Entry.<UUID, Integer>comparingByValue().reversed())
                        .limit(30)
                        .map(e -> new SaidPerson(scene.brief(e.getKey()), e.getValue()))
                        .toList(),
                quotes.stream().limit(30).map(q -> quote(scene, q)).toList());
    }

    @Override
    public Object entry(Scene scene, EntryRow entry) {
        return entry.is(QUOTE) ? quote(scene, entry) : null;
    }

    private static SaidQuote quote(Scene scene, EntryRow row) {
        Quote quote = row.as(Quote.class);
        Person who = scene.person(row.forId());
        LocalDate birthday = who == null ? null : who.birthday();
        boolean aged = birthday != null && row.day() != null && !row.day().isBefore(birthday);
        Period age = aged ? Period.between(birthday, row.day()) : null;
        return new SaidQuote(
                row.id(),
                quote.text(),
                scene.brief(row.forId()),
                quote.byName(),
                row.day(),
                aged ? age.getYears() : null,
                aged ? age.getMonths() : null,
                age(birthday, row.day()),
                scene.media(row.mediaId()),
                scene.brief(row.authorId()),
                scene.isMe(row.authorId()));
    }

    @Override
    public boolean passes(Scene scene, EntryRow entry, String filter) {
        return !filter.equals("voice") || entry.mediaId() != null;
    }

    @Override
    public String findable(Scene scene, EntryRow entry) {
        return entry.is(QUOTE) ? entry.as(Quote.class).text() : null;
    }

    // ---------- changing it ----------

    private static LocalDate day(Scene scene, Fields sent, LocalDate otherwise) {
        LocalDate day = sent.day("day", otherwise);
        if (day == null || day.isAfter(scene.today())) {
            throw ApiProblem.badRequest("invalid_day", "Choose the day it was said. It can't be after today.");
        }
        return day;
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
                        .forMember(scene.inCircle(sent.id("saidByMemberId")))
                        .day(day)
                        .position(scene.positionOn(day))
                        .media(scene.upload(sent.id("mediaId"), MediaKind.AUDIO))
                        .doc(new Quote(sent.need("text", 500, "Write what they said."), sent.text("saidByName", 50))),
                clientId);
    }

    @Override
    public void change(Scene scene, EntryRow entry, Fields sent) {
        Quote now = entry.as(Quote.class);
        LocalDate day = day(scene, sent, entry.day());
        String text = sent.text("text", 500, now.text());
        if (text == null) {
            throw ApiProblem.badRequest("missing_text", "Write what they said.");
        }
        scene.save(
                entry,
                EntryDraft.from(entry)
                        .forMember(scene.inCircle(sent.id("saidByMemberId", entry.forId())))
                        .day(day)
                        .position(day.equals(entry.day()) ? entry.position() : scene.positionOn(day))
                        .media(
                                sent.has("mediaId")
                                        ? scene.upload(sent.id("mediaId"), MediaKind.AUDIO)
                                        : entry.mediaId())
                        .doc(new Quote(text, sent.text("saidByName", 50, now.byName()))));
    }

    // ---------- what it brings to the rest ----------

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
        return Words.count(quotes.size(), "quote") + (who == null ? "" : " · latest from " + who);
    }
}

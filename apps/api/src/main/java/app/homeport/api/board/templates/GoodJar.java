package app.homeport.api.board.templates;

import app.homeport.api.board.BoardMedia;
import app.homeport.api.board.BoardRules;
import app.homeport.api.board.EntryDraft;
import app.homeport.api.board.EntryRow;
import app.homeport.api.board.Fields;
import app.homeport.api.board.Scene;
import app.homeport.api.board.Template;
import app.homeport.api.board.Words;
import app.homeport.api.common.ApiProblem;
import app.homeport.api.home.TodaySource.TodayItem;
import app.homeport.api.media.MediaKind;
import app.homeport.api.thing.ThingKind;
import app.homeport.api.thing.ThingService.PersonBrief;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * The good things jar: small notes dropped in through the year, read back on New Year's Eve.
 *
 * <p><b>Who sees what.</b> It is decided in {@link #reads}, and only there. A slip belongs to the year of the
 * day it was dropped in, and that day is always the day it was written: it can't be dated back. Until 31
 * December of its year, everyone sees that a slip is there, whose it is, what kind of thing it is and when it
 * went in, and nobody but the person who wrote it down reads it. From 31 December on, everyone who sees the
 * jar reads every slip of that year, for good. A slip dropped in on 1 January is next year's.
 *
 * <p>The day is the viewer's own day, but never more than a day from the API's (see {@code Today}): a phone
 * set to December opens nothing.
 */
@Component
class GoodJar implements BoardRules {

    static final String SLIP = "slip";
    private static final Set<String> WHATS = Set.of("note", "photo", "drawing");

    record GoodJarSettings() {}

    /** @param what note, photo or drawing */
    record Slip(String what, String text, String place, Boolean fromJourney) {
        boolean journey() {
            return Boolean.TRUE.equals(fromJourney);
        }
    }

    record GoodJarView(
            @Schema(description = "The year the jar is being filled for")
            int year,

            @Schema(description = "How many good things are in this year's jar")
            int count,

            @Schema(description = "The day this year's jar opens: 31 December")
            LocalDate opensOn,

            @Schema(description = "True on the day it opens")
            boolean open,

            long daysToGo,

            @Schema(description = "The five newest slips of this year, as this person may see them")
            List<GoodJarSlip> latest,

            @Schema(description = "Earlier years, newest first: each one is open and can be read back")
            List<GoodJarYear> years) {}

    record GoodJarYear(int year, int count) {}

    record GoodJarSlip(
            UUID id,

            @Schema(nullable = true, description = "Whose good thing it is")
            PersonBrief who,

            @Schema(description = "note, photo or drawing") String what,
            LocalDate day,

            @Schema(nullable = true, description = "Where it is from: Reine")
            String place,

            boolean fromJourney,
            boolean mine,

            @Schema(description = "True while this person may not read it")
            boolean sealed,

            @Schema(nullable = true, description = "What it says. Null while it is sealed for this person.")
            String text,

            @Schema(nullable = true, description = "Its photo or drawing. Null while it is sealed for this person.")
            BoardMedia picture) {}

    @Override
    public Template template() {
        return Template.GOOD_JAR;
    }

    @Override
    public Class<?> settingsType() {
        return GoodJarSettings.class;
    }

    @Override
    public Class<?> viewType() {
        return GoodJarView.class;
    }

    @Override
    public Class<?> entryType() {
        return GoodJarSlip.class;
    }

    @Override
    public List<String> guide() {
        return List.of(
                "settings: none",
                "entry slip: text, mediaId (a photo upload), what (note, photo or drawing; left out: by what was"
                        + " sent), fromMemberId (whose good thing it is; left out: yours), place, fromJourney",
                "show: a year, to see that year's jar. Left out: this year.",
                "entries list: filter with a year (2025) for that year's slips");
    }

    @Override
    public int ceiling() {
        return 10000;
    }

    // ---------- who sees what ----------

    /** The day the jar of a year opens. */
    static LocalDate opens(int year) {
        return LocalDate.of(year, 12, 31);
    }

    /** The one place that decides who reads a slip. */
    private static boolean reads(Scene scene, EntryRow slip) {
        return scene.isMe(slip.authorId())
                || !scene.today().isBefore(opens(slip.day().getYear()));
    }

    @Override
    public Object settings(Scene scene, Fields sent) {
        return new GoodJarSettings();
    }

    // ---------- what a person sees ----------

    @Override
    public Object view(Scene scene, String show) {
        int year = show == null ? scene.today().getYear() : year(show);
        List<EntryRow> slips = scene.entries(SLIP);
        Map<Integer, Integer> perYear = new TreeMap<>(Comparator.reverseOrder());
        slips.forEach(s -> perYear.merge(s.day().getYear(), 1, Integer::sum));
        return new GoodJarView(
                year,
                perYear.getOrDefault(year, 0),
                opens(year),
                !scene.today().isBefore(opens(year)),
                Math.max(0, ChronoUnit.DAYS.between(scene.today(), opens(year))),
                slips.stream()
                        .filter(s -> s.day().getYear() == year)
                        .sorted(Comparator.comparingDouble(EntryRow::position)
                                .thenComparing(EntryRow::id)
                                .reversed())
                        .limit(5)
                        .map(s -> slip(scene, s))
                        .toList(),
                perYear.entrySet().stream()
                        .filter(e -> e.getKey() < scene.today().getYear())
                        .map(e -> new GoodJarYear(e.getKey(), e.getValue()))
                        .toList());
    }

    private static int year(String show) {
        try {
            return Math.clamp(Integer.parseInt(show), 1900, 9999);
        } catch (NumberFormatException notAYear) {
            throw ApiProblem.badRequest("invalid_show", "Choose a year.");
        }
    }

    @Override
    public Object entry(Scene scene, EntryRow entry) {
        return entry.is(SLIP) ? slip(scene, entry) : null;
    }

    private static GoodJarSlip slip(Scene scene, EntryRow row) {
        Slip slip = row.as(Slip.class);
        boolean reads = reads(scene, row);
        return new GoodJarSlip(
                row.id(),
                scene.brief(row.forId()),
                slip.what(),
                row.day(),
                slip.place(),
                slip.journey(),
                scene.isMe(row.authorId()),
                !reads,
                reads ? slip.text() : null,
                reads ? scene.media(row.mediaId()) : null);
    }

    /** The template's own filter: a year. */
    @Override
    public boolean passes(Scene scene, EntryRow entry, String filter) {
        return filter.equals(String.valueOf(entry.day().getYear()));
    }

    @Override
    public String findable(Scene scene, EntryRow entry) {
        if (!reads(scene, entry)) {
            return null;
        }
        Slip slip = entry.as(Slip.class);
        return (slip.text() == null ? "" : slip.text()) + (slip.place() == null ? "" : " · " + slip.place());
    }

    // ---------- changing it ----------

    @Override
    public UUID add(Scene scene, String kind, Fields sent, UUID clientId) {
        if (!kind.equals(SLIP)) {
            throw BoardRules.unknownKind();
        }
        UUID picture = scene.upload(sent.id("mediaId"), MediaKind.PHOTO);
        String text = sent.text("text", 500);
        if (text == null && picture == null) {
            throw ApiProblem.badRequest("missing_text", "Write the good thing, or add a picture of it.");
        }
        String what = sent.text("what", 10, picture == null ? "note" : "photo");
        if (!WHATS.contains(what)) {
            throw ApiProblem.badRequest("invalid_what", "A slip is a note, a photo or a drawing.");
        }
        UUID whose = scene.inCircle(sent.id("fromMemberId", scene.myId()));
        // The day it goes in is always today: a slip can't be dated back into a jar that is already open.
        return scene.add(
                EntryDraft.of(SLIP)
                        .by(scene.myId())
                        .forMember(whose)
                        .day(scene.today())
                        .position(scene.positionOn(scene.today()))
                        .media(picture)
                        .doc(new Slip(what, text, sent.text("place", 80), sent.flag("fromJourney", false))),
                clientId);
    }

    /** Only the person who wrote a slip down changes it or takes it out. */
    @Override
    public void change(Scene scene, EntryRow entry, Fields sent) {
        if (!scene.isMe(entry.authorId())) {
            throw BoardRules.notYours();
        }
        Slip now = entry.as(Slip.class);
        String text = sent.text("text", 500, now.text());
        if (text == null && entry.mediaId() == null) {
            throw ApiProblem.badRequest("missing_text", "Write the good thing, or add a picture of it.");
        }
        scene.save(
                entry,
                EntryDraft.from(entry)
                        .doc(new Slip(
                                now.what(),
                                text,
                                sent.text("place", 80, now.place()),
                                sent.flag("fromJourney", now.journey()))));
    }

    @Override
    public void remove(Scene scene, EntryRow entry) {
        if (!scene.isMe(entry.authorId())) {
            throw BoardRules.notYours();
        }
        scene.remove(entry.id());
    }

    // ---------- what it brings to the rest ----------

    private static long thisYears(Scene scene) {
        return scene.entries(SLIP).stream()
                .filter(s -> s.day().getYear() == scene.today().getYear())
                .count();
    }

    @Override
    public String glance(Scene scene) {
        return Words.count(thisYears(scene), "good thing") + " · opens "
                + Words.shortDay(opens(scene.today().getYear()));
    }

    @Override
    public List<TodayItem> today(Scene scene) {
        if (!scene.today().equals(opens(scene.today().getYear())) || thisYears(scene) == 0) {
            return List.of();
        }
        return List.of(new TodayItem(
                scene.boardId(),
                ThingKind.BOARD,
                scene.title(),
                "The jar opens today: " + Words.count(thisYears(scene), "good thing") + " to read back",
                null,
                null,
                1440,
                List.of()));
    }
}

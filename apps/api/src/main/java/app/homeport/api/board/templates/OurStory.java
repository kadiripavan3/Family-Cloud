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
import app.homeport.api.home.TodaySource.TodayCard;
import app.homeport.api.media.MediaKind;
import app.homeport.api.thing.ThingService.PersonBrief;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * Our story: the firsts and the moments of two people, in order, with photos and a count of the days.
 *
 * <p>A moment has its day (or only its month, or its year, when that is all anyone remembers), a title, a few
 * words, and photos. The count of days runs from the day the story says it began: the day set in the
 * settings, or else the day of its first moment.
 *
 * <p>The drawing says the story "starts itself from the oldest photo of the two of you and from journeys you
 * kept". Neither is built: a moment is written by hand, and one that came from a journey is only marked as
 * such ({@code from}).
 *
 * <p>Nothing here is secret: everyone who sees the story sees all of it. It is the board's own sharing that
 * keeps it to the two of them.
 */
@Component
class OurStory implements BoardRules {

    static final String MOMENT = "moment";
    static final String PHOTO = "photo";
    private static final Set<String> PRECISIONS = Set.of("day", "month", "year");
    private static final int SHOWN = 300;

    record OurStorySettings(
            @Schema(nullable = true, description = "The day the count starts from. Null: the day of the first moment.")
            LocalDate since,

            @Schema(nullable = true, description = "What it began with, to say after “Since”: a wedding in Piran")
            String sinceWords) {}

    /**
     * @param label the word next to its date: Piran, First trip
     * @param precision day, month or year: how much of its date is known
     * @param from "journey" for a moment that came from a journey that was kept
     */
    record Moment(String title, String text, String label, String precision, Boolean star, String from) {}

    record OurStoryResponse(
            @Schema(nullable = true, description = "The day the count starts from. Null while there is no moment.")
            LocalDate since,

            @Schema(nullable = true, description = "The days from then to today: 4,503 days so far")
            Long days,

            @Schema(nullable = true, description = "What it began with: a wedding in Piran")
            String sinceWords,

            @Schema(description = "How many moments there are")
            int count,

            @Schema(description = "The moments, oldest first. 300 at most; the list of entries has them all.")
            List<OurStoryMomentResponse> moments) {}

    record OurStoryMomentResponse(
            UUID id,
            LocalDate day,

            @Schema(description = "day, month or year: how much of the date to show")
            String precision,

            @Schema(nullable = true, description = "The word next to its date: Piran, First trip")
            String label,

            String title,
            @Schema(nullable = true) String text,

            @Schema(description = "True for a moment marked with a star")
            boolean star,

            @Schema(nullable = true, description = "journey: it came from a journey that was kept")
            String from,

            @Schema(description = "Its photos, the first one first")
            List<BoardMedia> photos,

            @Schema(nullable = true) PersonBrief addedBy,
            boolean mine) {}

    @Override
    public Template template() {
        return Template.OUR_STORY;
    }

    @Override
    public Class<?> settingsType() {
        return OurStorySettings.class;
    }

    @Override
    public Class<?> viewType() {
        return OurStoryResponse.class;
    }

    @Override
    public Class<?> entryType() {
        return OurStoryMomentResponse.class;
    }

    @Override
    public List<String> guide() {
        return List.of(
                "settings: since (the day the count starts from; left out: the day of the first moment), sinceWords"
                        + " (what it began with: a wedding in Piran)",
                "entry moment: title, day (a date; for a month or a year, its first day), precision (day, month or"
                        + " year; left out: day), label (the word next to the date), text, star (true or false),"
                        + " from (journey, or null), mediaId (a photo upload)",
                "entry photo: momentId, mediaId (one more photo for a moment)");
    }

    // ---------- settings ----------

    @Override
    public Object settings(Scene scene, Fields sent) {
        OurStorySettings now =
                scene.isNew() ? new OurStorySettings(null, null) : scene.settings(OurStorySettings.class);
        LocalDate since = sent.day("since", now.since());
        if (since != null && since.isAfter(scene.today())) {
            throw ApiProblem.badRequest("invalid_day", "A story begins today or earlier.");
        }
        return new OurStorySettings(since, sent.text("sinceWords", 80, now.sinceWords()));
    }

    // ---------- what a person sees ----------

    /** The day the count starts from: the one that was set, or the day of the first moment. Null with neither. */
    private static LocalDate since(Scene scene) {
        LocalDate set = scene.settings(OurStorySettings.class).since();
        return set != null
                ? set
                : scene.entries(MOMENT).stream()
                        .map(EntryRow::day)
                        .filter(Objects::nonNull)
                        .min(LocalDate::compareTo)
                        .orElse(null);
    }

    @Override
    public Object view(Scene scene, String show) {
        LocalDate since = since(scene);
        List<EntryRow> moments = scene.entries(MOMENT);
        return new OurStoryResponse(
                since,
                since == null ? null : ChronoUnit.DAYS.between(since, scene.today()),
                scene.settings(OurStorySettings.class).sinceWords(),
                moments.size(),
                moments.stream().limit(SHOWN).map(row -> moment(scene, row)).toList());
    }

    private static List<BoardMedia> photos(Scene scene, EntryRow row) {
        List<BoardMedia> photos = new ArrayList<>();
        photos.add(scene.media(row.mediaId()));
        scene.under(row.id()).stream()
                .filter(photo -> photo.is(PHOTO))
                .forEach(photo -> photos.add(scene.media(photo.mediaId())));
        return photos.stream().filter(Objects::nonNull).toList();
    }

    private static OurStoryMomentResponse moment(Scene scene, EntryRow row) {
        Moment moment = row.as(Moment.class);
        return new OurStoryMomentResponse(
                row.id(),
                row.day(),
                moment.precision() == null ? "day" : moment.precision(),
                moment.label(),
                moment.title(),
                moment.text(),
                Boolean.TRUE.equals(moment.star()),
                moment.from(),
                photos(scene, row),
                scene.brief(row.authorId()),
                scene.isMe(row.authorId()));
    }

    @Override
    public Object entry(Scene scene, EntryRow entry) {
        return entry.is(MOMENT) ? moment(scene, entry) : null;
    }

    @Override
    public String findable(Scene scene, EntryRow entry) {
        if (!entry.is(MOMENT)) {
            return null;
        }
        Moment moment = entry.as(Moment.class);
        return moment.title()
                + (moment.label() == null ? "" : " · " + moment.label())
                + (moment.text() == null ? "" : " · " + moment.text());
    }

    // ---------- changing it ----------

    private static Moment moment(Fields sent, Moment now) {
        String title = sent.text("title", 120, now.title());
        if (title == null) {
            throw ApiProblem.badRequest("missing_title", "Give the moment a name.");
        }
        String precision = sent.text("precision", 10, now.precision());
        if (precision != null && !PRECISIONS.contains(precision)) {
            throw ApiProblem.badRequest("invalid_precision", "Choose a day, a month or a year.");
        }
        String from = sent.text("from", 20, now.from());
        if (from != null && !from.equals("journey")) {
            throw ApiProblem.badRequest("invalid_from", "A moment can come from a journey, or from nowhere.");
        }
        return new Moment(
                title,
                sent.text("text", 2000, now.text()),
                sent.text("label", 60, now.label()),
                precision == null ? "day" : precision,
                sent.flag("star", Boolean.TRUE.equals(now.star())),
                from);
    }

    private static LocalDate day(Scene scene, Fields sent, LocalDate otherwise) {
        LocalDate day = sent.day("day", otherwise);
        if (day == null || day.isAfter(scene.today())) {
            throw ApiProblem.badRequest("invalid_day", "Choose when it was. It has to be today or earlier.");
        }
        return day;
    }

    @Override
    public UUID add(Scene scene, String kind, Fields sent, UUID clientId) {
        switch (kind) {
            case MOMENT -> {
                LocalDate day = day(scene, sent, null);
                return scene.add(
                        EntryDraft.of(MOMENT)
                                .by(scene.myId())
                                .day(day)
                                .position(scene.positionOn(day))
                                .media(scene.upload(sent.id("mediaId"), MediaKind.PHOTO))
                                .doc(moment(sent, new Moment(null, null, null, null, null, null))),
                        clientId);
            }
            case PHOTO -> {
                EntryRow moment = scene.need(sent.id("momentId"));
                UUID media = scene.upload(sent.id("mediaId"), MediaKind.PHOTO);
                if (!moment.is(MOMENT) || media == null) {
                    throw ApiProblem.badRequest("missing_file", "Add the photo first.");
                }
                return scene.add(
                        EntryDraft.of(PHOTO).under(moment.id()).by(scene.myId()).media(media), clientId);
            }
            default -> throw BoardRules.unknownKind();
        }
    }

    @Override
    public void change(Scene scene, EntryRow entry, Fields sent) {
        if (!entry.is(MOMENT)) {
            throw BoardRules.unknownKind();
        }
        LocalDate day = day(scene, sent, entry.day());
        EntryDraft draft = EntryDraft.from(entry)
                .day(day)
                .position(day.equals(entry.day()) ? entry.position() : scene.positionOn(day))
                .doc(moment(sent, entry.as(Moment.class)));
        if (sent.has("mediaId")) {
            draft.media(scene.upload(sent.id("mediaId"), MediaKind.PHOTO));
        }
        scene.save(entry, draft);
    }

    // ---------- what it brings to the rest ----------

    private static String days(long days) {
        return String.format(Locale.ENGLISH, "%,d", days) + (days == 1 ? " day" : " days");
    }

    @Override
    public String glance(Scene scene) {
        LocalDate since = since(scene);
        String moments = Words.count(scene.entries(MOMENT).size(), "moment");
        return since == null ? moments : days(ChronoUnit.DAYS.between(since, scene.today())) + " · " + moments;
    }

    /** "4,503 days", since what it began with, over the first photo there is. */
    @Override
    public List<TodayCard> cards(Scene scene) {
        LocalDate since = since(scene);
        if (since == null || scene.me() == null) {
            return List.of();
        }
        String words = scene.settings(OurStorySettings.class).sinceWords();
        String picture = scene.entries(MOMENT).stream()
                .flatMap(row -> photos(scene, row).stream())
                .map(BoardMedia::url)
                .findFirst()
                .orElse(null);
        return List.of(Phrases.card(
                scene,
                scene.title(),
                "Since " + (words != null ? words : Words.day(since)),
                days(ChronoUnit.DAYS.between(since, scene.today())),
                picture,
                null,
                20));
    }
}

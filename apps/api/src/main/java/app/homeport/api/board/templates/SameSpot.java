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
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.LocalDate;
import java.time.MonthDay;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * Same spot, every year: one photo a year of the same place. The board hands back last year's photo, so the
 * phone's camera can lay it faintly over the picture being taken and everyone stands where they stood.
 * Laying it over is the phone's work; the API keeps one photo per year and says which one came last.
 *
 * <p>Nothing here is secret: everyone who sees the board sees every year.
 */
@Component
class SameSpot implements BoardRules {

    static final String PHOTO = "photo";

    record SameSpotSettings(
            @Schema(nullable = true, description = "The day of the year it is usually taken, as MM-dd: 09-01")
            String around) {}

    record Shot(String note) {}

    record SameSpotView(
            int thisYear,
            boolean takenThisYear,

            @Schema(
                    nullable = true,
                    description = "The newest photo from before this year: the one to lay over the camera")
            SameSpotShot last,

            @Schema(description = "Every year there is a photo for, oldest first. One a year, so a few dozen at most.")
            List<SameSpotShot> years,

            @Schema(nullable = true, description = "The day of the year it is usually taken, as MM-dd")
            String around) {}

    record SameSpotShot(
            UUID id,
            int year,
            LocalDate day,
            BoardMedia photo,
            @Schema(nullable = true) String note) {}

    @Override
    public Template template() {
        return Template.SAME_SPOT;
    }

    @Override
    public Class<?> settingsType() {
        return SameSpotSettings.class;
    }

    @Override
    public Class<?> viewType() {
        return SameSpotView.class;
    }

    @Override
    public List<String> guide() {
        return List.of(
                "settings: around (the day of the year it is usually taken, as MM-dd, or null)",
                "entry photo: mediaId (a photo upload), year (left out: this year), day (left out: today), note");
    }

    @Override
    public Object settings(Scene scene, Fields sent) {
        String now =
                scene.isNew() ? null : scene.settings(SameSpotSettings.class).around();
        String around = sent.text("around", 5, now);
        if (around != null) {
            try {
                MonthDay.parse("--" + around);
            } catch (RuntimeException notADay) {
                throw ApiProblem.badRequest("invalid_day", "Choose a day of the year, like 1 September.");
            }
        }
        return new SameSpotSettings(around);
    }

    // ---------- what a person sees ----------

    private static List<SameSpotShot> shots(Scene scene) {
        return scene.entries(PHOTO).stream()
                .sorted(Comparator.comparingLong(e -> e.amountOr(0)))
                .map(e -> {
                    BoardMedia photo = scene.media(e.mediaId());
                    return photo == null
                            ? null
                            : new SameSpotShot(
                                    e.id(),
                                    (int) e.amountOr(0),
                                    e.day(),
                                    photo,
                                    e.as(Shot.class).note());
                })
                .filter(Objects::nonNull)
                .toList();
    }

    @Override
    public Object view(Scene scene, String show) {
        int thisYear = scene.today().getYear();
        List<SameSpotShot> shots = shots(scene);
        return new SameSpotView(
                thisYear,
                shots.stream().anyMatch(s -> s.year() == thisYear),
                shots.stream()
                        .filter(s -> s.year() < thisYear)
                        .max(Comparator.comparingInt(SameSpotShot::year))
                        .orElse(null),
                shots,
                scene.settings(SameSpotSettings.class).around());
    }

    @Override
    public String findable(Scene scene, EntryRow entry) {
        return entry.as(Shot.class).note();
    }

    // ---------- changing it ----------

    @Override
    public UUID add(Scene scene, String kind, Fields sent, UUID clientId) {
        if (!kind.equals(PHOTO)) {
            throw BoardRules.unknownKind();
        }
        LocalDate day = sent.day("day", scene.today());
        if (day == null || day.isAfter(scene.today())) {
            throw ApiProblem.badRequest("invalid_day", "Choose the day it was taken. It can't be after today.");
        }
        long year = sent.whole("year", 1900, scene.today().getYear(), (long) day.getYear());
        if (scene.entries(PHOTO).stream().anyMatch(e -> e.amountOr(0) == year)) {
            throw ApiProblem.conflict(
                    "year_taken", "There is a photo for " + year + " already. Change that one, or remove it first.");
        }
        UUID photo = scene.upload(sent.id("mediaId"), MediaKind.PHOTO);
        if (photo == null) {
            throw ApiProblem.badRequest("missing_file", "Add the photo first.");
        }
        return scene.add(
                EntryDraft.of(PHOTO)
                        .by(scene.myId())
                        .amount(year)
                        .day(day)
                        .position(year)
                        .media(photo)
                        .doc(new Shot(sent.text("note", 200))),
                clientId);
    }

    @Override
    public void change(Scene scene, EntryRow entry, Fields sent) {
        EntryDraft draft = EntryDraft.from(entry);
        if (sent.has("mediaId")) {
            UUID photo = scene.upload(sent.id("mediaId"), MediaKind.PHOTO);
            if (photo == null) {
                throw ApiProblem.badRequest("missing_file", "Add the photo first.");
            }
            draft.media(photo);
        }
        LocalDate day = sent.day("day", entry.day());
        scene.save(
                entry,
                draft.day(day == null ? entry.day() : day)
                        .doc(new Shot(
                                sent.text("note", 200, entry.as(Shot.class).note()))));
    }

    // ---------- what it brings to the rest ----------

    @Override
    public String glance(Scene scene) {
        List<SameSpotShot> shots = shots(scene);
        if (shots.isEmpty()) {
            return "No photo yet";
        }
        int first = shots.get(0).year();
        int last = shots.get(shots.size() - 1).year();
        return Words.count(shots.size(), "year") + " · "
                + (first == last ? String.valueOf(first) : first + " to " + last);
    }

    /** On the day of the year it is usually taken, while this year's photo is still missing. */
    @Override
    public List<TodayItem> today(Scene scene) {
        String around = scene.settings(SameSpotSettings.class).around();
        if (around == null || !MonthDay.parse("--" + around).equals(MonthDay.from(scene.today()))) {
            return List.of();
        }
        int thisYear = scene.today().getYear();
        if (scene.entries(PHOTO).stream().anyMatch(e -> e.amountOr(0) == thisYear)) {
            return List.of();
        }
        return List.of(new TodayItem(
                scene.boardId(),
                ThingKind.BOARD,
                scene.title(),
                "Time for this year's photo, in the same spot",
                null,
                false,
                1440,
                List.of()));
    }
}

package app.homeport.api.board.templates;

import app.homeport.api.board.BoardMedia;
import app.homeport.api.board.BoardRules;
import app.homeport.api.board.EntryDraft;
import app.homeport.api.board.EntryRow;
import app.homeport.api.board.Fields;
import app.homeport.api.board.Person;
import app.homeport.api.board.Scene;
import app.homeport.api.board.Template;
import app.homeport.api.circle.MemberKind;
import app.homeport.api.common.ApiProblem;
import app.homeport.api.media.MediaKind;
import app.homeport.api.thing.ThingService.PersonBrief;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.stereotype.Component;

/**
 * The doorframe: height marks per child, each with its date, and the comparisons a child cares about.
 *
 * <p>Heights are kept in millimetres, so half a centimetre is a whole number. What is worked out from the
 * marks (in {@link Growth}, plain sums with their own tests):
 *
 * <ul>
 *   <li>how much someone grew since their mark before;
 *   <li>how much since their last birthday: against the mark nearest that birthday, when there is one within
 *       sixty days of it;
 *   <li>how much this calendar year, and whether that is their most in any year;
 *   <li>the tallest landmark they have reached ("Up to Grandma Astrid's shoulder": a line the family adds
 *       with its own height);
 *   <li>when a taller child was the height a shorter one is now, read off the line between their two nearest
 *       marks: "Mia was Leo's height in the spring of 2023". Seasons are the northern ones.
 * </ul>
 *
 * <p>Nothing here is secret: everyone who sees the doorframe sees every mark.
 */
@Component
class Doorframe implements BoardRules {

    static final String MARK = "mark";
    static final String LANDMARK = "landmark";

    record DoorframeSettings() {}

    record Note(String note) {}

    record Landmark(String text) {}

    record DoorframeView(
            @Schema(description = "Every mark, tallest first: the ruler. A few hundred at most.")
            List<DoorframeMark> marks,

            @Schema(description = "One card per person who has a mark, tallest first")
            List<DoorframeChild> children,

            @Schema(description = "Ready sentences: Mia was Leo's height in the spring of 2023.")
            List<String> comparisons,

            @Schema(description = "The family's own lines to measure against, tallest first")
            List<DoorframeLandmark> landmarks) {}

    record DoorframeMark(
            UUID id,
            @Schema(nullable = true) PersonBrief person,
            long heightMm,
            LocalDate day,
            @Schema(nullable = true) String note,
            @Schema(nullable = true) BoardMedia photo,

            @Schema(nullable = true, description = "How much they grew since their mark before this one")
            Long grewMm,

            @Schema(description = "True for a person's newest mark")
            boolean latest) {}

    record DoorframeChild(
            PersonBrief person,
            long heightMm,
            LocalDate measuredOn,

            @Schema(nullable = true, description = "Growth since the mark before, and that mark's day")
            Long sinceLastMm,

            @Schema(nullable = true) LocalDate lastMarkOn,

            @Schema(nullable = true, description = "Growth since the last birthday, when there is a mark near it")
            Long sinceBirthdayMm,

            @Schema(nullable = true, description = "Growth in this calendar year")
            Long thisYearMm,

            @Schema(description = "True when this year's growth is their most in any year")
            boolean mostYet,

            @Schema(nullable = true, description = "The tallest landmark reached: Up to Grandma Astrid's shoulder")
            String landmark,

            @Schema(description = "The same as ready sentences: 6 cm since the last birthday")
            List<String> lines) {}

    record DoorframeLandmark(UUID id, String text, long heightMm) {}

    @Override
    public Template template() {
        return Template.DOORFRAME;
    }

    @Override
    public Class<?> settingsType() {
        return DoorframeSettings.class;
    }

    @Override
    public Class<?> viewType() {
        return DoorframeView.class;
    }

    @Override
    public List<String> guide() {
        return List.of(
                "settings: none",
                "entry mark: memberId, heightMm (300 to 2500), day (left out: today), note, mediaId (a photo upload)",
                "entry landmark: text (Up to Grandma Astrid's shoulder), heightMm");
    }

    @Override
    public Object settings(Scene scene, Fields sent) {
        return new DoorframeSettings();
    }

    // ---------- the sums ----------

    /** The sums of the doorframe, on plain numbers and days. */
    static final class Growth {

        /** One mark: a height on a day. */
        record Point(LocalDate day, long mm) {}

        private Growth() {}

        /** Growth since the mark before the newest. Null with fewer than two marks. Marks are oldest first. */
        static Long sinceLast(List<Point> marks) {
            return marks.size() < 2
                    ? null
                    : marks.get(marks.size() - 1).mm()
                            - marks.get(marks.size() - 2).mm();
        }

        /** The last birthday on or before a day. */
        static LocalDate lastBirthday(LocalDate birthday, LocalDate today) {
            LocalDate thisYear = birthday.withYear(today.getYear());
            return thisYear.isAfter(today) ? birthday.withYear(today.getYear() - 1) : thisYear;
        }

        /**
         * Growth since the last birthday: the newest mark against the mark nearest that birthday, when one lies
         * within sixty days of it and isn't the newest mark itself.
         */
        static Long sinceBirthday(List<Point> marks, LocalDate birthday, LocalDate today) {
            if (birthday == null || marks.size() < 2) {
                return null;
            }
            LocalDate last = lastBirthday(birthday, today);
            Point newest = marks.get(marks.size() - 1);
            return marks.subList(0, marks.size() - 1).stream()
                    .filter(p -> Math.abs(ChronoUnit.DAYS.between(p.day(), last)) <= 60)
                    .min(Comparator.comparingLong(p -> Math.abs(ChronoUnit.DAYS.between(p.day(), last))))
                    .map(p -> newest.mm() - p.mm())
                    .orElse(null);
        }

        /** Growth per calendar year: each step between two marks counts for the year of the later one. */
        static Map<Integer, Long> perYear(List<Point> marks) {
            Map<Integer, Long> years = new TreeMap<>();
            for (int i = 1; i < marks.size(); i++) {
                years.merge(
                        marks.get(i).day().getYear(),
                        marks.get(i).mm() - marks.get(i - 1).mm(),
                        Long::sum);
            }
            return years;
        }

        /** True when a year's growth is the most of any year, with at least one other year to compare with. */
        static boolean mostYet(Map<Integer, Long> perYear, int year) {
            Long thisYear = perYear.get(year);
            return thisYear != null
                    && thisYear > 0
                    && perYear.size() > 1
                    && perYear.values().stream().allMatch(other -> other <= thisYear);
        }

        /**
         * The day someone was a given height, read off the line between the two marks it lies between. Null
         * when they were never measured both below and at or above it.
         */
        static LocalDate whenAt(List<Point> marks, long mm) {
            for (int i = 1; i < marks.size(); i++) {
                Point before = marks.get(i - 1);
                Point after = marks.get(i);
                if (before.mm() <= mm && mm <= after.mm() && after.mm() > before.mm()) {
                    long days = ChronoUnit.DAYS.between(before.day(), after.day());
                    return before.day()
                            .plusDays(Math.round(days * (double) (mm - before.mm()) / (after.mm() - before.mm())));
                }
            }
            return null;
        }

        /** "the spring of 2023". The northern seasons; December counts for the winter of its own year. */
        static String season(LocalDate day) {
            String season = switch (day.getMonthValue()) {
                case 3, 4, 5 -> "spring";
                case 6, 7, 8 -> "summer";
                case 9, 10, 11 -> "autumn";
                default -> "winter";
            };
            return "the " + season + " of " + day.getYear();
        }

        /** 60 mm is "6", 65 mm is "6.5". */
        static String cm(long mm) {
            return mm % 10 == 0 ? String.valueOf(mm / 10) : (mm / 10) + "." + Math.abs(mm % 10);
        }
    }

    // ---------- what a person sees ----------

    @Override
    public Object view(Scene scene, String show) {
        List<EntryRow> marks = scene.entries(MARK).stream()
                .filter(m -> m.forId() != null && m.amount() != null && m.day() != null)
                .sorted(Comparator.comparing(EntryRow::day).thenComparing(EntryRow::id))
                .toList();
        Map<UUID, List<EntryRow>> byPerson =
                marks.stream().collect(Collectors.groupingBy(EntryRow::forId, LinkedHashMap::new, Collectors.toList()));
        List<DoorframeLandmark> landmarks = scene.entries(LANDMARK).stream()
                .sorted(Comparator.comparingLong((EntryRow l) -> l.amountOr(0)).reversed())
                .map(l -> new DoorframeLandmark(l.id(), l.as(Landmark.class).text(), l.amountOr(0)))
                .toList();

        List<DoorframeMark> ruler = new ArrayList<>();
        List<DoorframeChild> children = new ArrayList<>();
        Map<UUID, List<Growth.Point>> points = new LinkedHashMap<>();
        byPerson.forEach((who, theirs) -> {
            List<Growth.Point> line = theirs.stream()
                    .map(m -> new Growth.Point(m.day(), m.amount()))
                    .toList();
            points.put(who, line);
            for (int i = 0; i < theirs.size(); i++) {
                EntryRow mark = theirs.get(i);
                ruler.add(new DoorframeMark(
                        mark.id(),
                        scene.brief(who),
                        mark.amount(),
                        mark.day(),
                        mark.as(Note.class).note(),
                        scene.media(mark.mediaId()),
                        i == 0 ? null : mark.amount() - theirs.get(i - 1).amount(),
                        i == theirs.size() - 1));
            }
            if (scene.brief(who) != null) {
                children.add(child(scene, who, line, landmarks));
            }
        });
        ruler.sort(Comparator.comparingLong(DoorframeMark::heightMm).reversed());
        children.sort(Comparator.comparingLong(DoorframeChild::heightMm).reversed());
        return new DoorframeView(ruler, children, comparisons(scene, points), landmarks);
    }

    private static DoorframeChild child(
            Scene scene, UUID who, List<Growth.Point> line, List<DoorframeLandmark> landmarks) {
        Person person = scene.person(who);
        Growth.Point newest = line.get(line.size() - 1);
        Long sinceLast = Growth.sinceLast(line);
        Long sinceBirthday = Growth.sinceBirthday(line, person.birthday(), scene.today());
        Map<Integer, Long> perYear = Growth.perYear(line);
        Long thisYear = perYear.get(scene.today().getYear());
        boolean mostYet = Growth.mostYet(perYear, scene.today().getYear());
        String landmark = landmarks.stream()
                .filter(l -> l.heightMm() <= newest.mm())
                .findFirst()
                .map(DoorframeLandmark::text)
                .orElse(null);
        // One line about growing, the most telling there is, and then the landmark.
        List<String> lines = new ArrayList<>();
        if (sinceBirthday != null && sinceBirthday > 0) {
            lines.add(Growth.cm(sinceBirthday) + " cm since the last birthday");
        } else if (thisYear != null && thisYear > 0) {
            lines.add(Growth.cm(thisYear) + " cm this year" + (mostYet ? ", the most yet" : ""));
        } else if (sinceLast != null && sinceLast > 0) {
            lines.add(Growth.cm(sinceLast) + " cm since the last mark");
        }
        if (landmark != null) {
            lines.add(landmark);
        }
        return new DoorframeChild(
                scene.brief(who),
                newest.mm(),
                newest.day(),
                sinceLast,
                line.size() < 2 ? null : line.get(line.size() - 2).day(),
                sinceBirthday,
                thisYear,
                mostYet,
                landmark,
                lines);
    }

    /** For every taller and shorter pair: when the taller one was the height the shorter one is now. */
    private static List<String> comparisons(Scene scene, Map<UUID, List<Growth.Point>> points) {
        List<String> sentences = new ArrayList<>();
        points.forEach((taller, theirs) -> points.forEach((shorter, others) -> {
            long now = others.get(others.size() - 1).mm();
            if (!taller.equals(shorter) && theirs.get(theirs.size() - 1).mm() > now) {
                LocalDate when = Growth.whenAt(theirs, now);
                if (when != null && scene.brief(taller) != null && scene.brief(shorter) != null) {
                    sentences.add(scene.firstName(taller) + " was "
                            + app.homeport.api.board.Words.of(scene.firstName(shorter)) + " height in "
                            + Growth.season(when) + ".");
                }
            }
        }));
        return sentences;
    }

    @Override
    public String findable(Scene scene, EntryRow entry) {
        return entry.is(LANDMARK)
                ? entry.as(Landmark.class).text()
                : entry.as(Note.class).note();
    }

    // ---------- changing it ----------

    private static LocalDate day(Scene scene, Fields sent, LocalDate otherwise) {
        LocalDate day = sent.day("day", otherwise);
        if (day == null || day.isAfter(scene.today())) {
            throw ApiProblem.badRequest("invalid_day", "Choose the day of the mark. It can't be after today.");
        }
        return day;
    }

    private static long height(Fields sent, Long otherwise) {
        Long mm = sent.whole("heightMm", 300, 2500, otherwise);
        if (mm == null) {
            throw ApiProblem.badRequest("missing_height", "Say how tall, in millimetres: 1380 for 138 cm.");
        }
        return mm;
    }

    @Override
    public UUID add(Scene scene, String kind, Fields sent, UUID clientId) {
        switch (kind) {
            case MARK -> {
                UUID who = scene.inCircle(sent.id("memberId"));
                if (who == null || scene.person(who).kind() == MemberKind.PET) {
                    throw ApiProblem.badRequest("missing_person", "Choose whose mark this is.");
                }
                LocalDate day = day(scene, sent, scene.today());
                return scene.add(
                        EntryDraft.of(MARK)
                                .by(scene.myId())
                                .forMember(who)
                                .amount(height(sent, null))
                                .day(day)
                                .position(day.toEpochDay())
                                .media(scene.upload(sent.id("mediaId"), MediaKind.PHOTO))
                                .doc(new Note(sent.text("note", 200))),
                        clientId);
            }
            case LANDMARK -> {
                if (scene.entries(LANDMARK).size() >= 50) {
                    throw ApiProblem.conflict("too_many", "Fifty lines to measure against is plenty.");
                }
                return scene.add(
                        EntryDraft.of(LANDMARK)
                                .by(scene.myId())
                                .amount(height(sent, null))
                                .doc(new Landmark(
                                        sent.need("text", 80, "Write what it is: “Up to Grandma's shoulder”."))),
                        clientId);
            }
            default -> throw BoardRules.unknownKind();
        }
    }

    @Override
    public void change(Scene scene, EntryRow entry, Fields sent) {
        EntryDraft draft = EntryDraft.from(entry).amount(height(sent, entry.amount()));
        if (entry.is(LANDMARK)) {
            String text = sent.text("text", 80, entry.as(Landmark.class).text());
            if (text == null) {
                throw ApiProblem.badRequest("missing_text", "Write what it is: “Up to Grandma's shoulder”.");
            }
            scene.save(entry, draft.doc(new Landmark(text)));
            return;
        }
        LocalDate day = day(scene, sent, entry.day());
        if (sent.has("mediaId")) {
            draft.media(scene.upload(sent.id("mediaId"), MediaKind.PHOTO));
        }
        scene.save(
                entry,
                draft.day(day)
                        .position(day.toEpochDay())
                        .doc(new Note(
                                sent.text("note", 200, entry.as(Note.class).note()))));
    }

    // ---------- what it brings to the rest ----------

    @Override
    public String glance(Scene scene) {
        Map<UUID, EntryRow> newest = new LinkedHashMap<>();
        scene.entries(MARK).stream()
                .filter(m -> m.forId() != null && m.amount() != null && m.day() != null)
                .sorted(Comparator.comparing(EntryRow::day))
                .forEach(m -> newest.put(m.forId(), m));
        if (newest.isEmpty()) {
            return "No marks yet";
        }
        return newest.values().stream()
                .sorted(Comparator.comparingLong((EntryRow m) -> m.amount()).reversed())
                .limit(3)
                .map(m -> scene.firstName(m.forId()) + " " + Growth.cm(m.amount()) + " cm")
                .collect(Collectors.joining(" · "));
    }
}

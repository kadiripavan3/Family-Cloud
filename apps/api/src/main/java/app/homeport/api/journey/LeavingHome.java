package app.homeport.api.journey;

import app.homeport.api.common.Codes;
import app.homeport.api.media.MediaKind;
import app.homeport.api.thing.Audience;
import app.homeport.api.thing.ThingKind;
import com.fasterxml.jackson.annotation.JsonValue;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;

/**
 * "Before it leaves home": the one check that stands between what a circle keeps and a journey other people
 * can read. A family album and a public feed are different promises, so nothing goes to Journey that has
 * not been through here.
 *
 * <p>That is held by the types, not by good intentions. Journey only takes a {@link Checked} draft
 * ({@link JourneyPort#post}), and a {@code Checked} draft can only be made by {@link #check}: its constructor
 * is private to this class.
 *
 * <p>The rules, in full:
 *
 * <ul>
 *   <li><b>Only photos and videos.</b> A document, a bill, a page, a password or anything else is never sent,
 *       and no switch brings it back.
 *   <li><b>Children.</b> A photo or video that is about a child of the circle (someone tagged it with them)
 *       is left out while "leave out the children" is on. It starts on.
 *   <li><b>Home.</b> A photo or video taken within the circle's home place is left out while "skip photos
 *       taken at home" is on. It starts on. A circle that hasn't said where home is has nothing to go by, and
 *       the screen says so.
 *   <li><b>One by one.</b> Something left out for one of those two reasons goes after all when its own switch
 *       is turned back on. Something its writer dropped stays dropped.
 *   <li><b>The town, not the spot.</b> While this is on (it starts on), a day says the name of its place and a
 *       point rounded to about a kilometre, and Journey is told to show it as a town. Photos travel as the
 *       copy this app made afresh, which carries nothing of where it was taken; a video travels as it is.
 *   <li><b>Clips.</b> Journey takes clips of up to {@value #LONGEST_CLIP_S} seconds. A longer video stays.
 *   <li><b>Flags.</b> What is "only you", what is hidden from someone today, and what someone else added is
 *       pointed out, so its sender looks twice. A flag leaves nothing out by itself.
 * </ul>
 */
public final class LeavingHome {

    /** Journey's own limit for a clip. */
    public static final int LONGEST_CLIP_S = 60;

    /** A point is rounded to this many decimals when only the town is shown: about a kilometre. */
    static final int TOWN_DECIMALS = 2;

    private LeavingHome() {}

    /** Why something stays home. */
    public enum LeftOut {
        /** It is about a child. */
        CHILD,
        /** It was taken at home. */
        HOME,
        /** Its writer dropped it from the draft. */
        DROPPED,
        /** It isn't a photo or a video. */
        NOT_A_PHOTO,
        /** A video longer than Journey takes. */
        TOO_LONG;

        @JsonValue
        public String code() {
            return Codes.of(this);
        }

        /** True for the reasons a person may overrule for one photo. */
        boolean canGoAfterAll() {
            return this == CHILD || this == HOME;
        }
    }

    /** What to look at twice. */
    public enum LeavingFlag {
        ONLY_YOU,
        HIDDEN,
        SOMEONE_ELSES;

        @JsonValue
        public String code() {
            return Codes.of(this);
        }
    }

    /**
     * One thing in a draft, as the check needs to know it.
     *
     * @param storageKey where the bytes to send are: a photo's copy made afresh by this app, or the video
     * @param dropped its writer took it out of the draft
     * @param backOn its writer switched it back on after a rule left it out
     */
    public record Candidate(
            UUID itemId,
            ThingKind kind,
            LocalDate day,
            int position,
            Audience audience,
            boolean hiddenFromSomeone,
            boolean mine,
            boolean aboutChild,
            Double lat,
            Double lng,
            String place,
            MediaKind mediaKind,
            String storageKey,
            String contentType,
            Integer width,
            Integer height,
            Integer durationSeconds,
            boolean dropped,
            boolean backOn) {}

    public record Switches(boolean leaveOutChildren, boolean townOnly, boolean skipHome) {

        /** How every draft starts: everything that can be left out is left out. */
        public static final Switches CAREFUL = new Switches(true, true, true);
    }

    /** Where home is, and how far around it still counts as home. */
    public record Home(double lat, double lng, int radiusM) {}

    /**
     * The words of one day.
     *
     * @param lat a point for a day that has no photos to take one from (a planned stop of a trip)
     */
    public record DayWords(LocalDate day, String line, String place, Double lat, Double lng) {}

    public record Verdict(UUID itemId, boolean goes, List<LeftOut> leftOut, List<LeavingFlag> flags) {}

    public record Outcome(Checked draft, List<Verdict> verdicts) {}

    /**
     * Checks a draft. The answer holds what would go ({@link Outcome#draft()}) and, for every thing in the
     * draft, whether it goes and why not ({@link Outcome#verdicts()}).
     *
     * @param startsOn the journey's first day; null for the first day that has something going
     * @param wordsAlone true for a draft that is a plan (a trip before it starts): its days go with their
     *     words and places although they have no photos. Otherwise a day goes only with a photo.
     * @param home null when the circle hasn't said where home is
     */
    public static Outcome check(
            UUID draftId,
            String title,
            JourneyVisibility visibility,
            List<DayWords> days,
            List<Candidate> candidates,
            Switches switches,
            Home home,
            List<UUID> coAuthors,
            LocalDate startsOn,
            boolean wordsAlone) {
        List<Verdict> verdicts = new ArrayList<>();
        List<Candidate> going = new ArrayList<>();
        for (Candidate one : candidates) {
            List<LeftOut> why = new ArrayList<>();
            boolean pictures = one.kind() == ThingKind.PHOTO || one.kind() == ThingKind.VIDEO;
            if (!pictures
                    || one.storageKey() == null
                    || one.mediaKind() == null
                    || (one.mediaKind() != MediaKind.PHOTO && one.mediaKind() != MediaKind.VIDEO)) {
                why.add(LeftOut.NOT_A_PHOTO);
            } else if (one.mediaKind() == MediaKind.VIDEO
                    && one.durationSeconds() != null
                    && one.durationSeconds() > LONGEST_CLIP_S) {
                why.add(LeftOut.TOO_LONG);
            }
            if (one.dropped()) {
                why.add(LeftOut.DROPPED);
            }
            if (switches.leaveOutChildren() && one.aboutChild() && !one.backOn()) {
                why.add(LeftOut.CHILD);
            }
            if (switches.skipHome() && atHome(one.lat(), one.lng(), home) && !one.backOn()) {
                why.add(LeftOut.HOME);
            }
            List<LeavingFlag> flags = new ArrayList<>();
            if (one.audience() == Audience.ME) {
                flags.add(LeavingFlag.ONLY_YOU);
            }
            if (one.hiddenFromSomeone()) {
                flags.add(LeavingFlag.HIDDEN);
            }
            if (!one.mine()) {
                flags.add(LeavingFlag.SOMEONE_ELSES);
            }
            verdicts.add(new Verdict(one.itemId(), why.isEmpty(), List.copyOf(why), List.copyOf(flags)));
            if (why.isEmpty()) {
                going.add(one);
            }
        }

        List<Checked.Day> checkedDays = new ArrayList<>();
        for (DayWords words :
                days.stream().sorted(Comparator.comparing(DayWords::day)).toList()) {
            List<Candidate> shots = going.stream()
                    .filter(one -> one.day().equals(words.day()))
                    .sorted(Comparator.comparingInt(Candidate::position).thenComparing(Candidate::itemId))
                    .toList();
            if (shots.isEmpty() && !wordsAlone) {
                continue;
            }
            String place = words.place() != null && !words.place().isBlank()
                    ? words.place().trim()
                    : Days.mostNamed(shots.stream().map(Candidate::place).toList());
            double[] point = pointOf(words, shots);
            Double lat = null;
            Double lng = null;
            if (point != null && place != null) {
                lat = switches.townOnly() ? rounded(point[0]) : point[0];
                lng = switches.townOnly() ? rounded(point[1]) : point[1];
            }
            checkedDays.add(new Checked.Day(
                    words.day(),
                    words.line() == null ? "" : words.line().trim(),
                    place,
                    lat,
                    lng,
                    !switches.townOnly(),
                    shots.stream()
                            .map(one -> new Checked.Leaving(
                                    one.itemId(),
                                    one.mediaKind(),
                                    one.storageKey(),
                                    one.contentType(),
                                    one.width(),
                                    one.height(),
                                    one.durationSeconds()))
                            .toList()));
        }
        LocalDate first = startsOn != null
                ? startsOn
                : checkedDays.isEmpty() ? null : checkedDays.get(0).day();
        Checked draft = new Checked(
                draftId,
                title,
                visibility == null ? JourneyVisibility.PRIVATE : visibility,
                first,
                checkedDays,
                List.copyOf(coAuthors));
        return new Outcome(draft, List.copyOf(verdicts));
    }

    /** The middle of where the day's photos were taken; failing that, the point the day itself names. */
    private static double[] pointOf(DayWords words, List<Candidate> shots) {
        double lat = 0;
        double lng = 0;
        int located = 0;
        for (Candidate one : shots) {
            if (one.lat() != null && one.lng() != null) {
                lat += one.lat();
                lng += one.lng();
                located++;
            }
        }
        if (located > 0) {
            return new double[] {lat / located, lng / located};
        }
        return words.lat() != null && words.lng() != null ? new double[] {words.lat(), words.lng()} : null;
    }

    static double rounded(double degrees) {
        double scale = Math.pow(10, TOWN_DECIMALS);
        return Math.round(degrees * scale) / scale;
    }

    /** True when a point lies within the home place. Something that doesn't say where it was taken isn't "at home". */
    static boolean atHome(Double lat, Double lng, Home home) {
        return home != null && lat != null && lng != null && metres(lat, lng, home.lat(), home.lng()) <= home.radiusM();
    }

    /** The distance between two points on the ground, in metres. */
    static double metres(double lat1, double lng1, double lat2, double lng2) {
        double dLat = Math.toRadians(lat2 - lat1);
        double dLng = Math.toRadians(lng2 - lng1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(Math.toRadians(lat1))
                        * Math.cos(Math.toRadians(lat2))
                        * Math.sin(dLng / 2)
                        * Math.sin(dLng / 2);
        return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    /**
     * A draft that has been through the check: exactly what may be handed to Journey, and nothing else.
     * There is one way to get one: {@link LeavingHome#check}.
     */
    public static final class Checked {

        /**
         * One day as Journey will be told it.
         *
         * @param exact false when Journey is to show the town, not the spot (the point is then already rounded)
         */
        public record Day(
                LocalDate day, String line, String place, Double lat, Double lng, boolean exact, List<Leaving> shots) {}

        /** A photo or video that goes: the thing it is here, and where its bytes are. */
        public record Leaving(
                UUID itemId,
                MediaKind kind,
                String storageKey,
                String contentType,
                Integer width,
                Integer height,
                Integer durationSeconds) {}

        private final UUID draftId;
        private final String title;
        private final JourneyVisibility visibility;
        private final LocalDate startsOn;
        private final List<Day> days;
        private final List<UUID> coAuthors;

        private Checked(
                UUID draftId,
                String title,
                JourneyVisibility visibility,
                LocalDate startsOn,
                List<Day> days,
                List<UUID> coAuthors) {
            this.draftId = draftId;
            this.title = title;
            this.visibility = visibility;
            this.startsOn = startsOn;
            this.days = List.copyOf(days);
            this.coAuthors = coAuthors;
        }

        /** The draft's own id: sending the same draft twice makes one journey. */
        public UUID draftId() {
            return draftId;
        }

        public String title() {
            return title;
        }

        public JourneyVisibility visibility() {
            return visibility;
        }

        /** The journey's first day. Null only for a draft with nothing in it. */
        public LocalDate startsOn() {
            return startsOn;
        }

        public List<Day> days() {
            return days;
        }

        /** The people (by the id they sign in with) who should write in it too. */
        public List<UUID> coAuthors() {
            return coAuthors;
        }

        /** How many photos and videos go. */
        public int shots() {
            return days.stream().mapToInt(day -> day.shots().size()).sum();
        }
    }
}

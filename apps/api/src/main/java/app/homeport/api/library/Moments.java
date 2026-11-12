package app.homeport.api.library;

import app.homeport.api.thing.Audience;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.TextStyle;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

/**
 * Moments: photos and videos taken on the same day at the same place come together, whoever took them. Three
 * phones at one lake on one Saturday make one moment. Nothing is stored for it: a moment is worked out from
 * the shots a person may see, so two people can see the same Saturday with different photos in it.
 *
 * <p>The rule, in full:
 *
 * <ol>
 *   <li>Only photos and videos. A document never joins a moment.
 *   <li>A day runs from four in the morning to four the next morning, by the clock where the shot was taken.
 *       A party that runs past midnight stays one evening. A moment never crosses that line.
 *   <li>Within a day the shots are read in the order they were taken. The next shot joins the moment before
 *       it when it was taken at the same place:
 *       <ul>
 *         <li>if both it and the moment's last shot that says where it was have coordinates: when they are
 *             no more than {@value #SAME_PLACE_KM} km apart (so a walk round the lake stays together, and a
 *             drive to the next town does not);
 *         <li>otherwise, if both have a place name: when the names are the same, whatever the capitals;
 *         <li>otherwise (one of them doesn't say where, or one has only a name and the other only
 *             coordinates) time decides: it joins when no more than three hours passed since the shot before.
 *       </ul>
 *   <li>Two shots at the same place on the same day are one moment however long the pause between them, as
 *       long as nothing was taken somewhere else in between.
 * </ol>
 *
 * A moment that several people added to is named for its place ("Saturday at Lake Bled"); one person's shots
 * are named by their day ("Thursday").
 */
public final class Moments {

    /** The hour at which a day turns. */
    static final int DAY_TURNS_AT = 4;

    static final double SAME_PLACE_KM = 2.0;
    static final Duration LONG_PAUSE = Duration.ofHours(3);

    private Moments() {}

    /**
     * What the rule needs to know of one photo or video.
     *
     * @param taken the clock where it was taken
     * @param by the member who added it
     */
    public record Shot(
            UUID id,
            LocalDateTime taken,
            Double lat,
            Double lng,
            String place,
            UUID by,
            boolean video,
            Audience audience) {

        boolean located() {
            return lat != null && lng != null;
        }

        boolean named() {
            return place != null && !place.isBlank();
        }

        boolean saysWhere() {
            return located() || named();
        }
    }

    /** @param shots in the order they were taken, the oldest first; never empty */
    public record Moment(LocalDate day, List<Shot> shots) {

        public Shot oldest() {
            return shots.get(0);
        }

        public Shot newest() {
            return shots.get(shots.size() - 1);
        }

        /**
         * What a moment is asked for by: its newest shot. Any shot of it leads to it, so a link keeps working
         * when someone adds a later photo.
         */
        public UUID id() {
            return newest().id();
        }

        public boolean has(UUID shotId) {
            return shots.stream().anyMatch(s -> s.id().equals(shotId));
        }

        public int videos() {
            return (int) shots.stream().filter(Shot::video).count();
        }

        public int photos() {
            return shots.size() - videos();
        }

        /** Who added how many: the one who added most first, and among equals whoever was first there. */
        public Map<UUID, Integer> people() {
            Map<UUID, Integer> counts = new LinkedHashMap<>();
            for (Shot shot : shots) {
                counts.merge(shot.by(), 1, Integer::sum);
            }
            Map<UUID, Integer> sorted = new LinkedHashMap<>();
            counts.entrySet().stream()
                    .sorted(Map.Entry.<UUID, Integer>comparingByValue().reversed())
                    .forEach(e -> sorted.put(e.getKey(), e.getValue()));
            return sorted;
        }

        /** True when more than one person added to it. */
        public boolean shared() {
            return shots.stream().map(Shot::by).distinct().count() > 1;
        }

        /** The place most of its shots name, or null when none does. Among equals, the one named first. */
        public String place() {
            Map<String, Integer> counts = new LinkedHashMap<>();
            Map<String, String> asWritten = new LinkedHashMap<>();
            for (Shot shot : shots) {
                if (shot.named()) {
                    String key = shot.place().trim().toLowerCase(Locale.ROOT);
                    counts.merge(key, 1, Integer::sum);
                    asWritten.putIfAbsent(key, shot.place().trim());
                }
            }
            String best = null;
            for (Map.Entry<String, Integer> entry : counts.entrySet()) {
                if (best == null || entry.getValue() > counts.get(best)) {
                    best = entry.getKey();
                }
            }
            return best == null ? null : asWritten.get(best);
        }

        /** "Saturday at Lake Bled" when several people were there and the place is known, otherwise "Saturday". */
        public String title() {
            String weekday = day.getDayOfWeek().getDisplayName(TextStyle.FULL, Locale.ENGLISH);
            String place = place();
            return shared() && place != null ? weekday + " at " + place : weekday;
        }

        /** Everyone when every shot is shared with everyone, only you when none is shared, otherwise some. */
        public Audience audience() {
            if (shots.stream().allMatch(s -> s.audience() == Audience.CIRCLE)) {
                return Audience.CIRCLE;
            }
            return shots.stream().allMatch(s -> s.audience() == Audience.ME) ? Audience.ME : Audience.SOME;
        }
    }

    /** The day a shot counts for: the day before, when it was taken before four in the morning. */
    public static LocalDate dayOf(LocalDateTime taken) {
        return taken.minusHours(DAY_TURNS_AT).toLocalDate();
    }

    /** Puts shots into moments. The newest moment comes first, as on the wall. */
    public static List<Moment> group(Collection<Shot> shots) {
        List<Shot> ordered = shots.stream()
                // Shots taken at the very same moment are put in the order the database puts their ids in (by
                // their letters; Java would compare them as signed numbers), so "the newest" is the same shot
                // here and on the wall.
                .sorted(Comparator.comparing(Shot::taken)
                        .thenComparing(shot -> shot.id().toString()))
                .toList();
        List<Moment> moments = new ArrayList<>();
        List<Shot> current = new ArrayList<>();
        Shot where = null; // the current moment's last shot that says where it was taken
        for (Shot shot : ordered) {
            if (!current.isEmpty() && !together(current.get(current.size() - 1), where, shot)) {
                moments.add(new Moment(dayOf(current.get(0).taken()), List.copyOf(current)));
                current.clear();
                where = null;
            }
            current.add(shot);
            if (shot.saysWhere()) {
                where = shot;
            }
        }
        if (!current.isEmpty()) {
            moments.add(new Moment(dayOf(current.get(0).taken()), List.copyOf(current)));
        }
        return moments.reversed();
    }

    /** The moment this shot is in, or null when it is in none of them. */
    public static Moment of(UUID shotId, List<Moment> moments) {
        return moments.stream().filter(m -> m.has(shotId)).findFirst().orElse(null);
    }

    private static boolean together(Shot before, Shot where, Shot next) {
        if (!dayOf(before.taken()).equals(dayOf(next.taken()))) {
            return false;
        }
        if (where != null && where.located() && next.located()) {
            return km(where.lat(), where.lng(), next.lat(), next.lng()) <= SAME_PLACE_KM;
        }
        if (where != null && where.named() && next.named()) {
            return where.place().trim().equalsIgnoreCase(next.place().trim());
        }
        return Duration.between(before.taken(), next.taken()).compareTo(LONG_PAUSE) <= 0;
    }

    /** How far apart two points on the earth are, in kilometres. */
    static double km(double lat1, double lng1, double lat2, double lng2) {
        double dLat = Math.toRadians(lat2 - lat1);
        double dLng = Math.toRadians(lng2 - lng1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(Math.toRadians(lat1))
                        * Math.cos(Math.toRadians(lat2))
                        * Math.sin(dLng / 2)
                        * Math.sin(dLng / 2);
        return 6371.0 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }
}

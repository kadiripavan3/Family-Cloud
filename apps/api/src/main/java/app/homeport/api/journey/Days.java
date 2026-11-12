package app.homeport.api.journey;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.TextStyle;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

/**
 * Sorts photos and videos into the days of a journey, by when and where each was taken, and suggests a title
 * and a first line for each day. All by rule: nothing here looks inside a picture.
 *
 * <ul>
 *   <li>A photo counts for the day the Library gave it (a day turns at four in the morning, so a late
 *       evening stays one day). Days come in order, and so do the photos inside a day.
 *   <li>A day's place is the one most of its photos name; the earliest of two equally common ones.
 *   <li>A day's first line is its weekday and its place: "Saturday at Lake Bled", or just "Saturday".
 *   <li>The title: one day is "A day at Lake Bled"; two or three days that touch a weekend are "A weekend at
 *       Lake Bled"; up to ten days are "5 days in Slovenia" (the country when the places differ); longer is
 *       "April in Iceland". Without any place the month stands in: "A weekend in November".
 * </ul>
 */
final class Days {

    private Days() {}

    /** What the rule needs to know of one photo or video. */
    record Taken(UUID id, LocalDate day, LocalDateTime at, String place, String country, boolean video) {}

    record DayOf(LocalDate day, String place, String line, List<UUID> items, int photos, int clips) {}

    record Sorted(String title, List<DayOf> days) {}

    static Sorted sort(List<Taken> taken) {
        Map<LocalDate, List<Taken>> byDay = new java.util.TreeMap<>();
        for (Taken one : taken) {
            byDay.computeIfAbsent(one.day(), day -> new ArrayList<>()).add(one);
        }
        List<DayOf> days = new ArrayList<>();
        for (Map.Entry<LocalDate, List<Taken>> entry : byDay.entrySet()) {
            List<Taken> shots = entry.getValue().stream()
                    .sorted(Comparator.comparing(Taken::at).thenComparing(Taken::id))
                    .toList();
            String place = mostNamed(shots.stream().map(Taken::place).toList());
            int clips = (int) shots.stream().filter(Taken::video).count();
            days.add(new DayOf(
                    entry.getKey(),
                    place,
                    line(entry.getKey(), place),
                    shots.stream().map(Taken::id).toList(),
                    shots.size() - clips,
                    clips));
        }
        return new Sorted(title(taken, days), days);
    }

    /** A day's first line: "Saturday at Lake Bled". */
    static String line(LocalDate day, String place) {
        String weekday = day.getDayOfWeek().getDisplayName(TextStyle.FULL, Locale.ENGLISH);
        return place == null ? weekday : weekday + " at " + place;
    }

    static String title(List<Taken> taken, List<DayOf> days) {
        if (days.isEmpty()) {
            return "A journey";
        }
        LocalDate first = days.get(0).day();
        LocalDate last = days.get(days.size() - 1).day();
        long span = java.time.temporal.ChronoUnit.DAYS.between(first, last) + 1;
        String month = first.getMonth().getDisplayName(TextStyle.FULL, Locale.ENGLISH);
        List<String> places = days.stream()
                .map(DayOf::place)
                .filter(p -> p != null)
                .distinct()
                .toList();
        String country = mostNamed(taken.stream().map(Taken::country).toList());
        // One place: "at Lake Bled". Several: the country they are in, when there is one.
        String where = places.size() == 1 ? " at " + places.get(0) : country != null ? " in " + country : null;
        String when = " in " + month;
        boolean weekend = first.datesUntil(last.plusDays(1))
                .anyMatch(d -> d.getDayOfWeek() == DayOfWeek.SATURDAY || d.getDayOfWeek() == DayOfWeek.SUNDAY);
        if (span == 1) {
            return "A day" + (where != null ? where : when);
        }
        if (span <= 3 && weekend) {
            return "A weekend" + (where != null ? where : when);
        }
        if (span <= 10) {
            return span + " days" + (where != null ? where : when);
        }
        return where != null && where.startsWith(" in ")
                ? month + where
                : span + " days" + (where != null ? where : when);
    }

    /** The name most of these carry; of two equally common ones, the one that came first. Null when none has a name. */
    static String mostNamed(List<String> names) {
        Map<String, Integer> counts = new LinkedHashMap<>();
        for (String name : names) {
            if (name != null && !name.isBlank()) {
                counts.merge(name.trim(), 1, Integer::sum);
            }
        }
        String best = null;
        int most = 0;
        for (Map.Entry<String, Integer> count : counts.entrySet()) {
            if (count.getValue() > most) {
                best = count.getKey();
                most = count.getValue();
            }
        }
        return best;
    }
}

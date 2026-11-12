package app.homeport.api.journey;

import app.homeport.api.media.MediaKind;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

/**
 * Finds, for a photo or clip that comes home from Journey, the original this person's Library already has.
 * Journey keeps a lighter copy of every photo and throws the phone's file away; the phone backed the real
 * one up here. Keeping a journey puts the two back together, so the Library holds each picture once, at full
 * size.
 *
 * <p>The rule, in full:
 *
 * <ol>
 *   <li>A photo is only ever matched to a photo, a clip to a video.
 *   <li><b>By fingerprint.</b> Where Journey knows the fingerprint of the file the phone sent (its SHA-256)
 *       and a file in the Library has the same one, they are the same file. Nothing else is looked at.
 *   <li><b>Otherwise by time and shape.</b> Journey has to say when the picture was taken; without that there
 *       is no match. The Library's files taken within {@link #WINDOW} of that moment are looked at (both
 *       apps read the same clock time from the same file, in whole seconds), and of those the ones with the
 *       same shape: for a photo, width divided by height within {@link #SHAPE_SLACK} of each other (Journey's
 *       copy is smaller, never a different shape; both apps measure a photo the right way up); for a clip,
 *       lengths within {@link #LENGTH_SLACK_S} second of each other. A photo whose size isn't known on
 *       either side has no shape to compare, and is not matched.
 *   <li>The nearest in time wins. An original is given to one picture only: when two pictures want the same
 *       one, the nearer one gets it and the other gets none.
 *   <li><b>Never a guess.</b> When two candidates are equally near (a burst: several shots in the same
 *       second, all the same shape), the picture is left unmatched. It is then brought from Journey at the
 *       size Journey has, which is a smaller copy of the right picture rather than a full-size copy of the
 *       wrong one.
 * </ol>
 */
public final class Originals {

    /** How far apart "taken at the same moment" may be: clocks are written in whole seconds. */
    static final Duration WINDOW = Duration.ofSeconds(2);

    /** How far two shapes (width divided by height) may differ and still be the same picture: rounding to whole pixels. */
    static final double SHAPE_SLACK = 0.02;

    static final int LENGTH_SLACK_S = 1;

    private Originals() {}

    /** A photo or clip as Journey tells it. */
    public record Told(
            UUID id,
            MediaKind kind,
            Instant takenAt,
            String originalHash,
            Integer width,
            Integer height,
            Integer durationSeconds) {}

    /** A photo or video the Library has. */
    public record Own(
            UUID id,
            MediaKind kind,
            Instant takenAt,
            String contentHash,
            Integer width,
            Integer height,
            Integer durationSeconds) {}

    public enum How {
        FINGERPRINT,
        TIME_AND_SHAPE
    }

    public record Match(UUID told, UUID own, How how) {}

    private record Near(Told told, Own own, long apartMs) {}

    /** For each told picture that has an original in the Library: which one, and how it was recognised. */
    public static Map<UUID, Match> match(List<Told> told, List<Own> own) {
        Map<UUID, Match> matches = new LinkedHashMap<>();
        Map<UUID, UUID> taken = new HashMap<>(); // original -> the picture it went to

        // 1. By fingerprint.
        Map<String, Own> byHash = new HashMap<>();
        for (Own file : own) {
            if (file.contentHash() != null) {
                byHash.putIfAbsent(file.kind() + ":" + file.contentHash().toLowerCase(Locale.ROOT), file);
            }
        }
        for (Told picture : told) {
            if (picture.originalHash() == null) {
                continue;
            }
            Own same = byHash.get(picture.kind() + ":" + picture.originalHash().toLowerCase(Locale.ROOT));
            if (same != null && !taken.containsKey(same.id())) {
                matches.put(picture.id(), new Match(picture.id(), same.id(), How.FINGERPRINT));
                taken.put(same.id(), picture.id());
            }
        }

        // 2. By time and shape: each picture's nearest candidate, unless two are equally near.
        List<Near> wishes = new ArrayList<>();
        for (Told picture : told) {
            if (matches.containsKey(picture.id()) || picture.takenAt() == null) {
                continue;
            }
            List<Near> near = own.stream()
                    .filter(file -> !taken.containsKey(file.id()) && sameShape(picture, file))
                    .map(file -> new Near(picture, file, apart(picture, file)))
                    .filter(candidate -> candidate.apartMs() <= WINDOW.toMillis())
                    .sorted(Comparator.comparingLong(Near::apartMs))
                    .toList();
            boolean tie =
                    near.size() > 1 && near.get(0).apartMs() == near.get(1).apartMs();
            if (!near.isEmpty() && !tie) {
                wishes.add(near.get(0));
            }
        }
        // 3. An original goes to the nearest picture that wants it; two equally near get none.
        Map<UUID, List<Near>> byOriginal = new LinkedHashMap<>();
        wishes.forEach(wish -> byOriginal
                .computeIfAbsent(wish.own().id(), id -> new ArrayList<>())
                .add(wish));
        for (List<Near> wanting : byOriginal.values()) {
            wanting.sort(Comparator.comparingLong(Near::apartMs));
            boolean tie = wanting.size() > 1
                    && wanting.get(0).apartMs() == wanting.get(1).apartMs();
            if (!tie) {
                Near winner = wanting.get(0);
                matches.put(
                        winner.told().id(),
                        new Match(winner.told().id(), winner.own().id(), How.TIME_AND_SHAPE));
            }
        }
        return matches;
    }

    private static long apart(Told picture, Own file) {
        return file.takenAt() == null
                ? Long.MAX_VALUE
                : Math.abs(Duration.between(picture.takenAt(), file.takenAt()).toMillis());
    }

    /** True when the two are the same kind of file and nothing about their shape says they differ. */
    static boolean sameShape(Told picture, Own file) {
        if (picture.kind() != file.kind()) {
            return false;
        }
        if (picture.kind() == MediaKind.VIDEO) {
            return picture.durationSeconds() != null
                    && file.durationSeconds() != null
                    && Math.abs(picture.durationSeconds() - file.durationSeconds()) <= LENGTH_SLACK_S;
        }
        Double told = shape(picture.width(), picture.height());
        Double kept = shape(file.width(), file.height());
        return told != null && kept != null && Math.abs(told - kept) <= SHAPE_SLACK * Math.max(told, kept);
    }

    private static Double shape(Integer width, Integer height) {
        return width == null || height == null || width <= 0 || height <= 0 ? null : (double) width / height;
    }
}

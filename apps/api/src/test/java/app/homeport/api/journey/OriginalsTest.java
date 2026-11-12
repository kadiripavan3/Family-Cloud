package app.homeport.api.journey;

import static org.assertj.core.api.Assertions.assertThat;

import app.homeport.api.journey.Originals.How;
import app.homeport.api.journey.Originals.Match;
import app.homeport.api.journey.Originals.Own;
import app.homeport.api.journey.Originals.Told;
import app.homeport.api.media.MediaKind;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/** The rule that finds the original of a picture that comes home from Journey, case by case. */
class OriginalsTest {

    private static final Instant NOON = Instant.parse("2026-04-01T12:00:00Z");
    private static final String PRINT = "ab".repeat(32);

    private static Told photo(Instant takenAt, String hash, Integer width, Integer height) {
        return new Told(UUID.randomUUID(), MediaKind.PHOTO, takenAt, hash, width, height, null);
    }

    private static Own original(Instant takenAt, String hash, Integer width, Integer height) {
        return new Own(UUID.randomUUID(), MediaKind.PHOTO, takenAt, hash, width, height, null);
    }

    private static Told clip(Instant takenAt, Integer seconds) {
        return new Told(UUID.randomUUID(), MediaKind.VIDEO, takenAt, null, null, null, seconds);
    }

    private static Own video(Instant takenAt, Integer seconds) {
        return new Own(UUID.randomUUID(), MediaKind.VIDEO, takenAt, null, null, null, seconds);
    }

    @Test
    void theSameFingerprintIsTheSameFileWhateverElseIsSaid() {
        // Journey's copy is smaller and says no time at all; the fingerprint is the phone's own file's.
        Told told = photo(null, PRINT.toUpperCase(), 2048, 1536);
        Own same = original(NOON, PRINT, 4032, 3024);
        Own other = original(NOON, "cd".repeat(32), 4032, 3024);

        Map<UUID, Match> matches = Originals.match(List.of(told), List.of(other, same));

        assertThat(matches.get(told.id())).isEqualTo(new Match(told.id(), same.id(), How.FINGERPRINT));
    }

    @Test
    void takenAtTheSameMomentWithTheSameShapeIsAMatch() {
        Told told = photo(NOON, null, 2048, 1536);
        Own original = original(NOON.plusSeconds(1), null, 4032, 3024);

        assertThat(Originals.match(List.of(told), List.of(original)).get(told.id()))
                .isEqualTo(new Match(told.id(), original.id(), How.TIME_AND_SHAPE));
        // Two seconds apart is still the same moment; three is another photo.
        assertThat(Originals.match(List.of(told), List.of(original(NOON.plusSeconds(2), null, 4032, 3024))))
                .hasSize(1);
        assertThat(Originals.match(List.of(told), List.of(original(NOON.plusSeconds(3), null, 4032, 3024))))
                .isEmpty();
        assertThat(Originals.match(List.of(told), List.of(original(NOON.minusSeconds(3), null, 4032, 3024))))
                .isEmpty();
    }

    @Test
    void aDifferentShapeIsADifferentPicture() {
        Told landscape = photo(NOON, null, 2048, 1536);
        // The same second, but upright, or square: not the same photo.
        assertThat(Originals.match(List.of(landscape), List.of(original(NOON, null, 3024, 4032))))
                .isEmpty();
        assertThat(Originals.match(List.of(landscape), List.of(original(NOON, null, 3024, 3024))))
                .isEmpty();
        // Rounding to whole pixels when a photo is made smaller is not a different shape.
        assertThat(Originals.match(List.of(photo(NOON, null, 2048, 1365)), List.of(original(NOON, null, 6000, 4000))))
                .hasSize(1);
    }

    @Test
    void withoutAFingerprintAndWithoutATimeNothingIsMatched() {
        // What today's Journey says of a photo: its size, and nothing else.
        Told told = photo(null, null, 2048, 1536);
        assertThat(Originals.match(List.of(told), List.of(original(NOON, PRINT, 4032, 3024))))
                .isEmpty();
    }

    @Test
    void aPhotoWhoseSizeNobodyKnowsHasNoShapeToCompare() {
        assertThat(Originals.match(List.of(photo(NOON, null, null, null)), List.of(original(NOON, null, 4032, 3024))))
                .isEmpty();
        assertThat(Originals.match(List.of(photo(NOON, null, 2048, 1536)), List.of(original(NOON, null, null, null))))
                .isEmpty();
    }

    @Test
    void aPhotoIsNeverMatchedToAVideoAndAClipIsMatchedByItsLength() {
        Told clip = clip(NOON, 12);
        Own photoThen = original(NOON, null, 4032, 3024);
        Own sameClip = video(NOON.plusSeconds(1), 13);
        Own longerClip = video(NOON, 40);

        Map<UUID, Match> matches = Originals.match(List.of(clip), List.of(photoThen, longerClip, sameClip));

        assertThat(matches.get(clip.id()).own()).isEqualTo(sameClip.id());
        // A clip whose length isn't known can't be told from another taken in the same second.
        assertThat(Originals.match(List.of(clip(NOON, null)), List.of(sameClip)))
                .isEmpty();
        // The same fingerprint on a photo and on a video is not a match either.
        Told photo = new Told(UUID.randomUUID(), MediaKind.PHOTO, null, PRINT, 10, 10, null);
        Own video = new Own(UUID.randomUUID(), MediaKind.VIDEO, null, PRINT, null, null, 5);
        assertThat(Originals.match(List.of(photo), List.of(video))).isEmpty();
    }

    @Test
    void theNearestInTimeWinsAndABurstIsLeftAlone() {
        Told told = photo(NOON, null, 2048, 1536);
        Own near = original(NOON.plusMillis(200), null, 4032, 3024);
        Own further = original(NOON.plusMillis(1800), null, 4032, 3024);
        assertThat(Originals.match(List.of(told), List.of(further, near))
                        .get(told.id())
                        .own())
                .isEqualTo(near.id());

        // Three shots in the same second, all the same shape: nobody can tell which one Journey has.
        Own burst1 = original(NOON, null, 4032, 3024);
        Own burst2 = original(NOON, null, 4032, 3024);
        assertThat(Originals.match(List.of(told), List.of(burst1, burst2))).isEmpty();
    }

    @Test
    void anOriginalGoesToOnePictureOnly() {
        Own original = original(NOON, null, 4032, 3024);
        Told nearer = photo(NOON.plusMillis(100), null, 2048, 1536);
        Told further = photo(NOON.plusMillis(900), null, 2048, 1536);

        Map<UUID, Match> matches = Originals.match(List.of(further, nearer), List.of(original));
        assertThat(matches).containsOnlyKeys(nearer.id());

        // Two pictures equally near to one original: neither gets it.
        Told left = photo(NOON.minusMillis(500), null, 2048, 1536);
        Told right = photo(NOON.plusMillis(500), null, 2048, 1536);
        assertThat(Originals.match(List.of(left, right), List.of(original))).isEmpty();

        // An original taken by fingerprint is not offered again by time.
        Told byPrint = photo(null, PRINT, 2048, 1536);
        Told byTime = photo(NOON, null, 2048, 1536);
        Own printed = original(NOON, PRINT, 4032, 3024);
        assertThat(Originals.match(List.of(byTime, byPrint), List.of(printed))).containsOnlyKeys(byPrint.id());
    }

    @Test
    void aWholeDayOfPhotosEachFindsItsOwn() {
        List<Own> library = new java.util.ArrayList<>();
        List<Told> journey = new java.util.ArrayList<>();
        for (int n = 0; n < 40; n++) {
            Instant taken = NOON.plusSeconds(90L * n);
            library.add(original(taken, null, 4032, 3024));
            journey.add(photo(taken, null, 2048, 1536));
        }
        Map<UUID, Match> matches = Originals.match(journey, library);
        assertThat(matches).hasSize(40);
        for (int n = 0; n < 40; n++) {
            assertThat(matches.get(journey.get(n).id()).own())
                    .isEqualTo(library.get(n).id());
        }
    }
}

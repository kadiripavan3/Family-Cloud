package app.homeport.api.activity;

import static org.assertj.core.api.Assertions.assertThat;

import app.homeport.api.activity.AskStore.AskRow;
import app.homeport.api.activity.AskStore.AskState;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

/** The words Activity puts together by rule: what a job is called once it is done, when something is due, how long an ask is for. */
class ActivityWordsTest {

    @ParameterizedTest
    @CsvSource({
        "Feed Biscuit, fed Biscuit",
        "Set the table, set the table",
        "Take the bins out, took the bins out",
        "Water the plants, watered the plants",
        "Tidy your room, tidied your room",
        "Empty the dishwasher, emptied the dishwasher",
        "walk Biscuit, walked Biscuit",
        "Make the beds, made the beds",
        "Laundry, finished Laundry",
        "Bins and recycling, finished Bins and recycling",
        "Homework, finished Homework",
        "Feed, finished Feed",
        "'  Hoover the stairs ', hoovered the stairs",
    })
    void aJobThatStartsWithAVerbItKnowsIsPutInThePastAndAnyOtherIsFinished(String job, String done) {
        assertThat(PastTense.of(job)).isEqualTo(done);
    }

    @Test
    void aJobWithNoNameIsStillAJob() {
        assertThat(PastTense.of("")).isEqualTo("finished a job");
        assertThat(PastTense.of(null)).isEqualTo("finished a job");
    }

    @ParameterizedTest
    @CsvSource({
        "2026-11-11, is due today",
        "2026-11-12, is due tomorrow",
        "2026-11-10, was due yesterday",
        "2026-11-09, was due on Monday",
        "2026-11-05, was due on Thursday",
        "2026-11-04, was due on Wed 4 Nov",
        "2026-10-01, was due on Thu 1 Oct",
    })
    void whenSomethingIsDueIsSaidFromToday(String on, String words) {
        assertThat(ActivityService.dueWords(LocalDate.parse(on), LocalDate.parse("2026-11-11")))
                .isEqualTo(words);
    }

    @ParameterizedTest
    @CsvSource({
        // asked at, until, once, what it says (in Ljubljana, an hour ahead of UTC in November)
        "2026-11-11T08:00:00Z, 2026-11-11T23:00:00Z, false, for today only",
        "2026-11-11T08:00:00Z, 2026-11-11T17:00:00Z, false, for today only",
        "2026-11-11T08:00:00Z, 2026-11-13T23:00:00Z, false, until Fri 13 Nov",
        "2026-11-11T23:30:00Z, 2026-11-12T23:00:00Z, false, for today only",
        "2026-11-11T08:00:00Z, , true, for one look",
        "2026-11-11T08:00:00Z, 2026-11-13T23:00:00Z, true, for one look",
    })
    void howLongAnAskIsForIsSaidByThePhonesOwnDay(String asked, String until, boolean once, String words) {
        AskRow ask = new AskRow(
                UUID.randomUUID(),
                UUID.randomUUID(),
                UUID.randomUUID(),
                UUID.randomUUID(),
                UUID.randomUUID(),
                until == null ? null : Instant.parse(until),
                once,
                AskState.OPEN,
                null,
                Instant.parse(asked));
        assertThat(ActivityService.wish(ask, ZoneId.of("Europe/Ljubljana"))).isEqualTo(words);
    }

    @Test
    void anAskWithNoWishSaysNothingMoreAndPhotosAreCounted() {
        AskRow ask = new AskRow(
                UUID.randomUUID(),
                UUID.randomUUID(),
                UUID.randomUUID(),
                UUID.randomUUID(),
                UUID.randomUUID(),
                null,
                false,
                AskState.OPEN,
                null,
                Instant.now());
        assertThat(ActivityService.wish(ask, ZoneId.of("UTC"))).isNull();
        assertThat(ActivityService.photos(1)).isEqualTo("1 photo");
        assertThat(ActivityService.photos(19)).isEqualTo("19 photos");
    }
}

package app.homeport.api.board.templates;

import static org.assertj.core.api.Assertions.assertThat;

import app.homeport.api.board.templates.FairShare.Trade;
import app.homeport.api.board.templates.PiggyBank.Due;
import app.homeport.api.board.templates.SaturdayJar.Asked;
import app.homeport.api.board.templates.SaturdayJar.Idea;
import java.time.DayOfWeek;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/**
 * The sums and small rules inside the fair-and-fun and the couple's templates, on plain values: whose turn it
 * is, interest to the cent, who has whom, what fits, sleeps and chains, reading a question, streaks, the week
 * a note hides in, a word two answers share, and a swap that brings two shares close.
 */
class FairAndFunSumsTest {

    private static LocalDate day(String iso) {
        return LocalDate.parse(iso);
    }

    /** A Wednesday in November, as in the drawings. */
    private static final LocalDate WEDNESDAY = day("2026-11-11");

    // ---------- words ----------

    @Test
    void aDayGoneByIsSaidTheWayPeopleSayIt() {
        assertThat(Phrases.ago(WEDNESDAY, WEDNESDAY)).isEqualTo("today");
        assertThat(Phrases.ago(day("2026-11-10"), WEDNESDAY)).isEqualTo("yesterday");
        assertThat(Phrases.ago(day("2026-11-09"), WEDNESDAY)).isEqualTo("on Monday");
        assertThat(Phrases.ago(day("2026-11-08"), WEDNESDAY)).isEqualTo("last Sunday");
        assertThat(Phrases.ago(day("2026-11-06"), WEDNESDAY)).isEqualTo("last Friday");
        assertThat(Phrases.ago(day("2026-11-02"), WEDNESDAY)).isEqualTo("last Monday");
        assertThat(Phrases.ago(day("2026-11-01"), WEDNESDAY)).isEqualTo("on 1 Nov");
        assertThat(Phrases.ago(day("2026-09-14"), WEDNESDAY)).isEqualTo("on 14 Sep");
        // A day that hasn't come is not "ago" at all.
        assertThat(Phrases.ago(day("2026-11-12"), WEDNESDAY)).isEqualTo("today");

        assertThat(Phrases.coming(WEDNESDAY, WEDNESDAY)).isEqualTo("Tonight");
        assertThat(Phrases.coming(day("2026-11-13"), WEDNESDAY)).isEqualTo("Friday");
        assertThat(Phrases.coming(day("2026-11-17"), WEDNESDAY)).isEqualTo("Tuesday");
        assertThat(Phrases.coming(day("2026-11-18"), WEDNESDAY)).isEqualTo("18 Nov");
    }

    @Test
    void listsNumbersAndHintsReadAsSentences() {
        assertThat(Phrases.list(List.of())).isEmpty();
        assertThat(Phrases.list(List.of("Monday"))).isEqualTo("Monday");
        assertThat(Phrases.list(List.of("Monday", "Tuesday"))).isEqualTo("Monday and Tuesday");
        assertThat(Phrases.list(List.of("Nora", "Alex", "Mia"))).isEqualTo("Nora, Alex and Mia");

        assertThat(Phrases.inWords(0)).isEqualTo("zero");
        assertThat(Phrases.inWords(12)).isEqualTo("twelve");
        assertThat(Phrases.inWords(13)).isEqualTo("thirteen");
        assertThat(Phrases.inWords(20)).isEqualTo("twenty");
        assertThat(Phrases.inWords(21)).isEqualTo("twenty-one");
        assertThat(Phrases.inWords(99)).isEqualTo("ninety-nine");
        assertThat(Phrases.inWords(100)).isEqualTo("100");
        assertThat(Phrases.inWords(-3)).isEqualTo("-3");

        assertThat(Phrases.inSentence("Wear something warm.")).isEqualTo("wear something warm");
        assertThat(Phrases.inSentence("Bring gloves")).isEqualTo("bring gloves");
        assertThat(Phrases.inSentence(".")).isEmpty();
    }

    // ---------- whose turn ----------

    @Test
    void theTurnGoesToWhoeverComesAfterTheOneWhoHadItLast() {
        List<String> two = List.of("Mia", "Leo");
        assertThat(WhoseTurn.after(two, "Mia")).isEqualTo("Leo");
        assertThat(WhoseTurn.after(two, "Leo")).isEqualTo("Mia");
        List<String> four = List.of("Nora", "Alex", "Mia", "Leo");
        assertThat(WhoseTurn.after(four, "Alex")).isEqualTo("Mia");
        assertThat(WhoseTurn.after(four, "Leo")).isEqualTo("Nora");
        // Someone who isn't one of them (they left, or just helped out): it starts again with the first.
        assertThat(WhoseTurn.after(four, "Astrid")).isEqualTo("Nora");
        assertThat(WhoseTurn.after(List.of("Kai"), "Kai")).isEqualTo("Kai");
        String nobody = WhoseTurn.after(List.<String>of(), "Kai");
        assertThat(nobody).isNull();
    }

    @Test
    void theLineUnderAThingSaysWhatHappenedLastInTheFewestWords() {
        LocalDate friday = day("2026-11-06");
        // Nothing yet: when it comes round, if anyone said; else nothing.
        assertThat(WhoseTurn.line(null, null, List.of(), null, "Every evening", WEDNESDAY))
                .isEqualTo("Every evening");
        assertThat(WhoseTurn.line(null, "chose", List.of(), null, null, WEDNESDAY))
                .isNull();
        // A past word and a note: who, did what, when, and the note.
        assertThat(WhoseTurn.line("Mia", "chose", List.of(friday), "Frozen, again", null, WEDNESDAY))
                .isEqualTo("Mia chose last Friday. Frozen, again.");
        assertThat(WhoseTurn.line("Mia", "chose", List.of(friday), "Frozen. Again.", null, WEDNESDAY))
                .isEqualTo("Mia chose last Friday. Frozen. Again.");
        // A note alone reads on from the name.
        assertThat(WhoseTurn.line("Leo", null, List.of(WEDNESDAY), "had it on the way to school", null, WEDNESDAY))
                .isEqualTo("Leo had it on the way to school");
        assertThat(WhoseTurn.line("Mia", null, List.of(friday), "went for olives last time", "Fridays", WEDNESDAY))
                .isEqualTo("Mia went for olives last time");
        // The same person several days running, this week: the days.
        assertThat(WhoseTurn.line(
                        "You", null, List.of(day("2026-11-09"), day("2026-11-10")), null, "Every morning", WEDNESDAY))
                .isEqualTo("You did Monday and Tuesday");
        assertThat(WhoseTurn.line(
                        "Alex",
                        null,
                        List.of(day("2026-11-08"), day("2026-11-09"), day("2026-11-10")),
                        "in the rain",
                        null,
                        WEDNESDAY))
                .isEqualTo("Alex did Sunday, Monday and Tuesday");
        // Two turns on the same day, or a run that goes further back than a week, isn't said as days.
        assertThat(WhoseTurn.line("Leo", null, List.of(WEDNESDAY, WEDNESDAY), null, "Every drive", WEDNESDAY))
                .isEqualTo("Every drive");
        assertThat(WhoseTurn.line("Leo", null, List.of(day("2026-10-20"), day("2026-11-10")), null, null, WEDNESDAY))
                .isEqualTo("Leo had the last turn, yesterday");
        // No note: when it comes round; with nothing to go on, who had it and when.
        assertThat(WhoseTurn.line("Leo", "went", List.of(day("2026-11-10")), null, "Every evening", WEDNESDAY))
                .isEqualTo("Every evening");
        assertThat(WhoseTurn.line("Mia", null, List.of(day("2026-11-09")), null, null, WEDNESDAY))
                .isEqualTo("Mia had the last turn, on Monday");
    }

    // ---------- the piggy bank ----------

    @Test
    void interestIsAWholeNumberOfCentsAndHalfACentGoesUp() {
        assertThat(PiggyBank.share(1200, 5)).isEqualTo(60); // €12.00 at 5%: €0.60
        assertThat(PiggyBank.share(1210, 5)).isEqualTo(61); // 60.5 cents
        assertThat(PiggyBank.share(1209, 5)).isEqualTo(60); // 60.45 cents
        assertThat(PiggyBank.share(1, 5)).isZero(); // a twentieth of a cent
        assertThat(PiggyBank.share(10, 5)).isEqualTo(1); // half a cent
        assertThat(PiggyBank.share(9, 5)).isZero();
        assertThat(PiggyBank.share(100_000_000_000L, 100)).isEqualTo(100_000_000_000L);
        assertThat(PiggyBank.share(1200, 0)).isZero();
        assertThat(PiggyBank.share(0, 5)).isZero();
        assertThat(PiggyBank.share(-500, 5)).isZero(); // nothing is ever taken as interest
    }

    @Test
    void interestComesDueOnTheFirstOfEachMonthOnWhatSaveHeldTheDayBefore() {
        List<Map.Entry<LocalDate, Long>> saves = List.of(
                Map.entry(day("2026-09-20"), 1000L),
                Map.entry(day("2026-10-10"), 200L),
                Map.entry(day("2026-11-01"), 500L), // on the first itself: too late for that day's interest
                Map.entry(day("2026-11-05"), -300L));

        // Settled up to mid-October, asked in mid-November: one payment, on 1 November, on the €12.00 held then.
        assertThat(PiggyBank.due(saves, day("2026-10-15"), day("2026-11-12"), 5))
                .containsExactly(new Due(day("2026-11-01"), 60));
        // Asked on the first itself: it is due that day. The day before: not yet.
        assertThat(PiggyBank.due(saves, day("2026-10-15"), day("2026-11-01"), 5))
                .containsExactly(new Due(day("2026-11-01"), 60));
        assertThat(PiggyBank.due(saves, day("2026-10-15"), day("2026-10-31"), 5))
                .isEmpty();
        // Settled on the first already: nothing is paid twice.
        assertThat(PiggyBank.due(saves, day("2026-11-01"), day("2026-11-30"), 5))
                .isEmpty();
        // Three months nobody looked: each first pays on what was there, the interest before it included.
        assertThat(PiggyBank.due(saves, day("2026-09-25"), day("2026-12-03"), 5))
                .containsExactly(
                        new Due(day("2026-10-01"), 50), // 5% of 1000
                        new Due(day("2026-11-01"), 63), // 5% of 1000 + 200 + 50 = 62.5, half a cent up
                        new Due(day("2026-12-01"), 76)); // 5% of 1250 + 500 - 300 + 63 = 75.65
        // An empty jar, or a jar in the red, earns nothing; and no rate, no interest.
        assertThat(PiggyBank.due(List.of(), day("2026-01-15"), day("2026-06-15"), 5))
                .isEmpty();
        assertThat(PiggyBank.due(List.of(Map.entry(day("2026-01-01"), -100L)), day("2026-01-15"), day("2026-03-15"), 5))
                .isEmpty();
        assertThat(PiggyBank.due(saves, day("2026-09-25"), day("2026-12-03"), 0))
                .isEmpty();
        // Across New Year, and from the last day of a month.
        assertThat(PiggyBank.due(
                        List.of(Map.entry(day("2026-12-01"), 2000L)), day("2026-12-31"), day("2027-01-01"), 10))
                .containsExactly(new Due(day("2027-01-01"), 200));
    }

    // ---------- secret missions ----------

    @Test
    void everyWeekEveryoneHasSomeoneElseAndNobodyIsTheTargetOfTwo() {
        UUID nora = UUID.randomUUID();
        UUID alex = UUID.randomUUID();
        UUID mia = UUID.randomUUID();
        UUID leo = UUID.randomUUID();
        UUID biscuit = UUID.randomUUID();
        List<UUID> everyone = List.of(nora, alex, mia, leo, biscuit);
        List<UUID> doers = List.of(nora, alex, mia, leo);
        Set<UUID> children = Set.of(mia, leo);
        Set<Map<UUID, UUID>> weeks = new HashSet<>();
        for (long seed = 0; seed < 300; seed++) {
            Map<UUID, UUID> pairs = SecretMissions.pairs(everyone, doers, children, Set.of(nora, alex), seed);
            assertThat(pairs.keySet()).containsExactlyInAnyOrderElementsOf(doers); // the pet has none to do
            assertThat(pairs.values()).doesNotHaveDuplicates();
            pairs.forEach((doer, target) -> assertThat(target).isNotEqualTo(doer));
            assertThat(everyone).containsAll(pairs.values());
            // The same seed gives the same week.
            assertThat(SecretMissions.pairs(everyone, doers, children, Set.of(nora, alex), seed))
                    .isEqualTo(pairs);
            weeks.add(pairs);
        }
        // And the weeks differ from each other.
        assertThat(weeks.size()).isGreaterThan(20);
    }

    @Test
    void aChildIsNeverGivenAMissionOnlyItsTargetCouldReadToThem() {
        UUID nora = UUID.randomUUID();
        UUID mia = UUID.randomUUID();
        UUID leo = UUID.randomUUID();
        // One grown-up, two children without a sign-in: no child ever has the grown-up, who has to read it to them.
        for (long seed = 0; seed < 200; seed++) {
            Map<UUID, UUID> pairs = SecretMissions.pairs(
                    List.of(nora, mia, leo), List.of(nora, mia, leo), Set.of(mia, leo), Set.of(nora), seed);
            assertThat(pairs.get(mia)).isNotEqualTo(nora);
            assertThat(pairs.get(leo)).isNotEqualTo(nora);
        }
        // One grown-up and one child: the child could only have the grown-up, so the child has none; the grown-up has
        // theirs.
        Map<UUID, UUID> two =
                SecretMissions.pairs(List.of(nora, mia), List.of(nora, mia), Set.of(mia), Set.of(nora), 7);
        assertThat(two).containsOnlyKeys(nora).containsEntry(nora, mia);
        // Nobody who could read to a child at all: the children have none.
        assertThat(SecretMissions.pairs(List.of(mia, leo), List.of(mia, leo), Set.of(mia, leo), Set.of(), 3))
                .isEmpty();
        // One person alone has nobody to be kind to.
        assertThat(SecretMissions.pairs(List.of(nora), List.of(nora), Set.of(), Set.of(nora), 1))
                .isEmpty();
    }

    @Test
    void aMissionIsSuggestedWithTheNameInItAndADifferentOneEachTimeOneIsAskedFor() {
        Set<String> seen = new HashSet<>();
        for (int picks = 0; picks < SecretMissions.KINDNESSES.size(); picks++) {
            String words = SecretMissions.suggestion("Mia", false, 5, picks);
            assertThat(words).contains("Mia").doesNotContain("%");
            seen.add(words);
        }
        assertThat(seen).hasSameSizeAs(SecretMissions.KINDNESSES); // every one comes round before any repeats
        assertThat(SecretMissions.suggestion("Mia", false, 0, 0))
                .isEqualTo("Do one of Mia's jobs before anyone notices.");
        assertThat(SecretMissions.suggestion("Lars", false, 0, 0))
                .isEqualTo("Do one of Lars' jobs before anyone notices.");
        assertThat(SecretMissions.suggestion("Mia", false, 0, 1))
                .isEqualTo("Leave a note where only Mia will find it.");
        assertThat(SecretMissions.suggestion("Biscuit", true, 0, 0)).isEqualTo("Take Biscuit on one very long walk.");
        // A seed can be any number, below zero too.
        assertThat(SecretMissions.suggestion("Mia", false, -9_000_000_000L, 3)).contains("Mia");
    }

    @Test
    void aWeekOfMissionsIsRevealedFromItsSunday() {
        LocalDate monday = day("2026-11-09");
        assertThat(SecretMissions.revealed(monday, day("2026-11-09"))).isFalse();
        assertThat(SecretMissions.revealed(monday, day("2026-11-14"))).isFalse(); // Saturday
        assertThat(SecretMissions.revealed(monday, day("2026-11-15"))).isTrue(); // Sunday
        assertThat(SecretMissions.revealed(monday, day("2026-11-16"))).isTrue();
        assertThat(SecretMissions.revealed(monday, day("2027-01-01"))).isTrue();
    }

    // ---------- the Saturday jar ----------

    @Test
    void anIdeaFitsWhenItTakesNoLongerCostsNoMoreAndSuitsTheSky() {
        Idea picnic = new Idea("A picnic", "🧺", "outdoors", 120, 0L, null, null);
        Idea pool = new Idea("The pool", "🏊", "indoors", 240, 6000L, null, null);
        Idea den = new Idea("A den", "⛺", "home", null, null, null, null);

        // Nothing asked: everything fits.
        assertThat(List.of(picnic, pool, den)).allMatch(idea -> SaturdayJar.fits(idea, null));
        assertThat(List.of(picnic, pool, den)).allMatch(idea -> SaturdayJar.fits(idea, new Asked(null, null, null)));
        // Two hours: the picnic fits exactly, the pool doesn't, and the den doesn't say, so it isn't ruled out.
        Asked twoHours = new Asked(120, null, null);
        assertThat(SaturdayJar.fits(picnic, twoHours)).isTrue();
        assertThat(SaturdayJar.fits(pool, twoHours)).isFalse();
        assertThat(SaturdayJar.fits(den, twoHours)).isTrue();
        assertThat(SaturdayJar.fits(picnic, new Asked(119, null, null))).isFalse();
        // For free: the pool is out.
        Asked free = new Asked(null, 0L, null);
        assertThat(SaturdayJar.fits(picnic, free)).isTrue();
        assertThat(SaturdayJar.fits(pool, free)).isFalse();
        assertThat(SaturdayJar.fits(den, free)).isTrue();
        assertThat(SaturdayJar.fits(pool, new Asked(null, 6000L, null))).isTrue();
        // Indoors: nothing that needs the sky. Outdoors: anything goes, a den too.
        Asked indoors = new Asked(null, null, false);
        assertThat(SaturdayJar.fits(picnic, indoors)).isFalse();
        assertThat(SaturdayJar.fits(pool, indoors)).isTrue();
        assertThat(SaturdayJar.fits(den, indoors)).isTrue();
        assertThat(List.of(picnic, pool, den)).allMatch(idea -> SaturdayJar.fits(idea, new Asked(null, null, true)));
        // All three at once.
        assertThat(SaturdayJar.fits(pool, new Asked(300, 6000L, false))).isTrue();
        assertThat(SaturdayJar.fits(pool, new Asked(300, 5999L, false))).isFalse();
    }

    // ---------- sleeps ----------

    @Test
    void aDayThatComesEveryYearCountsToItsNextTimeRound() {
        assertThat(Sleeps.next(day("2026-12-04"), true, WEDNESDAY)).isEqualTo(day("2026-12-04"));
        assertThat(Sleeps.next(day("2016-12-04"), true, WEDNESDAY)).isEqualTo(day("2026-12-04"));
        assertThat(Sleeps.next(day("2016-12-04"), true, day("2026-12-04")))
                .isEqualTo(day("2026-12-04")); // the day itself
        assertThat(Sleeps.next(day("2016-12-04"), true, day("2026-12-05"))).isEqualTo(day("2027-12-04"));
        assertThat(Sleeps.next(day("2020-01-01"), true, day("2026-12-31"))).isEqualTo(day("2027-01-01"));
        // 29 February comes round as the 28th in a year without one, and as itself in a year with one.
        assertThat(Sleeps.next(day("2024-02-29"), true, day("2026-01-10"))).isEqualTo(day("2026-02-28"));
        assertThat(Sleeps.next(day("2024-02-29"), true, day("2028-01-10"))).isEqualTo(day("2028-02-29"));
        // One that comes once stays where it is, also when it has been.
        assertThat(Sleeps.next(day("2026-11-01"), false, WEDNESDAY)).isEqualTo(day("2026-11-01"));
        assertThat(Sleeps.next(day("2026-11-23"), false, WEDNESDAY)).isEqualTo(day("2026-11-23"));
    }

    @Test
    void theChainIsAsLongAsTheWaitWasAndNeverLongerThanSixtyLinks() {
        // Started two days ago for a day in twelve: fourteen links.
        assertThat(Sleeps.links(day("2026-11-09"), day("2026-11-23"), 12)).isEqualTo(14);
        assertThat(Sleeps.links(WEDNESDAY, day("2026-11-23"), 12)).isEqualTo(12);
        // A long wait is drawn as sixty; the count of sleeps is told beside it.
        assertThat(Sleeps.links(WEDNESDAY, day("2027-04-03"), 143)).isEqualTo(60);
        // Started more than a year before the day (last year's birthday chain), or with no start: sixty at most.
        assertThat(Sleeps.links(day("2025-10-01"), day("2026-12-04"), 23)).isEqualTo(60);
        assertThat(Sleeps.links(null, day("2026-12-04"), 23)).isEqualTo(60);
        // A start that was put after today's count never makes the chain shorter than the sleeps left.
        assertThat(Sleeps.links(day("2026-11-20"), day("2026-11-23"), 12)).isEqualTo(12);
        assertThat(Sleeps.links(day("2026-11-23"), day("2026-11-23"), 0)).isZero();
    }

    // ---------- where is it ----------

    @Test
    void aQuestionIsReadDownToTheWordsThatSayWhatIsLookedFor() {
        assertThat(WhereIsIt.keywords("where's the tent")).containsExactly("tent");
        assertThat(WhereIsIt.keywords("Where’s the tent?")).containsExactly("tent");
        assertThat(WhereIsIt.keywords("WHERE IS THE TENT")).containsExactly("tent");
        assertThat(WhereIsIt.keywords("wheres the tent")).containsExactly("tent");
        assertThat(WhereIsIt.keywords("where are the passports?")).containsExactly("passport");
        assertThat(WhereIsIt.keywords("where did we put the Christmas lights")).containsExactly("christmas", "light");
        assertThat(WhereIsIt.keywords("has anyone seen Leo's swimming bag")).containsExactly("leo", "swimming", "bag");
        assertThat(WhereIsIt.keywords("spare car key")).containsExactly("spare", "car", "key");
        assertThat(WhereIsIt.keywords("where is it")).isEmpty();
        assertThat(WhereIsIt.keywords("  ")).isEmpty();
        assertThat(WhereIsIt.keywords(null)).isEmpty();
        // A word is kept once, and a word that ends in a double s keeps it.
        assertThat(WhereIsIt.keywords("the keys, where are the keys")).containsExactly("key");
        assertThat(WhereIsIt.keywords("where is the compass")).containsExactly("compass");
        assertThat(WhereIsIt.keywords("where's the bus pass")).containsExactly("bus", "pass");
    }

    @Test
    void aThingAnswersAQuestionBestWhenTheWordsAreInItsName() {
        List<String> tent = WhereIsIt.keywords("where's the tent");
        assertThat(WhereIsIt.score(tent, "Tent", "Attic, blue crate 3 Tent, pegs and both mats."))
                .isEqualTo(3);
        assertThat(WhereIsIt.score(tent, "Camping things", "Attic. The tent is in the blue crate."))
                .isEqualTo(1);
        assertThat(WhereIsIt.score(tent, "Spare car key", "With Marta next door"))
                .isZero();
        // "passports" finds "The passports" and "Passport, Mia"; "swim" finds "swimming".
        List<String> passports = WhereIsIt.keywords("where are the passports");
        assertThat(WhereIsIt.score(passports, "The passports", "Bedroom, grey folder"))
                .isEqualTo(3);
        assertThat(WhereIsIt.score(passports, "Passport, Mia", "With the others"))
                .isEqualTo(3);
        assertThat(WhereIsIt.score(WhereIsIt.keywords("the swim bag"), "Leo's swimming bag", "Hall"))
                .isEqualTo(6);
        // A word of two letters has to be the whole word; nothing asked scores nothing.
        assertThat(WhereIsIt.score(List.of("tv"), "TV remote", "")).isEqualTo(3);
        assertThat(WhereIsIt.score(List.of("te"), "Tent", "")).isZero();
        assertThat(WhereIsIt.score(List.of(), "Tent", "Attic")).isZero();
        assertThat(WhereIsIt.score(tent, "Tent", null)).isEqualTo(3);

        assertThat(WhereIsItSearch.asksWhere("where's the tent")).isTrue();
        assertThat(WhereIsItSearch.asksWhere("  Where are my keys")).isTrue();
        assertThat(WhereIsItSearch.asksWhere("tent")).isFalse();
        assertThat(WhereIsItSearch.asksWhere(null)).isFalse();
    }

    // ---------- habit charts ----------

    @Test
    void aStreakCountsBackFromTodayAndAMissedDayEndsItButNothingElseDoes() {
        Set<LocalDate> kept = Set.of(
                day("2026-11-02"),
                day("2026-11-03"),
                day("2026-11-04"),
                day("2026-11-05"),
                day("2026-11-06"),
                day("2026-11-07"),
                day("2026-11-08"),
                day("2026-11-09"),
                day("2026-11-10"));
        LocalDate from = WEDNESDAY.minusDays(100);
        // Nine days up to yesterday, and today still open: nine.
        assertThat(HabitCharts.streak(kept, d -> true, WEDNESDAY, from)).isEqualTo(9);
        // Today kept as well: ten.
        Set<LocalDate> withToday = new HashSet<>(kept);
        withToday.add(WEDNESDAY);
        assertThat(HabitCharts.streak(withToday, d -> true, WEDNESDAY, from)).isEqualTo(10);
        // Yesterday missed: it starts again, from nothing or from today.
        assertThat(HabitCharts.streak(kept, d -> true, day("2026-11-12"), from)).isZero();
        assertThat(HabitCharts.streak(Set.of(WEDNESDAY, day("2026-11-09")), d -> true, WEDNESDAY, from))
                .isEqualTo(1);
        // A weekly chart: the weeks between its days don't break it.
        Set<LocalDate> thursdays = Set.of(day("2026-10-22"), day("2026-10-29"), day("2026-11-05"));
        assertThat(HabitCharts.streak(thursdays, d -> d.getDayOfWeek() == DayOfWeek.THURSDAY, WEDNESDAY, from))
                .isEqualTo(3);
        assertThat(HabitCharts.streak(thursdays, d -> d.getDayOfWeek() == DayOfWeek.THURSDAY, day("2026-11-13"), from))
                .isZero(); // Thursday the 12th was missed
        // Nothing ticked, and a count that stops where the reading stops.
        assertThat(HabitCharts.streak(Set.of(), d -> true, WEDNESDAY, from)).isZero();
        assertThat(HabitCharts.streak(kept, d -> true, WEDNESDAY, day("2026-11-08")))
                .isEqualTo(3);
    }

    @Test
    void theLineUnderAChartSaysTheWeekTheStreakOrItsDays() {
        assertThat(HabitCharts.line(2, List.of(), 5, 6, 3, null)).isEqualTo("5 of 6 so far this week");
        assertThat(HabitCharts.line(1, List.of(), 2, 3, 9, null)).isEqualTo("9 days in a row");
        assertThat(HabitCharts.line(1, List.of(), 4, 4, 4, "dinner")).isEqualTo("4 dinners running");
        assertThat(HabitCharts.line(1, List.of("thu"), 0, 0, 2, null)).isEqualTo("Thursdays");
        assertThat(HabitCharts.line(1, List.of("mon", "thu"), 1, 1, 2, null)).isEqualTo("Mondays and Thursdays");
        assertThat(HabitCharts.line(1, List.of(), 1, 1, 1, null)).isEqualTo("1 day so far");
        assertThat(HabitCharts.line(1, List.of(), 1, 1, 1, "dinner")).isEqualTo("1 dinner so far");
        assertThat(HabitCharts.line(1, List.of(), 0, 3, 0, null)).isEqualTo("Ready for a first tick");
        // Every day of the week named is every day.
        assertThat(HabitCharts.line(1, List.of("mon", "tue", "wed", "thu", "fri", "sat", "sun"), 2, 3, 2, null))
                .isEqualTo("2 days in a row");
    }

    // ---------- tucked notes ----------

    @Test
    void someTimeThisWeekIsBetweenAnHourFromNowAndTheComingSunday() {
        // Wednesday at noon: from one o'clock until Sunday begins.
        assertThat(TuckedNotes.window(Instant.parse("2026-11-11T12:00:00Z")))
                .containsExactly(Instant.parse("2026-11-11T13:00:00Z"), Instant.parse("2026-11-15T00:00:00Z"));
        // Monday just after midnight: nearly the whole week.
        assertThat(TuckedNotes.window(Instant.parse("2026-11-09T00:05:00Z")))
                .containsExactly(Instant.parse("2026-11-09T01:05:00Z"), Instant.parse("2026-11-15T00:00:00Z"));
        // Saturday morning: still this Sunday. Saturday afternoon: less than half a day is left, so the Sunday after.
        assertThat(TuckedNotes.window(Instant.parse("2026-11-14T09:00:00Z")).get(1))
                .isEqualTo(Instant.parse("2026-11-15T00:00:00Z"));
        assertThat(TuckedNotes.window(Instant.parse("2026-11-14T11:30:00Z")).get(1))
                .isEqualTo(Instant.parse("2026-11-22T00:00:00Z"));
        // Sunday itself: the Sunday after. And the last hour of Saturday counts as Sunday already.
        assertThat(TuckedNotes.window(Instant.parse("2026-11-15T10:00:00Z")).get(1))
                .isEqualTo(Instant.parse("2026-11-22T00:00:00Z"));
        assertThat(TuckedNotes.window(Instant.parse("2026-11-14T23:30:00Z")).get(1))
                .isEqualTo(Instant.parse("2026-11-22T00:00:00Z"));
        // Whenever it is asked, there are at least twelve hours to hide in, and never more than eight days.
        for (int hour = 0; hour < 24 * 14; hour++) {
            Instant now = Instant.parse("2026-11-09T00:00:00Z").plus(Duration.ofHours(hour));
            List<Instant> window = TuckedNotes.window(now);
            assertThat(Duration.between(window.get(0), window.get(1)))
                    .isBetween(Duration.ofHours(12), Duration.ofDays(8));
            assertThat(window.get(0)).isEqualTo(now.plus(Duration.ofHours(1)));
        }
    }

    // ---------- the anniversary questions ----------

    @Test
    void twoAnswersAreTheSameWhenTheyShareAWordWorthSharing() {
        assertThat(Anniversary.same(List.of("The canoe at Bled, when Mia steered.", "Bled. Obviously Bled.")))
                .isEqualTo("Bled");
        assertThat(Anniversary.same(List.of("Bled. Obviously Bled.", "The canoe at Bled, when Mia steered.")))
                .isEqualTo("Bled");
        assertThat(Anniversary.same(List.of("Evenings with the phones away.", "Dancing in the kitchen.")))
                .isNull();
        // "every" is in both, and says nothing.
        assertThat(Anniversary.same(
                        List.of("Every school run in January.", "Remembering my mother's birthday. Every year.")))
                .isNull();
        // Capitals don't matter; the word comes back as the first answer wrote it. A possessive counts as its word.
        assertThat(Anniversary.same(List.of("NORWAY, all four of us", "norway!")))
                .isEqualTo("NORWAY");
        assertThat(Anniversary.same(List.of("Mia's first goal", "When Mia scored")))
                .isNull(); // three letters
        assertThat(Anniversary.same(List.of("Biscuit’s birthday", "the day with biscuit")))
                .isEqualTo("Biscuit");
        // Three people: all three have to have it.
        assertThat(Anniversary.same(List.of("Lisbon in May", "lisbon, of course", "The Lisbon rooftop")))
                .isEqualTo("Lisbon");
        assertThat(Anniversary.same(List.of("Lisbon in May", "lisbon, of course", "Porto")))
                .isNull();
        // One answer, or none, is not "the same".
        assertThat(Anniversary.same(List.of("Bled"))).isNull();
        assertThat(Anniversary.same(List.of())).isNull();
        assertThat(Anniversary.same(List.of("", "Bled"))).isNull();
    }

    // ---------- the fair share ----------

    @Test
    void sharesOfAHundredAlwaysAddUpToAHundred() {
        assertThat(FairShare.percents(List.of(31L, 22L))).containsExactly(58, 42); // 58.49 and 41.51
        assertThat(FairShare.percents(List.of(22L, 31L))).containsExactly(42, 58);
        assertThat(FairShare.percents(List.of(1L, 1L))).containsExactly(50, 50);
        assertThat(FairShare.percents(List.of(1L, 2L))).containsExactly(33, 67);
        assertThat(FairShare.percents(List.of(1L, 1L, 1L))).containsExactly(34, 33, 33);
        assertThat(FairShare.percents(List.of(10L, 0L))).containsExactly(100, 0);
        assertThat(FairShare.percents(List.of(0L, 0L))).containsExactly(0, 0);
        assertThat(FairShare.percents(List.of())).isEmpty();
        for (long a = 0; a < 40; a++) {
            for (long b = 1; b < 40; b++) {
                assertThat(FairShare.percents(List.of(a, b, 7L)).stream()
                                .mapToInt(Integer::intValue)
                                .sum())
                        .isEqualTo(100);
            }
        }
    }

    @Test
    void twoSharesAreCloseWithinFiftyThreeToFortySeven() {
        assertThat(FairShare.close(28, 25)).isTrue(); // 52.8 to 47.2
        assertThat(FairShare.close(53, 47)).isTrue();
        assertThat(FairShare.close(54, 46)).isFalse();
        assertThat(FairShare.close(31, 22)).isFalse();
        assertThat(FairShare.close(29, 24)).isFalse(); // 54.7 to 45.3
        assertThat(FairShare.close(10, 10)).isTrue();
        assertThat(FairShare.close(0, 0)).isTrue();
        assertThat(FairShare.close(1, 0)).isFalse();
    }

    @Test
    void theSwapOfferedIsTheGentlestOneThatBringsTheTwoClose() {
        UUID nora = UUID.randomUUID();
        UUID alex = UUID.randomUUID();
        Map<String, UUID> job = new LinkedHashMap<>();
        for (String name : List.of(
                "Meals",
                "School things",
                "Laundry",
                "Doctor",
                "Birthdays",
                "Bedtimes",
                "Bins",
                "The car",
                "Bills",
                "Biscuit")) {
            job.put(name, UUID.randomUUID());
        }
        Map<UUID, Map<UUID, Long>> october = new LinkedHashMap<>();
        october.put(nora, new LinkedHashMap<>());
        october.put(alex, new LinkedHashMap<>());
        october.get(nora).put(job.get("Meals"), 11L);
        october.get(nora).put(job.get("School things"), 7L);
        october.get(nora).put(job.get("Laundry"), 6L);
        october.get(nora).put(job.get("Doctor"), 4L);
        october.get(nora).put(job.get("Birthdays"), 3L);
        october.get(alex).put(job.get("Bedtimes"), 9L);
        october.get(alex).put(job.get("Bins"), 5L);
        october.get(alex).put(job.get("The car"), 4L);
        october.get(alex).put(job.get("Bills"), 2L);
        october.get(alex).put(job.get("Biscuit"), 2L);

        // 31 hours and 22: Alex takes the school things, Nora takes the car. 28 and 25.
        assertThat(FairShare.swap(october))
                .isEqualTo(new Trade(nora, job.get("School things"), alex, job.get("The car"), 3));

        // Close already: nothing is offered.
        Map<UUID, Map<UUID, Long>> close =
                Map.of(nora, Map.of(job.get("Meals"), 10L), alex, Map.of(job.get("Bedtimes"), 9L));
        assertThat(FairShare.swap(close)).isNull();
        // One job each, far apart: trading them only turns it round, so nothing is offered.
        Map<UUID, Map<UUID, Long>> lopsided = new LinkedHashMap<>();
        lopsided.put(nora, Map.of(job.get("Meals"), 20L));
        lopsided.put(alex, Map.of(job.get("Bills"), 2L));
        assertThat(FairShare.swap(lopsided)).isNull();
        // No trade brings them close, but one makes it better: that one.
        Map<UUID, Map<UUID, Long>> better = new LinkedHashMap<>();
        better.put(nora, new LinkedHashMap<>(Map.of(job.get("Meals"), 30L, job.get("Laundry"), 10L)));
        better.put(alex, new LinkedHashMap<>(Map.of(job.get("Bills"), 4L)));
        assertThat(FairShare.swap(better)).isEqualTo(new Trade(nora, job.get("Meals"), alex, job.get("Bills"), 16));
        // A job both of them ticked isn't traded.
        Map<UUID, Map<UUID, Long>> shared = new LinkedHashMap<>();
        shared.put(nora, new LinkedHashMap<>(Map.of(job.get("Meals"), 12L)));
        shared.put(alex, new LinkedHashMap<>(Map.of(job.get("Meals"), 4L)));
        assertThat(FairShare.swap(shared)).isNull();
        // The lighter one has ticked nothing, or there is only one person: nothing to trade.
        Map<UUID, Map<UUID, Long>> empty = new LinkedHashMap<>();
        empty.put(nora, Map.of(job.get("Meals"), 12L));
        empty.put(alex, Map.of());
        assertThat(FairShare.swap(empty)).isNull();
        assertThat(FairShare.swap(Map.of(nora, Map.of(job.get("Meals"), 12L)))).isNull();
    }
}

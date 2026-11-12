package app.homeport.api.library;

import static org.assertj.core.api.Assertions.assertThat;

import app.homeport.api.library.DocumentReader.Amount;
import app.homeport.api.library.DocumentReader.FoundDate;
import app.homeport.api.library.DocumentReader.Mrz;
import app.homeport.api.library.DocumentReader.Reading;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

/** What is read, by rule, from the words the phone found inside a scan. Today is 11 November 2026. */
class DocumentReaderTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 11, 11);

    // ---------- the machine-readable lines ----------

    @Test
    void aPassportsTwoLinesGiveItsNumberBirthdayAndLastDay() {
        // The specimen from the standard for travel documents (ICAO 9303).
        Mrz read = DocumentReader.mrz("""
                        Passport / Passeport
                        P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<
                        L898902C36UTO7408122F1204159ZE184226B<<<<<10
                        """, TODAY).orElseThrow();

        assertThat(read.number()).isEqualTo("L898902C3");
        assertThat(read.nationality()).isEqualTo("UTO");
        assertThat(read.born()).isEqualTo(LocalDate.of(1974, 8, 12));
        assertThat(read.sex()).isEqualTo("F");
        assertThat(read.expires()).isEqualTo(LocalDate.of(2012, 4, 15));
    }

    @Test
    void aScanThatPutSpacesBetweenTheLettersIsStillRead() {
        assertThat(DocumentReader.mrz("  L898902C3 6UTO 7408122 F 1204159 ZE184226B<<<<<1 0  ", TODAY))
                .isPresent();
        assertThat(DocumentReader.mrz("l898902c36uto7408122f1204159ze184226b<<<<<10", TODAY))
                .isPresent();
    }

    @Test
    void anIdCardsThreeLinesAreReadToo() {
        Mrz read = DocumentReader.mrz("""
                        I<UTOD231458907<<<<<<<<<<<<<<<
                        7408122F1204159UTO<<<<<<<<<<<6
                        ERIKSSON<<ANNA<MARIA<<<<<<<<<<
                        """, TODAY).orElseThrow();

        assertThat(read.number()).isEqualTo("D23145890");
        assertThat(read.nationality()).isEqualTo("UTO");
        assertThat(read.born()).isEqualTo(LocalDate.of(1974, 8, 12));
        assertThat(read.expires()).isEqualTo(LocalDate.of(2012, 4, 15));
    }

    @Test
    void aLineWhoseCheckDigitsDoNotAddUpIsNotBelieved() {
        // One digit of the birthday misread: 7408122 became 7408022.
        assertThat(DocumentReader.mrz("L898902C36UTO7408022F1204159ZE184226B<<<<<10", TODAY))
                .isEmpty();
        // The number misread.
        assertThat(DocumentReader.mrz("L898902C46UTO7408122F1204159ZE184226B<<<<<10", TODAY))
                .isEmpty();
        // The last day misread.
        assertThat(DocumentReader.mrz("L898902C36UTO7408122F1204169ZE184226B<<<<<10", TODAY))
                .isEmpty();
        // A drawing of a passport with made-up digits, and ordinary text.
        assertThat(DocumentReader.mrz("L898902C36UTO1612041F2708025<<<<<<", TODAY))
                .isEmpty();
        assertThat(DocumentReader.mrz("Invoice 20261111, customer 4471009212345678901234567890", TODAY))
                .isEmpty();
        assertThat(DocumentReader.mrz("", TODAY)).isEmpty();
    }

    @ParameterizedTest
    @CsvSource({"L898902C3, 6", "740812, 2", "120415, 9", "D23145890, 7", "ZE184226B, 1", "<<<<<<, 0", "AB2134<<<, 5"})
    void aCheckDigitIsTheWeightedSumsLastDigit(String field, int digit) {
        assertThat(DocumentReader.checkDigit(field)).isEqualTo(digit);
    }

    @Test
    void twoDigitYearsAreReadAsTheBirthdayThatHasBeenAndTheLastDayNearestToNow() {
        // A child born in December 2016, a passport good until August 2027.
        Mrz child = DocumentReader.mrz(
                        LibrarySeed.machineLine(
                                "L898902C3", "UTO", LocalDate.of(2016, 12, 4), "F", LocalDate.of(2027, 8, 2)),
                        TODAY)
                .orElseThrow();
        assertThat(child.born()).isEqualTo(LocalDate.of(2016, 12, 4));
        assertThat(child.expires()).isEqualTo(LocalDate.of(2027, 8, 2));

        // Someone born in 1930: "30" can't be 2030 yet.
        Mrz grandma = DocumentReader.mrz(
                        LibrarySeed.machineLine(
                                "K417705B2", "UTO", LocalDate.of(1930, 3, 9), "F", LocalDate.of(2031, 3, 14)),
                        TODAY)
                .orElseThrow();
        assertThat(grandma.born()).isEqualTo(LocalDate.of(1930, 3, 9));
        assertThat(grandma.expires()).isEqualTo(LocalDate.of(2031, 3, 14));

        // A passport that ran out in 1999 did not run out in 2099.
        Mrz old = DocumentReader.mrz(
                        LibrarySeed.machineLine(
                                "K417705B2", "UTO", LocalDate.of(1960, 1, 1), "M", LocalDate.of(1999, 6, 30)),
                        TODAY)
                .orElseThrow();
        assertThat(old.expires()).isEqualTo(LocalDate.of(1999, 6, 30));
    }

    // ---------- days after words ----------

    @ParameterizedTest
    @CsvSource(
            delimiter = '|',
            value = {
                "Date of expiry: 02 AUG 2027 | EXPIRES | 2027-08-02",
                "Expires on 2 August 2027 | EXPIRES | 2027-08-02",
                "This card expires August 2, 2027. | EXPIRES | 2027-08-02",
                "Expiry date 2nd Aug. 2027 | EXPIRES | 2027-08-02",
                "EXPIRATION DATE: 2027-08-02 | EXPIRES | 2027-08-02",
                "Valid until 31.12.2027 | VALID_UNTIL | 2027-12-31",
                "valid thru 12/31/2027 | VALID_UNTIL | 2027-12-31",
                "Registration valid until 30.11.2026 | VALID_UNTIL | 2026-11-30",
                "The policy renews on 1 February 2027. | RENEWS | 2027-02-01",
                "Renewal date - 2027-02-01 | RENEWS | 2027-02-01",
                "Payment due by 15/12/2026 | DUE | 2026-12-15",
                "Due: 3 Dec 2026 | DUE | 2026-12-03",
                "Warranty until November 2028 | WARRANTY | 2028-11-30",
                "2 years guarantee, valid until Feb 2028 | WARRANTY | 2028-02-29",
            })
    void aDayAfterAWordThatSaysWhatItMeansIsFound(String text, DateLabel label, LocalDate date) {
        assertThat(DocumentReader.dates(text)).containsExactly(new FoundDate(label, date));
    }

    @Test
    void theDayMayStandOnTheLineBelowItsWord() {
        assertThat(DocumentReader.dates("Date of expiry\n02 AUG 2027\nAuthority\nUTOPIA"))
                .containsExactly(new FoundDate(DateLabel.EXPIRES, LocalDate.of(2027, 8, 2)));
    }

    @ParameterizedTest
    @CsvSource(
            delimiter = '|',
            value = {
                "Valid until further notice",
                "Expires 31 Feb 2027",
                "Due to the weather the trip moves from the first week of June to 2 August 2027",
                "Renews automatically. Order 12 placed 2 August 2027",
                "Taken on 2 August 2027 at the lake",
                "Expires 2027",
                "Warranty: 24 months",
            })
    void itIsSilentWhenNoDayFollowsCloseBehindTheWord(String text) {
        assertThat(DocumentReader.dates(text)).isEmpty();
    }

    @Test
    void severalDaysAreListedInTheOrderOfTheTextAndTheSameDayOnce() {
        List<FoundDate> found = DocumentReader.dates("""
                Invoice 2026-118. Payment due by 15 December 2026.
                Warranty valid until 30 November 2028.
                Date of expiry: 02 AUG 2027. This card expires 2 August 2027.
                """);

        assertThat(found)
                .containsExactly(
                        new FoundDate(DateLabel.DUE, LocalDate.of(2026, 12, 15)),
                        new FoundDate(DateLabel.WARRANTY, LocalDate.of(2028, 11, 30)),
                        new FoundDate(DateLabel.EXPIRES, LocalDate.of(2027, 8, 2)));
    }

    @Test
    void theDayThatMattersIsTheNextOneToComeOrTheLatestWhenAllHavePassed() {
        Reading coming = DocumentReader.read("Due 1 Dec 2026. Expires 1 June 2027. Valid until 1 May 2020.", TODAY);
        assertThat(coming.key(TODAY)).isEqualTo(new FoundDate(DateLabel.DUE, LocalDate.of(2026, 12, 1)));

        Reading passed = DocumentReader.read("Due 1 Dec 2019. Expires 1 June 2021.", TODAY);
        assertThat(passed.key(TODAY)).isEqualTo(new FoundDate(DateLabel.EXPIRES, LocalDate.of(2021, 6, 1)));

        // Today still counts as to come.
        assertThat(DocumentReader.read("Due 11 Nov 2026", TODAY).key(TODAY).date())
                .isEqualTo(TODAY);
        assertThat(DocumentReader.read("Nothing with a day in it", TODAY).key(TODAY))
                .isNull();
        assertThat(DocumentReader.read(null, TODAY).key(TODAY)).isNull();
    }

    @Test
    void aPassportsLastDayMattersMoreThanAnyOtherDayOnThePage() {
        Reading passport = DocumentReader.read(
                "Date of issue 3 Aug 2022. Payment due 1 Dec 2026.\n"
                        + LibrarySeed.machineLine(
                                "L898902C3", "UTO", LocalDate.of(2016, 12, 4), "F", LocalDate.of(2027, 8, 2)),
                TODAY);

        assertThat(passport.key(TODAY)).isEqualTo(new FoundDate(DateLabel.EXPIRES, LocalDate.of(2027, 8, 2)));
    }

    // ---------- the total of a receipt ----------

    @ParameterizedTest
    @CsvSource(
            delimiter = '|',
            value = {
                "Total €349.00 | 34900 | EUR",
                "TOTAL: 349,00 € | 34900 | EUR",
                "Total EUR 1.234,56 | 123456 | EUR",
                "Total 1,234.56 USD | 123456 | USD",
                "Total £12 | 1200 | GBP",
                "Amount due: $12.50 | 1250 | USD",
                "Balance due 84,00 EUR | 8400 | EUR",
                "Total (3 items) €45.00 | 4500 | EUR",
            })
    void theTotalOfAReceiptIsReadWithItsCurrency(String text, long cents, String currency) {
        assertThat(DocumentReader.amount(text)).contains(new Amount(cents, currency));
    }

    @Test
    void theLastTotalWinsOverASubtotalAndANumberWithoutACurrencyIsNotMoney() {
        assertThat(DocumentReader.amount("Subtotal €300.00\nVAT €49.00\nTotal €349.00\nAmount due €0.00"))
                .contains(new Amount(34900, "EUR"));
        assertThat(DocumentReader.amount("Sub total €300.00\nTotal €349.00")).contains(new Amount(34900, "EUR"));
        assertThat(DocumentReader.amount("Total: 20 pages")).isEmpty();
        assertThat(DocumentReader.amount("Total\n€349.00")).isEmpty();
        assertThat(DocumentReader.amount("We paid €349.00 for it")).isEmpty();
    }

    // ---------- what kind of document, and when to be reminded ----------

    @ParameterizedTest
    @CsvSource(
            delimiter = '|',
            quoteCharacter = '"',
            value = {
                "Home insurance | Policy number HL-204 | INSURANCE",
                "Mia's school report | Reading: far above her year | SCHOOL",
                "Receipt · wardrobe | Total €349.00 | RECEIPT",
                "IMG_2041 | Ingredients: 250 g butter | RECIPE",
                "Boiler manual | Service once a year | MANUAL",
                "Scan 3 | Income statement, tax number 4471 | TAX",
                "Scan 4 | VAT receipt, total 12.00 | RECEIPT",
                "Passport scan, Alex | nothing readable | ID",
                "Scan 5 | Vaccination record | HEALTH",
                "Scan 6 | Tenancy agreement with the landlord | HOME",
                "Car registration | Vehicle registration certificate | OTHER",
                "Holiday | Lake Bled | OTHER",
            })
    void whatADocumentIsIsGuessedFromItsNameFirstAndThenItsWords(String title, String text, DocumentCategory kind) {
        assertThat(DocumentReader.category(title, text, false)).isEqualTo(kind);
    }

    @Test
    void anythingWithAPassportsLinesIsAnId() {
        assertThat(DocumentReader.category("IMG_0001", "", true)).isEqualTo(DocumentCategory.ID);
        assertThat(DocumentReader.category(null, null, false)).isEqualTo(DocumentCategory.OTHER);
    }

    @Test
    void aReminderIsSuggestedSevenMonthsBeforeAPassportRunsOutAndAMonthBeforeMostOtherThings() {
        LocalDate ends = LocalDate.of(2027, 8, 2);
        assertThat(DocumentReader.remindOn(DateLabel.EXPIRES, ends, true, TODAY))
                .isEqualTo(LocalDate.of(2027, 1, 2));
        assertThat(DocumentReader.remindOn(DateLabel.EXPIRES, ends, false, TODAY))
                .isEqualTo(LocalDate.of(2027, 7, 2));
        assertThat(DocumentReader.remindOn(DateLabel.RENEWS, LocalDate.of(2027, 2, 1), false, TODAY))
                .isEqualTo(LocalDate.of(2027, 1, 1));
        assertThat(DocumentReader.remindOn(DateLabel.DUE, LocalDate.of(2026, 12, 15), false, TODAY))
                .isEqualTo(LocalDate.of(2026, 12, 12));
        // Too close for that: tomorrow. Passed, or today: nothing to be reminded of.
        assertThat(DocumentReader.remindOn(DateLabel.VALID_UNTIL, TODAY.plusDays(19), false, TODAY))
                .isEqualTo(TODAY.plusDays(1));
        assertThat(DocumentReader.remindOn(DateLabel.EXPIRES, TODAY.plusMonths(3), true, TODAY))
                .isEqualTo(TODAY.plusDays(1));
        assertThat(DocumentReader.remindOn(DateLabel.EXPIRES, TODAY, false, TODAY))
                .isNull();
        assertThat(DocumentReader.remindOn(DateLabel.EXPIRES, TODAY.minusDays(1), true, TODAY))
                .isNull();
        assertThat(DocumentReader.remindOn(DateLabel.EXPIRES, null, true, TODAY))
                .isNull();
    }

    @Test
    void aPassportThatRunsOutWithinSixMonthsOfATripSaysHowManyMonthsItHasLeft() {
        LocalDate norwayEnds = LocalDate.of(2027, 4, 17);
        // "Runs out 4 months after Norway."
        assertThat(DocumentReader.monthsLeftAfter(norwayEnds, LocalDate.of(2027, 8, 2)))
                .isEqualTo(4);
        assertThat(DocumentReader.monthsLeftAfter(norwayEnds, LocalDate.of(2027, 10, 16)))
                .isEqualTo(6);
        // Six months to the day, or more: room enough.
        assertThat(DocumentReader.monthsLeftAfter(norwayEnds, LocalDate.of(2027, 10, 17)))
                .isNull();
        assertThat(DocumentReader.monthsLeftAfter(norwayEnds, LocalDate.of(2031, 3, 14)))
                .isNull();
        // It runs out during the trip, or before it.
        assertThat(DocumentReader.monthsLeftAfter(norwayEnds, LocalDate.of(2027, 4, 10)))
                .isZero();
        assertThat(DocumentReader.monthsLeftAfter(norwayEnds, LocalDate.of(2027, 1, 17)))
                .isEqualTo(-3);
    }
}

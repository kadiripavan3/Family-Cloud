package app.homeport.api.export;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

/** The small rules of an export's files: names a computer takes, values a spreadsheet reads. */
class ExportFilesTest {

    @ParameterizedTest
    @CsvSource({
        "Groceries, Groceries",
        "Trip: Norway 2027, Trip- Norway 2027",
        "a/b\\c, a-b-c",
        "'  spaced   out  ', spaced out",
        "What? \"Really\" <now>, What- -Really- -now-",
        "..hidden, hidden",
        "'', Untitled",
        "Mia's passport, Mia's passport",
    })
    void aTitleBecomesANameAnyComputerTakes(String title, String name) {
        assertThat(ExportBuilder.clean(title)).isEqualTo(name);
    }

    @Test
    void aLongTitleIsCutAndALineBreakNeverEndsUpInAName() {
        assertThat(ExportBuilder.clean("x".repeat(200))).hasSize(80);
        assertThat(ExportBuilder.clean("two\nlines")).isEqualTo("two-lines");
    }

    @Test
    void aValueWithACommaAQuoteOrALineBreakIsQuotedInACsvFile() {
        assertThat(ExportBuilder.csv("Electricity")).isEqualTo("Electricity");
        assertThat(ExportBuilder.csv("Elektro, Ljubljana")).isEqualTo("\"Elektro, Ljubljana\"");
        assertThat(ExportBuilder.csv("the \"big\" one")).isEqualTo("\"the \"\"big\"\" one\"");
        assertThat(ExportBuilder.csv("two\nlines")).isEqualTo("\"two\nlines\"");
        assertThat(ExportBuilder.csv(null)).isEmpty();
    }

    @ParameterizedTest
    @CsvSource({"8420, 84.20", "0, 0.00", "5, 0.05", "100000, 1000.00", "-1250, -12.50"})
    void centsAreWrittenAsANumberASpreadsheetAddsUp(long cents, String written) {
        assertThat(ExportBuilder.amount(cents)).isEqualTo(written);
    }

    @Test
    void countsAndSizesAreSaidPlainly() {
        assertThat(ExportBuilder.many(1, "page", "pages")).isEqualTo("1 page");
        assertThat(ExportBuilder.many(31, "page", "pages")).isEqualTo("31 pages");
        assertThat(ExportBuilder.many(1204, "photo", "photos")).isEqualTo("1,204 photos");
        assertThat(ExportBuilder.size(2L << 30)).isEqualTo("2 GB");
        assertThat(ExportBuilder.size(64L << 20)).isEqualTo("64 MB");
    }
}

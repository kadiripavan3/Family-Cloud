package app.homeport.api.money.sheet;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

/** "Ask in words": a small set of known questions becomes a formula, by rule; anything else is not understood. */
class AskTest {

    private static final List<String> PEOPLE = List.of("Nora", "Alex", "Mia", "Leo");

    /** The Norway budget of the screens. */
    private static final List<Ask.Col> NORWAY = List.of(
            new Ask.Col("Item", ColumnKind.TEXT, List.of()),
            new Ask.Col("Who", ColumnKind.PERSON, List.of()),
            new Ask.Col("Cost", ColumnKind.MONEY, List.of()),
            new Ask.Col("Paid", ColumnKind.TICK, List.of()),
            new Ask.Col("Due", ColumnKind.DATE, List.of()));

    private static final List<Ask.Col> PARTY = List.of(
            new Ask.Col("Item", ColumnKind.TEXT, List.of()),
            new Ask.Col("Price", ColumnKind.MONEY, List.of()),
            new Ask.Col("Qty", ColumnKind.NUMBER, List.of()),
            new Ask.Col("Total", ColumnKind.FORMULA, List.of()),
            new Ask.Col("Bought", ColumnKind.TICK, List.of()));

    private static final List<Ask.Col> BUDGET = List.of(
            new Ask.Col("Item", ColumnKind.TEXT, List.of()),
            new Ask.Col("Kind", ColumnKind.CHOICE, List.of("Money in", "Bill", "Spending", "Saving")),
            new Ask.Col("Amount", ColumnKind.MONEY, List.of()),
            new Ask.Col("Done", ColumnKind.TICK, List.of()));

    private static final List<Ask.Col> CAR = List.of(
            new Ask.Col("When", ColumnKind.DATE, List.of()),
            new Ask.Col("What", ColumnKind.CHOICE, List.of("Fuel", "Service", "Insurance")),
            new Ask.Col("Cost", ColumnKind.MONEY, List.of()),
            new Ask.Col("Km", ColumnKind.NUMBER, List.of()));

    private static String ask(String question, List<Ask.Col> columns) {
        return Ask.formula(question, columns, PEOPLE, "Nora").orElse(null);
    }

    @Test
    void theQuestionOfTheScreen() {
        assertThat(ask("How much has Alex paid?", NORWAY)).isEqualTo("SUMIF(AND([Who] = \"Alex\", [Paid]), [Cost])");
    }

    @ParameterizedTest(name = "{0}")
    @CsvSource(
            delimiter = '|',
            quoteCharacter = '`',
            value = {
                "how much has alex paid | SUMIF(AND([Who] = \"Alex\", [Paid]), [Cost])",
                "What has Nora paid so far? | SUMIF(AND([Who] = \"Nora\", [Paid]), [Cost])",
                "How much have I paid? | SUMIF(AND([Who] = \"Nora\", [Paid]), [Cost])",
                "How much does Alex still owe? | SUMIF(AND([Who] = \"Alex\", NOT [Paid]), [Cost])",
                "What is left for Mia to pay? | SUMIF(AND([Who] = \"Mia\", NOT [Paid]), [Cost])",
                "Alex's share | SUMIF([Who] = \"Alex\", [Cost])",
                "How much is Leo's? | SUMIF([Who] = \"Leo\", [Cost])",
                "How much is left to pay? | SUM([Cost]) - SUMIF([Paid], [Cost])",
                "What do we still owe | SUM([Cost]) - SUMIF([Paid], [Cost])",
                "still to pay | SUM([Cost]) - SUMIF([Paid], [Cost])",
                "How much is paid? | SUMIF([Paid], [Cost])",
                "What have we paid so far? | SUMIF([Paid], [Cost])",
                "What part is paid? | ROUND(SUMIF([Paid], [Cost]) / SUM([Cost]) * 100)",
                "How many percent are paid | ROUND(SUMIF([Paid], [Cost]) / SUM([Cost]) * 100)",
                "Total cost | SUM([Cost])",
                "How much is it altogether? | SUM([Cost])",
                "What does it all add up to? | SUM([Cost])",
                "Average cost | AVG([Cost])",
                "average per month | AVG([Cost])",
                "What is the biggest cost? | MAX([Cost])",
                "the most expensive | MAX([Cost])",
                "the cheapest one | MIN([Cost])",
                "How many rows? | COUNT()",
                "How many are there | COUNT()",
                "How many are paid? | COUNTIF([Paid])",
                "How many are not paid? | COUNTIF(NOT [Paid])",
                "how many are still open | COUNTIF(NOT [Paid])",
                "Days until due | DAYS([Due], TODAY())",
                "how many days left | DAYS([Due], TODAY())",
            })
    void questionsAboutTheNorwayBudget(String question, String formula) {
        assertThat(ask(question, NORWAY)).isEqualTo(formula);
    }

    @ParameterizedTest(name = "{0}")
    @CsvSource(
            delimiter = '|',
            quoteCharacter = '`',
            value = {
                "total of price times quantity | SUM([Price] * [Qty])",
                "Total of Price times Qty | SUM([Price] * [Qty])",
                "price times quantity | [Price] * [Qty]",
                "Price x Qty | [Price] * [Qty]",
                "price multiplied by qty | [Price] * [Qty]",
                "total divided by qty | [Total] / [Qty]",
                "Total minus Price | [Total] - [Price]",
                "price plus total | [Price] + [Total]",
                "Total total | SUM([Total])",
                "How many are bought? | COUNTIF([Bought])",
                "How much is left to buy? | SUM([Price]) - SUMIF([Bought], [Price])",
                "average price | AVG([Price])",
            })
    void questionsAboutThePartyBudget(String question, String formula) {
        assertThat(ask(question, PARTY)).isEqualTo(formula);
    }

    @ParameterizedTest(name = "{0}")
    @CsvSource(
            delimiter = '|',
            quoteCharacter = '`',
            value = {
                "How much for Spending? | SUMIF([Kind] = \"Spending\", [Amount])",
                "total for money in | SUMIF([Kind] = \"Money in\", [Amount])",
                "How many bill rows are there? | COUNTIF([Kind] = \"Bill\")",
                "Average per month | AVG([Amount])",
                "how much is done | SUMIF([Done], [Amount])",
            })
    void questionsAboutAMonthlyBudget(String question, String formula) {
        assertThat(ask(question, BUDGET)).isEqualTo(formula);
    }

    @Test
    void questionsAboutOtherTabsAndALoan() {
        assertThat(ask("How much for fuel?", CAR)).isEqualTo("SUMIF([What] = \"Fuel\", [Cost])");
        assertThat(ask("cost per km", CAR)).isEqualTo("[Cost] / [Km]");
        assertThat(ask("total km", CAR)).isEqualTo("SUM([Km])");
        assertThat(ask("Monthly payment on 240000 at 3.4% over 25 years", CAR)).isEqualTo("PAYMENT(€240000, 3.4, 25)");
        assertThat(ask("what is the payment for a loan of 180,000 at 4 percent over 20 years?", NORWAY))
                .isEqualTo("PAYMENT(€180000, 4, 20)");
    }

    @ParameterizedTest
    @CsvSource(
            delimiter = '|',
            value = {
                "What is the meaning of life?",
                "Should we go to Norway or Sicily",
                "tell me a joke",
                "is Alex nice",
                "???",
                "''",
            })
    void anythingElseIsNotUnderstood(String question) {
        assertThat(Ask.formula(question, NORWAY, PEOPLE, "Nora")).isEqualTo(Optional.empty());
    }

    @Test
    void aTabThatCantAnswerSaysSoRatherThanGuess() {
        List<Ask.Col> words = List.of(new Ask.Col("Name", ColumnKind.TEXT, List.of()));

        assertThat(Ask.formula("How much is left to pay?", words, PEOPLE, "Nora"))
                .isEmpty();
        assertThat(Ask.formula("How much has Alex paid?", words, PEOPLE, "Nora"))
                .isEmpty();
        assertThat(Ask.formula("How many rows?", words, PEOPLE, "Nora")).contains("COUNT()");
    }

    @Test
    void theExamplesItOffersUseTheTabsOwnColumns() {
        assertThat(Ask.examples(NORWAY, PEOPLE))
                .containsExactly(
                        "Total Cost",
                        "Average Cost",
                        "How much is left to pay?",
                        "How much has Nora paid?",
                        "How many rows?");
        assertThat(Ask.examples(PARTY, PEOPLE)).contains("Total of Price times Qty");
        // And each of them is a question it understands.
        for (String example : Ask.examples(NORWAY, PEOPLE)) {
            assertThat(ask(example, NORWAY)).as(example).isNotNull();
        }
        for (String example : Ask.examples(PARTY, PEOPLE)) {
            assertThat(ask(example, PARTY)).as(example).isNotNull();
        }
    }
}

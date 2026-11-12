package app.homeport.api.list;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Comparator;
import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

/** Which aisle a line of a shopping list goes under, by rules. */
class AislesTest {

    @ParameterizedTest
    @CsvSource(
            delimiter = '|',
            value = {
                // The lines of the Groceries screen, each where the drawing has it.
                "Bananas | Fruit and veg",
                "Red onions | Fruit and veg",
                "Strawberries, 2 boxes | Fruit and veg",
                "Milk, 2 litres | Fridge",
                "Butter | Fridge",
                "Dog food for Biscuit | Other",
                "Birthday candles | Other",
                "Eggs | Fridge",
                "Bread | Bakery",
                "Coffee | Cupboard",
                "Yoghurt | Fridge",
                // The thing itself comes last: what stands before it only describes it.
                "Cherry tomatoes | Fruit and veg",
                "Tomato sauce | Cupboard",
                "Birthday cake | Bakery",
                "Sweet potatoes | Fruit and veg",
                "Greek yogurt | Fridge",
                "Basmati rice | Cupboard",
                "Frozen peas | Frozen",
                // Written as more than one.
                "tomatoes | Fruit and veg",
                "PEACHES | Fruit and veg",
                "Cheeses | Fridge",
                "cookies | Cupboard",
                "2 baguettes | Bakery",
                "Grapes (seedless) | Fruit and veg",
                // Two words that are one thing.
                "Olive oil | Cupboard",
                "Ice cream | Frozen",
                "Orange juice | Drinks",
                "Oat milk | Drinks",
                "Peanut butter | Cupboard",
                "Cream cheese | Fridge",
                "Kitchen roll | Other",
                "Washing-up liquid | Other",
                // An amount, a note or who it is for isn't the thing.
                "Apples x6 | Fruit and veg",
                "Cheese: the strong one | Fridge",
                "Flowers for Grandma Astrid | Other",
                "Wine with a cork | Drinks",
                // Not food, or not known: Other, never a guess.
                "Toothpaste | Other",
                "Batteries AA | Other",
                "Stamps | Other",
                "Bin bags | Other",
                "Wrapping paper | Other",
                "42 | Other",
            })
    void aLineGoesUnderItsAisle(String line, String aisle) {
        assertThat(Aisles.of(line)).as(line).isEqualTo(aisle);
    }

    @Test
    void nothingAtAllGoesUnderOther() {
        assertThat(Aisles.of("")).isEqualTo("Other");
        assertThat(Aisles.of("   ")).isEqualTo("Other");
        assertThat(Aisles.of(null)).isEqualTo("Other");
        assertThat(Aisles.of(", 2 boxes")).isEqualTo("Other");
    }

    @Test
    void theWordsThatNameTheThingAreWhatIsLeftWithoutAmountsAndNotes() {
        assertThat(Aisles.thing("Strawberries, 2 boxes")).isEqualTo("strawberries");
        assertThat(Aisles.thing("  Dog food   for Biscuit ")).isEqualTo("dog food");
        assertThat(Aisles.thing("3 x Milk (semi-skimmed)")).isEqualTo("x milk");
        assertThat(Aisles.thing("Washing-up liquid")).isEqualTo("washing-up liquid");
        assertThat(Aisles.thing("Crème fraîche")).isEqualTo("crème fraîche");
    }

    @Test
    void sectionsOfAShoppingListStandInTheOrderOfAShopWithOtherLast() {
        List<String> sorted = Stream.of("Other", "Fridge", "", "From the market", "Fruit and veg", "Drinks", "Bakery")
                .sorted(Comparator.comparingInt(Aisles::rank))
                .toList();
        assertThat(sorted)
                .containsExactly("Fruit and veg", "Bakery", "Fridge", "Drinks", "From the market", "", "Other");
        assertThat(Aisles.ORDER).doesNotHaveDuplicates().endsWith("Other");
    }
}

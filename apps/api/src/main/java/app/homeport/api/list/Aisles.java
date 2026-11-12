package app.homeport.api.list;

import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Which aisle of a shop a line of a shopping list belongs in, by rules: a short list of everyday words. It
 * reads the thing itself ("Red onions" is onions, "Milk, 2 litres" is milk, "Dog food for Biscuit" is dog
 * food) and answers "Other" for whatever it doesn't know. A list learns from its own use first: a line goes
 * where the same line went last time, and this is only asked the first time.
 */
public final class Aisles {

    private Aisles() {}

    public static final String FRUIT_AND_VEG = "Fruit and veg";
    public static final String BAKERY = "Bakery";
    public static final String FRIDGE = "Fridge";
    public static final String CUPBOARD = "Cupboard";
    public static final String FROZEN = "Frozen";
    public static final String DRINKS = "Drinks";
    public static final String OTHER = "Other";

    /** The aisles in the order a shopping list shows them: the way most shops are walked. */
    public static final List<String> ORDER = List.of(FRUIT_AND_VEG, BAKERY, FRIDGE, CUPBOARD, FROZEN, DRINKS, OTHER);

    private static final Map<String, String> WORDS = new HashMap<>();

    /** Names of two words, looked for before single words: "olive oil" is not an olive. */
    private static final Map<String, String> PHRASES = new HashMap<>();

    static {
        words(
                FRUIT_AND_VEG,
                "apple banana orange lemon lime pear grape strawberry raspberry blueberry berry melon mango peach plum"
                        + " cherry kiwi avocado tomato potato onion garlic carrot cucumber pepper lettuce salad spinach"
                        + " broccoli cauliflower courgette zucchini aubergine mushroom leek celery cabbage kale ginger"
                        + " herb basil parsley coriander mint fruit vegetable veg pumpkin squash bean pea corn radish"
                        + " beetroot rocket pineapple clementine satsuma nectarine apricot");
        words(BAKERY, "bread roll baguette bun croissant bagel loaf toast wrap tortilla pita pitta cake muffin pastry");
        words(
                FRIDGE,
                "milk butter cheese yoghurt yogurt cream egg ham bacon sausage chicken beef mince pork fish salmon"
                        + " tofu hummus margarine mozzarella cheddar feta parmesan turkey steak meat quark kefir"
                        + " skyr");
        words(
                CUPBOARD,
                "pasta rice flour sugar salt oil vinegar cereal oat muesli honey jam spaghetti noodle lentil chickpea"
                        + " sauce ketchup mustard mayonnaise spice stock biscuit cracker crisp chocolate nut raisin"
                        + " coffee tea cocoa passata soup tin can couscous quinoa yeast vanilla cinnamon sweet"
                        + " cookie granola");
        words(FROZEN, "frozen pizza fries chips");
        words(DRINKS, "water juice wine beer cola lemonade smoothie cider soda tonic prosecco");
        phrase(CUPBOARD, "olive oil", "peanut butter", "tomato sauce", "baked beans", "coconut milk", "baking powder");
        phrase(FROZEN, "ice cream", "fish fingers", "frozen peas");
        phrase(DRINKS, "orange juice", "apple juice", "oat milk", "soy milk", "almond milk");
        phrase(FRIDGE, "cream cheese", "sour cream", "cottage cheese");
        phrase(
                OTHER,
                "dog food",
                "cat food",
                "pet food",
                "kitchen roll",
                "toilet roll",
                "toilet paper",
                "bin bags",
                "washing-up liquid",
                "washing up liquid");
    }

    private static void words(String aisle, String words) {
        for (String word : words.split(" ")) {
            WORDS.put(word, aisle);
        }
    }

    private static void phrase(String aisle, String... phrases) {
        for (String phrase : phrases) {
            PHRASES.put(phrase, aisle);
        }
    }

    /** The aisle for a line as someone typed it. */
    public static String of(String line) {
        String thing = thing(line);
        if (thing.isEmpty()) {
            return OTHER;
        }
        for (Map.Entry<String, String> phrase : PHRASES.entrySet()) {
            if ((" " + thing + " ").contains(" " + phrase.getKey() + " ")) {
                return phrase.getValue();
            }
        }
        // In English the thing itself comes last: "red onions", "birthday cake", "tinned tomatoes".
        String[] words = thing.split(" ");
        for (int i = words.length - 1; i >= 0; i--) {
            String aisle = known(words[i]);
            if (aisle != null) {
                return aisle;
            }
        }
        return OTHER;
    }

    /** The words that name the thing: lower case, without the amount ("2 litres", "x3") or who it is for. */
    static String thing(String line) {
        String text = line == null ? "" : line.toLowerCase(Locale.ROOT);
        text = text.split("[,(:;]", 2)[0];
        text = text.replaceAll("\\s+(for|from|with|to)\\s+.*$", "");
        text = text.replaceAll("[^\\p{L}\\- ]", " ");
        return text.replaceAll("\\s+", " ").trim();
    }

    /** A word's aisle, also when it is written as more than one: "onions", "tomatoes", "strawberries", "peaches". */
    private static String known(String word) {
        for (String form : List.of(
                word,
                word.replaceFirst("ies$", "y"),
                word.replaceFirst("oes$", "o"),
                word.replaceFirst("es$", ""),
                word.replaceFirst("s$", ""))) {
            String aisle = WORDS.get(form);
            if (aisle != null) {
                return aisle;
            }
        }
        return null;
    }

    /**
     * Where a section stands in a shopping list: the aisles in their order, then sections people named
     * themselves, with lines under no heading and "Other" last.
     */
    public static int rank(String section) {
        int index = ORDER.indexOf(section);
        if (OTHER.equals(section)) {
            return ORDER.size() + 2;
        }
        return index >= 0 ? index : section.isEmpty() ? ORDER.size() + 1 : ORDER.size();
    }
}

package app.homeport.api.board.templates;

import app.homeport.api.board.Person;
import app.homeport.api.board.Scene;
import app.homeport.api.circle.MemberStatus;
import java.text.DecimalFormat;
import java.text.DecimalFormatSymbols;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

/**
 * Small pieces of wording the flat's and the crew's templates share: a number with its commas, a few names in
 * a row, and who in a circle speaks for themselves.
 */
final class Say {

    private static final String[] SMALL = {
        "none", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"
    };

    private Say() {}

    /** 1,240 */
    static String number(long value) {
        return new DecimalFormat("#,##0", DecimalFormatSymbols.getInstance(Locale.ROOT)).format(value);
    }

    /** "four" for 4, as it is said in a sentence; digits from thirteen on. */
    static String spell(int count) {
        return count >= 0 && count < SMALL.length ? SMALL[count] : String.valueOf(count);
    }

    /** "Lea", "Lea and Kai", "Lea, Lena and Ana". Empty for nobody. */
    static String list(List<String> names) {
        if (names.isEmpty()) {
            return "";
        }
        if (names.size() == 1) {
            return names.get(0);
        }
        return String.join(", ", names.subList(0, names.size() - 1)) + " and " + names.get(names.size() - 1);
    }

    /** The first names of these members, in the order given, with "you" for the viewer. */
    static List<String> names(Scene scene, List<UUID> memberIds) {
        List<String> names = new ArrayList<>();
        for (UUID id : memberIds) {
            names.add(scene.isMe(id) ? "you" : scene.firstName(id));
        }
        return names;
    }

    /** "the electricity" for "Electricity": a name as it stands in the middle of a sentence. */
    static String lowerFirst(String text) {
        if (text.length() > 1 && Character.isUpperCase(text.charAt(1))) {
            return text; // "TV licence" stays as it is
        }
        return text.isEmpty() ? text : Character.toLowerCase(text.charAt(0)) + text.substring(1);
    }

    static String upperFirst(String text) {
        return text.isEmpty() ? text : Character.toUpperCase(text.charAt(0)) + text.substring(1);
    }

    /**
     * The people of a circle who speak for themselves: in it now, with a sign-in of their own. They are the ones
     * who agree to a split, vote, and draw a name. A child without a phone, a pet and someone who was only
     * invited are not asked.
     */
    static List<Person> voices(Scene scene) {
        return scene.humans().stream()
                .filter(p -> !p.hasNoSignIn() && p.status() == MemberStatus.JOINED)
                .toList();
    }

    static List<UUID> voiceIds(Scene scene) {
        return voices(scene).stream().map(Person::id).toList();
    }
}

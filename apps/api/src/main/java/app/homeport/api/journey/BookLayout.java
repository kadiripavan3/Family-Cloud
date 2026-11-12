package app.homeport.api.journey;

import java.time.LocalDate;
import java.util.List;

/**
 * How a journey is laid out as one page in Notes: a cover, the numbers, then each day with its words and its
 * photos. A page holds 500 blocks, and a long journey has more to say than that, so the layout is chosen to
 * fit, giving up photos before words and words before days:
 *
 * <ol>
 *   <li>each day a heading, each entry its own words, and the day's first six photos (then four, three, two,
 *       one, none);
 *   <li>if that still doesn't fit, each day's words as one block, with one photo or none;
 *   <li>if even that doesn't fit (more than 240 days), the first days that do. The page says how many days
 *       are only in Journey.
 * </ol>
 *
 * Photos the page has no room for are not lost: every photo of the journey is in its album in the Library.
 */
final class BookLayout {

    /** Blocks the days may use. The rest of the page's 500 is for the cover, the numbers and what people add. */
    static final int ROOM = 480;

    private static final int[] SHOTS_A_DAY = {6, 4, 3, 2, 1, 0};

    private BookLayout() {}

    record DaySize(LocalDate day, int entries, int shots) {}

    /**
     * @param shotsADay how many of a day's photos stand in the page
     * @param wordsPerDay true when a day's entries share one block of words
     * @param days how many days, from the first, the page holds
     */
    record Plan(int shotsADay, boolean wordsPerDay, int days) {}

    static Plan plan(List<DaySize> days) {
        for (int shots : SHOTS_A_DAY) {
            if (blocks(days, shots, false) <= ROOM) {
                return new Plan(shots, false, days.size());
            }
        }
        for (int shots : new int[] {1, 0}) {
            if (blocks(days, shots, true) <= ROOM) {
                return new Plan(shots, true, days.size());
            }
        }
        // A heading and one block of words for each day: 240 days.
        return new Plan(0, true, ROOM / 2);
    }

    /** How many blocks these days take: a heading each, their words, and their photos up to the cap. */
    static int blocks(List<DaySize> days, int shotsADay, boolean wordsPerDay) {
        int blocks = 0;
        for (DaySize day : days) {
            blocks += 1 + (wordsPerDay ? Math.min(day.entries(), 1) : day.entries()) + Math.min(day.shots(), shotsADay);
        }
        return blocks;
    }
}

package app.homeport.api.activity;

import app.homeport.api.thing.ThingKind;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;

/**
 * The one way a line gets into Activity. A place that changes something calls {@link #record} inside the
 * transaction of the change, so the line is kept exactly when the change is and never for something that
 * was undone. Nobody else writes the table.
 *
 * <pre>
 * activity.record(Happened.to(list.circleId(), ActivityKind.LIST, list.id()).by(memberId).count("ticked"));
 * </pre>
 *
 * <p>Who reads a line is not decided here. A line about a thing is shown, when it is read, to whoever may
 * see that thing at that moment; a place never has to think about it. Two things are decided here, once, for
 * every place: what only its owner can see makes no line at all (there is nobody to tell, and nothing from
 * before it was shared turns up afterwards), and a line of a kind that folds is one line per person, thing
 * and day that counts up.
 */
@Service
public class ActivityLog {

    /** A burst of photos is told ten minutes after its first one, so a whole evening's upload is one push. */
    static final int PHOTO_PUSH_WAIT_MINUTES = 10;

    /** Who a line about no thing is for. A line about a thing is for whoever may see the thing. */
    public enum ShownTo {
        /** Everyone in the circle. */
        CIRCLE,
        /** The people who run the circle: its adults. */
        ADULTS,
        /** One member only. */
        ONE
    }

    /**
     * Something that happened, as a place hands it over. Start with {@link #in} or {@link #to} and add what
     * there is to say.
     *
     * @param memberId who did it: a member of the circle, also a child without a phone ("Leo fed Biscuit")
     * @param who the name of someone outside the circle who did it (a guest), when there is no member
     * @param thingId the thing it is about, or null for something about the circle itself
     * @param item a photo or video that joins a batch: the line is about all of them together
     * @param words the sentence's own words after the name, when the place has its own ("fed Biscuit and
     *     earned a star"); empty for the kind's usual words
     * @param namesThing whether the thing's title ends the sentence when the place brought its own words
     * @param note a small second line
     * @param counts small numbers the sentence is made with; a line that folds adds them up
     */
    public record Happened(
            UUID circleId,
            ActivityKind kind,
            UUID memberId,
            String who,
            UUID thingId,
            UUID item,
            String words,
            boolean namesThing,
            String note,
            Map<String, Long> counts,
            ShownTo shownTo,
            UUID onlyFor,
            UUID askId,
            Instant at) {

        /** Something about the circle itself: someone joined, a guest pass was opened. */
        public static Happened in(UUID circleId, ActivityKind kind) {
            return new Happened(
                    circleId, kind, null, "", null, null, "", false, "", Map.of(), ShownTo.CIRCLE, null, null, null);
        }

        /** Something that happened to a thing. */
        public static Happened to(UUID circleId, ActivityKind kind, UUID thingId) {
            return new Happened(
                    circleId, kind, null, "", thingId, null, "", false, "", Map.of(), ShownTo.CIRCLE, null, null, null);
        }

        /** A photo or video that came into other people's sight: it joins its owner's batch of the day. */
        public static Happened photo(UUID circleId, UUID thingId) {
            return new Happened(
                    circleId,
                    ActivityKind.PHOTOS,
                    null,
                    "",
                    null,
                    thingId,
                    "",
                    false,
                    "",
                    Map.of(),
                    ShownTo.CIRCLE,
                    null,
                    null,
                    null);
        }

        /** A thing that came into other people's sight, whatever kind it is: a photo joins a batch, anything else gets its own line. */
        public static Happened arrived(UUID circleId, ThingKind kind, UUID thingId, boolean made) {
            return kind == ThingKind.PHOTO || kind == ThingKind.VIDEO
                    ? photo(circleId, thingId)
                    : to(circleId, ActivityKind.ADDED, thingId).count(made ? "made" : "shared");
        }

        public Happened by(UUID member) {
            return new Happened(
                    circleId,
                    kind,
                    member,
                    who,
                    thingId,
                    item,
                    words,
                    namesThing,
                    note,
                    counts,
                    shownTo,
                    onlyFor,
                    askId,
                    at);
        }

        public Happened byGuest(String name) {
            return new Happened(
                    circleId,
                    kind,
                    memberId,
                    name,
                    thingId,
                    item,
                    words,
                    namesThing,
                    note,
                    counts,
                    shownTo,
                    onlyFor,
                    askId,
                    at);
        }

        /** The place's own words after the name. With {@code namesThing}, the thing's title follows them. */
        public Happened saying(String sentence, boolean thenTheThing) {
            return new Happened(
                    circleId,
                    kind,
                    memberId,
                    who,
                    thingId,
                    item,
                    sentence,
                    thenTheThing,
                    note,
                    counts,
                    shownTo,
                    onlyFor,
                    askId,
                    at);
        }

        public Happened note(String small) {
            return new Happened(
                    circleId,
                    kind,
                    memberId,
                    who,
                    thingId,
                    item,
                    words,
                    namesThing,
                    small == null ? "" : small,
                    counts,
                    shownTo,
                    onlyFor,
                    askId,
                    at);
        }

        /** One more of something: "added", "ticked". */
        public Happened count(String what) {
            return count(what, 1);
        }

        public Happened count(String what, long howMany) {
            Map<String, Long> more = new LinkedHashMap<>(counts);
            more.merge(what, howMany, Long::sum);
            return new Happened(
                    circleId,
                    kind,
                    memberId,
                    who,
                    thingId,
                    item,
                    words,
                    namesThing,
                    note,
                    more,
                    shownTo,
                    onlyFor,
                    askId,
                    at);
        }

        public Happened forAdults() {
            return new Happened(
                    circleId,
                    kind,
                    memberId,
                    who,
                    thingId,
                    item,
                    words,
                    namesThing,
                    note,
                    counts,
                    ShownTo.ADULTS,
                    null,
                    askId,
                    at);
        }

        public Happened onlyFor(UUID member) {
            return new Happened(
                    circleId,
                    kind,
                    memberId,
                    who,
                    thingId,
                    item,
                    words,
                    namesThing,
                    note,
                    counts,
                    ShownTo.ONE,
                    member,
                    askId,
                    at);
        }

        public Happened ask(UUID ask) {
            return new Happened(
                    circleId,
                    kind,
                    memberId,
                    who,
                    thingId,
                    item,
                    words,
                    namesThing,
                    note,
                    counts,
                    shownTo,
                    onlyFor,
                    ask,
                    at);
        }

        /** When it happened, for what is written down after the fact (the sample data). Now, when left out. */
        public Happened at(Instant moment) {
            return new Happened(
                    circleId,
                    kind,
                    memberId,
                    who,
                    thingId,
                    item,
                    words,
                    namesThing,
                    note,
                    counts,
                    shownTo,
                    onlyFor,
                    askId,
                    moment);
        }
    }

    private final ActivityStore store;

    ActivityLog(ActivityStore store) {
        this.store = store;
    }

    /**
     * Keeps a line. Call it inside the transaction of the change it is about. Nothing is kept for a thing
     * only its owner can see. Returns the line's id, or null when no line was kept.
     */
    public UUID record(Happened happened) {
        Instant at = happened.at() == null ? Instant.now() : happened.at();
        LocalDate day = at.atZone(ZoneOffset.UTC).toLocalDate();
        UUID about = happened.item() != null ? happened.item() : happened.thingId();
        // One line per person, thing, kind and day for a kind that folds (and per sentence, where a place
        // brought its own words: feeding Biscuit and setting the table are two lines); a line of its own otherwise.
        String foldKey = happened.kind().folds()
                ? String.join(
                        ":",
                        happened.kind().code(),
                        String.valueOf(happened.memberId()),
                        String.valueOf(happened.thingId()),
                        day.toString(),
                        happened.words() == null ? "" : happened.words())
                : UUID.randomUUID().toString();
        UUID line = store.insert(happened, about, foldKey, day, at);
        if (line != null && happened.item() != null) {
            store.addItem(line, happened.item(), at, PHOTO_PUSH_WAIT_MINUTES);
        }
        return line;
    }
}

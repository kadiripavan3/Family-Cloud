package app.homeport.api.activity;

import app.homeport.api.common.ApiProblem;
import app.homeport.api.common.Codes;
import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/**
 * The kinds of line Activity has. Each is one sentence shape; the app can pick a look by the word.
 *
 * <p>A kind that {@link #folds} is kept once per person, thing and day and counts up ("9 things added, 5
 * ticked"); two people's lines about the same thing on the same day are read as one ("Alex and Mia changed
 * Groceries"). The others are one line each time they happen.
 */
public enum ActivityKind {
    /** A thing came into other people's sight: made as shared, or shared with more people. "Alex added Dentist". */
    ADDED(true),
    /** Lines were added to a list, or ticked on it. "Alex and Mia changed Groceries". */
    LIST(true),
    /** A batch of photos and videos: one line however many. "Alex added 19 photos to Saturday at the lake". */
    PHOTOS(true),
    /** A bill, or a share of one, was paid. "Alex paid Electricity". */
    PAID(true),
    /** Something was done on a template that does work, in the template's own words. "Leo fed Biscuit and earned a star". */
    BOARD(true),
    /** A guest opened their pass. "Ines opened her guest pass". */
    GUEST_PASS(false),
    /** Someone joined the circle. */
    JOINED(false),
    /** Someone left the circle, or was taken out of it. */
    LEFT(false),
    /** Someone asks to see something of yours they can't open. Only its owner gets this line. */
    ASK(false),
    /** The answer to an ask. Only whoever asked gets this line. */
    ASK_ANSWERED(false),
    /** The export someone asked for can be fetched. Only they get this line. */
    EXPORT(false),
    /** Something arrived from Journey. "Iceland ring road was kept from Journey". */
    KEPT(false),
    /** Something is due today or tomorrow. Never stored: laid into the answer from what the places say is due. */
    DUE(false);

    private final boolean folds;

    ActivityKind(boolean folds) {
        this.folds = folds;
    }

    public boolean folds() {
        return folds;
    }

    @JsonValue
    public String code() {
        return Codes.of(this);
    }

    @JsonCreator
    public static ActivityKind of(String code) {
        return Codes.parse(
                ActivityKind.class,
                code,
                () -> ApiProblem.badRequest("invalid_kind", "That isn't a kind of activity."));
    }

    /** From a database column. */
    public static ActivityKind read(String code) {
        return Codes.read(ActivityKind.class, code);
    }
}

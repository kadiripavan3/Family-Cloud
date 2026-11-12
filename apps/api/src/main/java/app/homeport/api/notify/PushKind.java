package app.homeport.api.notify;

import app.homeport.api.common.Codes;

/**
 * The kinds of push the API sends, each with what it says to someone who hides details in notifications:
 * that there is news of this kind, never whose, which or how much. A kind with no quiet words says the same
 * to everyone, because it holds nothing to hide to begin with.
 *
 * <p>The Vault's notices have kinds of their own (they all start with {@code vault_}) and are not in this
 * list: they never name anything kept in the Vault, and the everyday switch doesn't silence them.
 */
public enum PushKind {
    /** An event that asked for a reminder is about to start. */
    EVENT_SOON("Something is coming up", "Open to see what"),
    /** A reminder is due, or it is your turn. */
    REMINDER_DUE("A reminder is due", "Open to see which one"),
    /** Whoever made a reminder nudges whoever has it. */
    REMINDER_NUDGE("A gentle nudge", "Open to see what about"),
    /** A bill that asked to be remembered is coming up. */
    BILL_DUE("A bill is due", "Open to see which one"),
    /** Someone added a batch of photos you may see. Once per burst. */
    PHOTOS("New photos", "Open to see them"),
    /** Something was shared with you by name. */
    SHARED("Something was shared with you", "Open to see what"),
    /** Someone asks to see something of yours. It never names the thing. */
    ASK(null, null),
    /** The answer to what you asked. It never names the thing. */
    ASK_ANSWERED(null, null),
    /** Someone reminds you of what you owe in a split. */
    MONEY_REMINDER("A reminder about money", "Open to see what"),
    /** The export you asked for can be fetched. */
    EXPORT_READY(null, null),
    /** The Sunday summary. Has its own switch. */
    WEEKLY_SUMMARY("Your week is ready", "Open to see it");

    private final String quietTitle;
    private final String quietBody;

    PushKind(String quietTitle, String quietBody) {
        this.quietTitle = quietTitle;
        this.quietBody = quietBody;
    }

    public String code() {
        return Codes.of(this);
    }

    public String quietTitle() {
        return quietTitle;
    }

    public String quietBody() {
        return quietBody;
    }
}

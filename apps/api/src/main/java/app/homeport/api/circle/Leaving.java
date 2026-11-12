package app.homeport.api.circle;

import app.homeport.api.circle.MemberStore.MemberRow;

/**
 * What a place has to undo when someone leaves a circle, or is taken out of it. The spine does what is the
 * same for every kind of thing (what was only theirs goes with them; what they shared stays, in their name;
 * nothing is shared with them any more). A place whose things need more than that implements this and is
 * found by itself: the Vault takes back the keys to the passwords they shared, because a password of
 * someone who has left must stop working for the people who stay.
 */
public interface Leaving {

    /** How many of this member's things will stop working for the others when they go: what the screen says before. */
    int stops(MemberRow member);

    /** Called in the transaction in which the member goes, before they are marked as gone. */
    void left(MemberRow member);
}

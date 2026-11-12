package app.homeport.api.common;

/**
 * The rules about who may see what, written once as SQL conditions. Every query that reads a thing for someone
 * (a page, a photo, an event, a bill, a password) uses these, so a rule can't be right in one place and
 * forgotten in another.
 *
 * <p>In words: you see a thing when you are in its circle and
 *
 * <ul>
 *   <li>it is yours, or
 *   <li>it is shared with you: with everyone in the circle, or with some people and you are one of them,
 *       and it is not hidden from you today.
 * </ul>
 *
 * Two parts of "everyone in the circle" are narrower than they sound. A guest of the circle sees only what
 * was shared with them by name. A teen or a child doesn't see Money or the Vault unless a thing there was
 * shared with them by name.
 */
public final class Rules {

    private Rules() {}

    /**
     * True when the viewer is a member of this circle who has joined it.
     *
     * @param circle the column holding the circle's id, such as {@code "c.id"}
     * @param viewer the parameter holding the viewer's user id, such as {@code ":me"}
     */
    public static String inCircle(String circle, String viewer) {
        return "exists (select 1 from members im where im.circle_id = %s and im.user_id = %s and im.status = 'joined')"
                .formatted(circle, viewer);
    }

    /** The part of the rule that is the same for seeing and for changing: shared with this member, and not hidden today. */
    private static String sharedWith(String thing, String member, String shareCondition) {
        return ("((((%1$s.audience = 'circle' and %2$s.role <> 'guest'"
                        + " and not (%2$s.role in ('teen', 'child') and %1$s.place in ('money', 'vault'))%3$s)"
                        + " or (%1$s.audience <> 'me' and exists (select 1 from thing_shares ts where ts.thing_id = %1$s.id"
                        + " and ts.member_id = %2$s.id%4$s)))"
                        + " and not exists (select 1 from thing_hides th where th.thing_id = %1$s.id"
                        + " and th.member_id = %2$s.id and (th.through is null or th.through >= current_date))))")
                .formatted(
                        thing,
                        member,
                        shareCondition.isEmpty() ? "" : " and " + thing + ".everyone_edits",
                        shareCondition);
    }

    /**
     * True when the viewer may see the thing.
     *
     * @param thing the alias of the things table in the query, such as {@code "t"}
     * @param viewer the parameter holding the viewer's user id, such as {@code ":me"}
     */
    public static String sees(String thing, String viewer) {
        return ("exists (select 1 from members vm where vm.circle_id = %1$s.circle_id and vm.user_id = %2$s"
                        + " and vm.status = 'joined' and (%1$s.owner_id = vm.id or " + sharedWith(thing, "vm", "")
                        + "))")
                .formatted(thing, viewer);
    }

    /**
     * True when the viewer may change the thing: it is theirs, or it was shared with them to edit (by name, or
     * with everyone in a circle whose things everyone may edit), and it is not hidden from them.
     */
    public static String edits(String thing, String viewer) {
        return ("exists (select 1 from members vm where vm.circle_id = %1$s.circle_id and vm.user_id = %2$s"
                        + " and vm.status = 'joined' and (%1$s.owner_id = vm.id or "
                        + sharedWith(thing, "vm", " and ts.can_edit") + "))")
                .formatted(thing, viewer);
    }

    /**
     * True when this member (not the signed-in person: any member, such as a child without a phone) may see
     * the thing. For lists of "who can see this" and for what a person's page gathers.
     *
     * @param thing the alias of the things table
     * @param member the alias of the members table row to test
     */
    public static String memberSees(String thing, String member) {
        return "(%1$s.owner_id = %2$s.id or %3$s)".formatted(thing, member, sharedWith(thing, member, ""));
    }

    /** True when the viewer owns the thing: only its owner decides who sees it, and only its owner deletes it. */
    public static String owns(String thing, String viewer) {
        return ("exists (select 1 from members om where om.id = %1$s.owner_id and om.user_id = %2$s"
                        + " and om.status = 'joined')")
                .formatted(thing, viewer);
    }
}

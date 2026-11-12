package app.homeport.api.plan;

import java.util.List;
import java.util.UUID;

/**
 * Whose turn it is. The people who take turns stand in an order; the reminder points at one of them, and
 * each tick moves the pointer to the next, round and round. Someone who left the circle drops out of the
 * order; if it was their turn, it is the first person's.
 */
final class Turns {

    private Turns() {}

    /** Whose turn it is now, or null when nobody takes turns. */
    static UUID now(UUID pointer, List<UUID> order) {
        if (order.isEmpty()) {
            return null;
        }
        return pointer != null && order.contains(pointer) ? pointer : order.get(0);
    }

    /** Whose turn it is after this many more ticks. */
    static UUID after(UUID pointer, List<UUID> order, int ticks) {
        UUID now = now(pointer, order);
        if (now == null) {
            return null;
        }
        return order.get(Math.floorMod(order.indexOf(now) + ticks, order.size()));
    }

    /** Who had the turn before this one: where the pointer goes back to when a tick is taken away. */
    static UUID before(UUID pointer, List<UUID> order) {
        return after(pointer, order, -1);
    }
}

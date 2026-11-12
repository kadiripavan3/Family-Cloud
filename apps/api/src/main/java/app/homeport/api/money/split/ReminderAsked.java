package app.homeport.api.money.split;

import java.util.UUID;

/**
 * Someone tapped "Remind" next to what another person owes in a split. Money keeps the time of it; whoever
 * sends notifications listens for this and tells the person (Money itself sends nothing).
 *
 * @param thingId the split
 * @param toMemberId who is reminded: the one who owes
 * @param byMemberId who asked
 * @param cents what they owe, by the fewest payments that settle everything
 */
public record ReminderAsked(
        UUID circleId, UUID thingId, String title, UUID toMemberId, UUID byMemberId, long cents, String currency) {}

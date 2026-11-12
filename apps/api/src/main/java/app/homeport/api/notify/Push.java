package app.homeport.api.notify;

import java.time.Instant;
import java.util.UUID;

/**
 * One push for one person, as whoever has the news hands it to the {@link Outbox}. Build one with
 * {@link #to} (or {@link #safety} for news about someone's safety) and say what it is about:
 *
 * <pre>
 * outbox.tell(Push.to(userId, PushKind.BILL_DUE, "Electricity is due tomorrow", "€84.20", "/bill/" + id)
 *         .about(circleId, billId)
 *         .once("bill_due:" + dueId + ":" + memberId));
 * </pre>
 *
 * @param url where in the app it opens: an app path such as {@code /bill/<id>}
 * @param circleId the circle it happened in: someone who has left it, or muted it, isn't told
 * @param thingId the thing it is about: it is only sent to someone who may see that thing at that moment
 * @param actorId the member who caused it: nobody is pushed their own changes
 * @param quietTitle what it says to someone who hides details; null with a null body: the same as to everyone
 * @param always true for news about someone's safety, which the everyday switch doesn't silence
 * @param onceKey the same key is never told twice
 * @param sendAfter not before this moment; null for now
 * @param lineId for a batch that is counted when it is sent: the line of Activity it counts
 * @param since from when it counts
 */
public record Push(
        UUID userId,
        String kind,
        String title,
        String body,
        String url,
        UUID circleId,
        UUID thingId,
        UUID actorId,
        String quietTitle,
        String quietBody,
        boolean always,
        String onceKey,
        Instant sendAfter,
        UUID lineId,
        Instant since) {

    /** An everyday push of one of the known kinds, with that kind's quiet words. */
    public static Push to(UUID userId, PushKind kind, String title, String body, String url) {
        return new Push(
                userId,
                kind.code(),
                title,
                body,
                url,
                null,
                null,
                null,
                kind.quietTitle(),
                kind.quietBody(),
                false,
                null,
                null,
                null,
                null);
    }

    /** News about someone's safety (the Vault's): told whatever the everyday switch says, to everyone the same. */
    public static Push safety(UUID userId, String kind, String title, String body, String url) {
        return new Push(userId, kind, title, body, url, null, null, null, null, null, true, null, null, null, null);
    }

    public Push about(UUID circle, UUID thing) {
        return new Push(
                userId,
                kind,
                title,
                body,
                url,
                circle,
                thing,
                actorId,
                quietTitle,
                quietBody,
                always,
                onceKey,
                sendAfter,
                lineId,
                since);
    }

    public Push by(UUID actorMemberId) {
        return new Push(
                userId,
                kind,
                title,
                body,
                url,
                circleId,
                thingId,
                actorMemberId,
                quietTitle,
                quietBody,
                always,
                onceKey,
                sendAfter,
                lineId,
                since);
    }

    /** Other quiet words than the kind's own: "A bill is due tomorrow" keeps its day. */
    public Push quiet(String title, String body) {
        return new Push(
                userId,
                kind,
                this.title,
                this.body,
                url,
                circleId,
                thingId,
                actorId,
                title,
                body,
                always,
                onceKey,
                sendAfter,
                lineId,
                since);
    }

    public Push once(String key) {
        return new Push(
                userId,
                kind,
                title,
                body,
                url,
                circleId,
                thingId,
                actorId,
                quietTitle,
                quietBody,
                always,
                key,
                sendAfter,
                lineId,
                since);
    }

    public Push after(Instant moment) {
        return new Push(
                userId,
                kind,
                title,
                body,
                url,
                circleId,
                thingId,
                actorId,
                quietTitle,
                quietBody,
                always,
                onceKey,
                moment,
                lineId,
                since);
    }

    /** A batch counted when it is sent: the words given here are only what it says if nothing can count it. */
    public Push counting(UUID line, Instant from) {
        return new Push(
                userId,
                kind,
                title,
                body,
                url,
                circleId,
                thingId,
                actorId,
                quietTitle,
                quietBody,
                always,
                onceKey,
                sendAfter,
                line,
                from);
    }
}

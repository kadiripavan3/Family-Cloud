package app.homeport.api.notify;

import org.springframework.stereotype.Component;

/**
 * The one way a push leaves the API. Whoever has news for someone hands it here, inside the transaction of
 * the thing the news is about, so a push is queued exactly when that thing is kept and never for something
 * that was undone. A job ({@link PushDelivery}) sends what is waiting, once, and checks everything again at
 * that moment: the person's settings, that they are still in the circle, and that they may still see the
 * thing (it may have been hidden from them in between).
 *
 * <p><b>What is never pushed.</b> Few, and each one useful:
 *
 * <ul>
 *   <li><b>Your own changes.</b> A push that names the member who caused it is not queued for that member.
 *   <li><b>Anything in a circle you muted</b> ({@code PUT /v1/circles/{id}/mute}), and anything at all with
 *       "notifications" switched off. Only news about your safety (the Vault's: someone asked for your Vault,
 *       a recovery of it was started) is told all the same.
 *   <li><b>More than one of a kind about the same thing within an hour.</b> Three people sharing, changing
 *       and asking about one thing in an afternoon are one push each kind, not nine. A push that carries a
 *       key of its own (this bill, due this day; this reminder, due at this moment) is told exactly once per
 *       key instead.
 *   <li><b>Anything about a thing you may not see when it is sent</b>, and so never a plan to the person it
 *       is hidden from.
 *   <li><b>Details, to someone who hides them:</b> "A bill is due tomorrow", never which or how much. A
 *       push about the Vault never names the item, whatever the setting.
 *   <li><b>A photo at a time.</b> A burst of photos is one push, sent ten minutes after its first photo.
 *   <li><b>What only changes a count</b>: a tick on a list, a line added, a heart. Activity shows those;
 *       nobody's phone buzzes for them.
 *   <li><b>A goodnight before bedtime.</b> One recorded during the day waits for the circle's bedtime on the
 *       evening it is meant for, and is then told once to everyone else who may see it.
 *   <li><b>A journey as such.</b> A journey kept from Journey, a trip that became one, a draft that left for
 *       it: Activity has a line for each. The photos a kept journey brings are told as the one burst they are.
 *   <li><b>A second nudge the same day.</b> A nudge about a template (find a date: "tap the days you can") is
 *       told once a day for each person and board, whoever asks and however often.
 * </ul>
 */
@Component
public class Outbox {

    private final OutboxStore store;

    Outbox(OutboxStore store) {
        this.store = store;
    }

    /** Puts a push in line. Returns false when it is one of those that are never pushed (see above). */
    public boolean tell(Push push) {
        return store.insert(push);
    }
}

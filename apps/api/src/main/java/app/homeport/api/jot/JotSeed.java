package app.homeport.api.jot;

import app.homeport.api.list.ChecklistService;
import app.homeport.api.list.ChecklistService.ItemChange;
import app.homeport.api.list.ChecklistService.NewItem;
import app.homeport.api.seed.SeedWorld;
import app.homeport.api.seed.Seeder;
import app.homeport.api.thing.Audience;
import app.homeport.api.thing.ThingService;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.UUID;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * What Nora jotted today, as the Jot screens draw it: milk and bread at 8:12, a note at 8:40, then four
 * lines just now, one of them a gate code that is being held back. Groceries is the Linds' shopping list,
 * Alex is using it at the shop, and the chips offer what the family adds most.
 */
@Component
@ConditionalOnProperty(name = "homeport.seed.enabled", havingValue = "true")
class JotSeed implements Seeder {

    private static final String ZONE = "Europe/Ljubljana";

    private final JotService jots;
    private final JotStore store;
    private final ChecklistService checklists;
    private final ThingService things;

    JotSeed(JotService jots, JotStore store, ChecklistService checklists, ThingService things) {
        this.jots = jots;
        this.store = store;
        this.checklists = checklists;
        this.things = things;
    }

    /** After Plan: the reminder that goes with the shopping list is made there. */
    @Override
    public int order() {
        return 11;
    }

    @Override
    public void seed(SeedWorld w) {
        UUID linds = w.circle("linds");
        UUID nora = w.user("nora");
        UUID alex = w.user("alex");
        UUID noraHere = w.member("linds", "nora");
        LocalDate today = LocalDate.now(ZoneId.of(ZONE));

        // Groceries: what was on it before today, then what Nora jots.
        UUID groceries = checklists
                .create(alex, linds, JotService.SHOPPING_LIST, Audience.CIRCLE, List.of(), UUID.randomUUID())
                .id();
        store.markShoppingList(linds, groceries, w.member("linds", "alex"));
        for (String line : List.of("Bananas", "Strawberries", "Butter", "Coffee", "Oat milk")) {
            UUID added = checklists
                    .add(groceries, alex, new NewItem(line, null, null, null, null), UUID.randomUUID())
                    .id();
            if (line.equals("Butter")) {
                checklists.change(
                        added, alex, new ItemChange(null, null, null, null, null, null, null, true, null, null));
            }
        }
        store.use(w.member("linds", "alex"), groceries); // Alex is at the shop
        w.jdbc()
                .sql("""
                    select t.id from things t where t.circle_id = :circle and t.kind = 'reminder' and t.title = 'Milk and bread'
                    """)
                .param("circle", linds)
                .query(UUID.class)
                .optional()
                .ifPresent(reminder -> things.link(reminder, groceries, nora));

        // What the family added most in the last weeks: the chips Milk, Eggs, Bread, Coffee.
        int weeksAgo = 1;
        for (String line :
                List.of("Milk", "Eggs", "Bread", "Coffee", "Milk", "Eggs", "Bread", "Milk", "Eggs", "Coffee", "Milk")) {
            UUID old = store.insert(
                    linds,
                    noraHere,
                    UUID.randomUUID(),
                    0,
                    JotSource.WIDGET,
                    line,
                    ReadAs.LIST_ITEM,
                    line,
                    groceries,
                    null);
            at(
                    w,
                    old,
                    today.minusDays(3L * weeksAgo++)
                            .atTime(17, 30)
                            .atZone(ZoneId.of(ZONE))
                            .toInstant());
        }

        UUID morning = UUID.randomUUID();
        jots.jot(linds, nora, "Milk, bread", today, ZONE, JotSource.NOTIFICATION, null, morning);
        UUID note = UUID.randomUUID();
        jots.jot(linds, nora, "Mia needs €5 for the class photo", today, ZONE, JotSource.NOTIFICATION, null, note);
        w.jdbc()
                .sql("update jots set created_at = :at where batch_id = :batch")
                .param("at", stamp(today, 8, 12))
                .param("batch", morning)
                .update();
        w.jdbc()
                .sql("update jots set created_at = :at where batch_id = :batch")
                .param("at", stamp(today, 8, 40))
                .param("batch", note)
                .update();

        // Four lines just now.
        jots.jot(
                linds,
                nora,
                "Call the plumber tomorrow at 9",
                today,
                ZONE,
                JotSource.NOTIFICATION,
                null,
                UUID.randomUUID());
        jots.jot(linds, nora, "Eggs", today, ZONE, JotSource.NOTIFICATION, null, UUID.randomUUID());
        jots.jot(
                linds,
                nora,
                "Remind Alex about the car service at 6",
                today,
                ZONE,
                JotSource.NOTIFICATION,
                null,
                UUID.randomUUID());
        jots.jot(linds, nora, "Gate code 4471", today, ZONE, JotSource.NOTIFICATION, null, UUID.randomUUID());

        // Every way in is on for Nora, as the switches show.
        jots.saveWays(linds, nora, new JotService.WaysChange(true, true, true, null, null, null, false));
    }

    private static java.sql.Timestamp stamp(LocalDate day, int hour, int minute) {
        return java.sql.Timestamp.from(
                day.atTime(hour, minute).atZone(ZoneId.of(ZONE)).toInstant());
    }

    private static void at(SeedWorld w, UUID jot, java.time.Instant when) {
        w.jdbc()
                .sql("update jots set created_at = :at where id = :id")
                .param("at", java.sql.Timestamp.from(when))
                .param("id", jot)
                .update();
    }
}

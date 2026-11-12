package app.homeport.api.money.split;

import app.homeport.api.home.SwitcherSource;
import app.homeport.api.money.Cash;
import app.homeport.api.money.split.SplitService.Owed;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Component;

/** What splitting costs says in the circle switcher: "you're owed €64", or "you owe €12". */
@Component
class SplitSwitcher implements SwitcherSource {

    private final SplitService splits;

    SplitSwitcher(SplitService splits) {
        this.splits = splits;
    }

    @Override
    public Optional<String> line(UUID circleId, UUID me) {
        List<Owed> owed = splits.owed(circleId, me);
        if (owed.isEmpty()) {
            return Optional.empty();
        }
        // One currency is the usual; with more, the first is said and the split's own screen has the rest.
        Owed first = owed.get(0);
        return Optional.of((first.cents() > 0 ? "you're owed " : "you owe ")
                + Cash.round(Math.abs(first.cents()), first.currency()));
    }
}
